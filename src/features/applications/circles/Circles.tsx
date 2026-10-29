"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import type { SessionSlot } from "@/lib/admissions/availability";
import { changesBetween, freeGroupName, placementOrder } from "@/lib/applications/arrange/changes";
import type { ArrangementOptionsView, CirclesView, RingOption, RingPerson } from "@/lib/applications/arrange/view";
import { own } from "@/lib/applications/keys";
import { lengthWords } from "@/lib/courses/sessionLength";
import { groupsViewPath } from "../groups/GroupsViews";
import { notMovedWords } from "../groups/peopleInGroupsWords";
import AskClaude, { type ScreenGroup, type Turn } from "./AskClaude";
import GroupCampusPicker from "../groups/GroupCampusPicker";
import styles from "./Circles.module.css";
import { canMakeHere, draftOf, liveFacts, liveRings, optionFromLive, previewRings, warningsFor, type DrawnRing } from "./circlesModel";
import * as W from "./circlesWords";
import PersonPanel, { type Start } from "./PersonPanel";
import Ring from "./Ring";

/**
 * CIRCLES, a view of a programme's Groups tab, for an admin.
 *
 * IT OPENS ON THE RUN'S GROUPS AS THEY ARE: one ring for each live group with
 * the people in it now and its facilitators, "Not in a group" for everybody
 * on the run's list in none, and a line naming anybody who holds a place but
 * is not on that list yet. Once the run has been published, a person Publish
 * has not told their group is marked "Not told yet".
 *
 * EVERY CHANGE ON THE RUN AS IT IS SAVES STRAIGHT AWAY, through the site's
 * own routes, then reads the groups again (`/circles`): a move is one
 * placement to the allocate route, as People in groups sends it; a
 * facilitator who offered is added through the group's facilitators route
 * (somebody who did not offer is asked first, from Facilitators); a group is
 * added, or given a time nobody has been told, through the programme's
 * groups routes. A refusal is said in the board's own words. Somebody who
 * facilitates a group is never moved: the panel says to change who
 * facilitates it first.
 *
 * A SUGGESTION IS A PREVIEW over the rings ("Suggest groups", or "Suggest
 * with Claude"): up to five options, each keeping everybody where they are
 * and each facilitator in their group (unless "Start again" lets the placed
 * and untold move), with what would change highlighted. Moving somebody in a
 * preview changes the preview only. "Apply N changes" lists every change
 * before the press and sends only those (`arrange/changes.ts`): new groups and
 * times, then places, then facilitators who offered. On a refusal it stops,
 * reads the groups again and says per person what saved and what did not;
 * pressing Apply again sends what is left.
 *
 * Nobody is emailed by anything here: Publish tells people their group.
 */

type Preview = {
  view: ArrangementOptionsView;
  working: Record<string, RingOption>;
  active: string;
};

type Said = { ok: boolean; lines: string[] };

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, data, error: typeof data.error === "string" ? data.error : `It answered ${response.status}.` };
}

const rejectedOf = (data: Record<string, unknown>) =>
  Array.isArray(data.rejected) ? (data.rejected as { uid: string; reason: string }[]) : [];

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

const copyOf = (option: RingOption): RingOption => ({
  ...option,
  groups: option.groups.map((group) => ({
    ...group,
    memberUids: [...group.memberUids],
    facilitators: group.facilitators.map((f) => ({ ...f })),
  })),
});

export default function Circles({ initial }: { initial: CirclesView }) {
  const hydrated = useHydrated();
  const [live, setLive] = useState(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [startAgain, setStartAgain] = useState(false);
  const [phase, setPhase] = useState<"idle" | "saving" | "suggesting" | "applying">("idle");
  const [chatting, setChatting] = useState(false);
  const [notice, setNotice] = useState<Said | null>(null);
  const [results, setResults] = useState<{ ok: boolean; text: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newDay, setNewDay] = useState(1);
  const [newStart, setNewStart] = useState(18 * 60);
  const [timing, setTiming] = useState<{ key: string; day: number; start: number } | null>(null);

  const base = `/api/admissions/forms/${encodeURIComponent(live.roundId)}/programmes/${encodeURIComponent(live.programmeId)}`;
  const facilitatorsHref = groupsViewPath(live.roundId, live.programmeId, "facilitators");
  const settingsHref = `/admin/admissions/forms/${encodeURIComponent(live.roundId)}/programmes/${encodeURIComponent(live.programmeId)}/setup`;
  const busy = !hydrated || phase !== "idle" || chatting;

  const option = preview ? (own(preview.working, preview.active) ?? null) : null;
  const people: Record<string, RingPerson> = useMemo(
    () => (preview ? { ...preview.view.people, ...live.people } : live.people),
    [preview, live.people],
  );
  const rings: DrawnRing[] = useMemo(
    () => (option ? previewRings(option, live, people) : liveRings(live)),
    [option, live, people],
  );
  const near = useMemo(() => new Set(option?.nearUids ?? []), [option]);
  const ringOf = (uid: string) => rings.find((ring) => ring.memberUids.includes(uid)) ?? null;
  const byName = (a: string, b: string) => (own(people, a)?.name ?? "").localeCompare(own(people, b)?.name ?? "", "en");
  const outside = Object.keys(people)
    .filter((uid) => !rings.some((ring) => ring.memberUids.includes(uid)))
    .sort(byName);
  const nameOf = (uid: string) => own(people, uid)?.name ?? W.SOMEBODY;
  const gridStart = live.grid.startMinute;
  const gridEnd = live.grid.endMinute;
  const sessionMinutes = minutes || 120;

  // The live counts over the rings.
  const onList = Object.keys(live.people).length;
  const inAGroup = Object.values(live.people).filter((person) => person.groupId !== null).length;
  const untold = live.published
    ? Object.values(live.people).filter((person) => person.groupId !== null && !person.told).length
    : null;
  const movable = Object.values(live.people).filter(
    (person) => person.groupId !== null && !person.told && person.appointed.length === 0,
  ).length;

  // What Apply would send, worked out from the preview and the run as it is.
  const facts = useMemo(() => liveFacts(live), [live]);
  const draft = useMemo(() => (option ? draftOf(option, live) : null), [option, live]);
  const changes = useMemo(() => (draft ? changesBetween(facts, draft) : null), [draft, facts]);
  const applies = Boolean(live.sent && live.runId && preview && !preview.view.preview);

  const reread = async (): Promise<CirclesView | null> => {
    try {
      const response = await fetch(`${base}/circles?minutes=${encodeURIComponent(String(minutes))}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { circles?: CirclesView };
      if (!response.ok || !data.circles) return null;
      setLive(data.circles);
      return data.circles;
    } catch {
      return null;
    }
  };

  /** One change to the run as it is: sent, then the groups read again, then what happened said. */
  const save = async (act: () => Promise<Said>) => {
    setPhase("saving");
    setNotice(null);
    setResults([]);
    try {
      const said = await act();
      const fresh = await reread();
      setNotice(fresh ? said : { ok: false, lines: [...said.lines, W.READ_AGAIN_FAILED] });
    } catch {
      setNotice({ ok: false, lines: [W.CONNECTION] });
    } finally {
      setPhase("idle");
    }
  };

  const allocate = (placements: { uid: string; groupId: string | null }[]) =>
    send(`/api/courses/runs/${encodeURIComponent(live.runId ?? "")}/allocate`, "POST", { placements });

  const liveName = (groupId: string | null) => live.groups.find((group) => group.id === groupId)?.name ?? W.A_GROUP;

  const moveLive = (uid: string, groupId: string | null) =>
    save(async () => {
      const answer = await allocate([{ uid, groupId }]);
      if (!answer.ok) return { ok: false, lines: [answer.error] };
      const refused = rejectedOf(answer.data);
      if (refused.length > 0) {
        const where = groupId ? liveName(groupId) : liveName(own(live.people, uid)?.groupId ?? null);
        return { ok: false, lines: refused.map((r) => notMovedWords(nameOf(r.uid), where, r.reason)) };
      }
      return { ok: true, lines: [W.movedWords(nameOf(uid), groupId ? liveName(groupId) : null)] };
    });

  const facilitateLive = (ring: DrawnRing, uid: string, add: boolean) => {
    if (!ring.id) return;
    if (!add && !window.confirm(W.STOP_CONFIRM(nameOf(uid), ring.name))) return;
    const groupId = ring.id;
    void save(async () => {
      const current = live.groups.find((group) => group.id === groupId)?.facilitators.map((f) => f.uid) ?? [];
      const uids = add ? [...new Set([...current, uid])] : current.filter((each) => each !== uid);
      const answer = await send(`/api/courses/groups/${encodeURIComponent(groupId)}/facilitators`, "POST", { uids });
      return answer.ok
        ? { ok: true, lines: [W.facilitatorSavedWords(nameOf(uid), ring.name, add)] }
        : { ok: false, lines: [answer.error] };
    });
  };

  const addGroupLive = (session: SessionSlot, withUid: string | null) =>
    save(async () => {
      const name = freeGroupName(live.groups.map((group) => group.name));
      const made = await send(`${base}/groups`, "POST", {
        name,
        weekday: session.weekday,
        start: session.startTimeLocal,
        minutes: session.durationMinutes,
        places: live.size,
      });
      const id = typeof made.data.groupId === "string" ? made.data.groupId : null;
      if (!made.ok || !id) return { ok: false, lines: [W.RESULT.groupFailed(name, made.error)] };
      const lines = [W.groupAddedWords(name, session)];
      if (!withUid) return { ok: true, lines };
      const placed = await allocate([{ uid: withUid, groupId: id }]);
      const refused = placed.ok ? rejectedOf(placed.data) : [];
      if (!placed.ok) return { ok: false, lines: [...lines, placed.error] };
      if (refused.length > 0) return { ok: false, lines: [...lines, ...refused.map((r) => notMovedWords(nameOf(r.uid), name, r.reason))] };
      return { ok: true, lines: [...lines, W.movedWords(nameOf(withUid), name)] };
    });

  const timeLive = (ring: DrawnRing, day: number, start: number) => {
    if (!ring.id || !ring.slot) return;
    const groupId = ring.id;
    const slot = ring.slot;
    const session: SessionSlot = { weekday: day, startTimeLocal: hhmm(start), durationMinutes: ring.session?.durationMinutes ?? sessionMinutes };
    void save(async () => {
      const answer = await send(`${base}/groups/${encodeURIComponent(groupId)}/time`, "PUT", {
        weekday: day,
        start: session.startTimeLocal,
        from: slot,
      });
      setTiming(null);
      return answer.ok ? { ok: true, lines: [W.timeSavedWords(ring.name, session)] } : { ok: false, lines: [W.RESULT.timeFailed(ring.name, answer.error)] };
    });
  };

  // -------------------------------------------------------------------------
  // The preview
  // -------------------------------------------------------------------------

  const suggest = async (askClaude: boolean) => {
    setPhase("suggesting");
    setError(null);
    setResults([]);
    setNotice(null);
    setSelected(null);
    try {
      const answer = await send(`${base}/arrangement`, "POST", { askClaude, minutes: String(minutes), startAgain });
      if (!answer.ok) {
        setError(answer.error);
        return;
      }
      const next = answer.data.arrangement as ArrangementOptionsView;
      setPreview({
        view: next,
        working: Object.fromEntries(next.options.map((each) => [each.key, copyOf(each)])),
        active: next.options.find((each) => each.preferred)?.key ?? next.options[0]?.key ?? "",
      });
    } catch {
      setError(W.CONNECTION);
    } finally {
      setPhase("idle");
    }
  };

  /** Change the option on screen, never the one that was sent. */
  const change = (edit: (draftOption: RingOption) => void) => {
    if (!preview || !option) return;
    const next = copyOf(option);
    edit(next);
    setPreview({ ...preview, working: { ...preview.working, [next.key]: next } });
    setResults([]);
  };

  const movePreview = (uid: string, key: string | null) =>
    change((next) => {
      for (const group of next.groups) {
        if (!group.memberUids.includes(uid)) continue;
        group.memberUids = group.memberUids.filter((each) => each !== uid);
        // A facilitator sits in the group they facilitate.
        group.facilitators = group.facilitators.filter((f) => f.uid !== uid);
      }
      next.groups.find((group) => group.key === key)?.memberUids.push(uid);
    });

  const setRole = (uid: string, role: "lead" | "second" | null) =>
    change((next) => {
      const group = next.groups.find((each) => each.memberUids.includes(uid));
      if (!group) return;
      group.facilitators = group.facilitators.filter((f) => f.uid !== uid && (role === null || f.role !== role));
      if (role) {
        group.facilitators.push({ uid, role, offered: own(people, uid)?.offered ?? false, why: "", bySite: false });
        group.facilitators.sort((a, b) => (a.role === b.role ? 0 : a.role === "lead" ? -1 : 1));
      }
    });

  const addGroupPreview = (session: SessionSlot, withUid: string | null) =>
    change((next) => {
      if (withUid) {
        for (const group of next.groups) {
          group.memberUids = group.memberUids.filter((each) => each !== withUid);
          group.facilitators = group.facilitators.filter((f) => f.uid !== withUid);
        }
      }
      let n = next.groups.length + 1;
      while (next.groups.some((group) => group.key === `${next.key}${n}`)) n += 1;
      next.groups.push({
        key: `${next.key}${n}`,
        id: null,
        name: freeGroupName([...live.groups.map((group) => group.name), ...next.groups.map((group) => group.name)]),
        session,
        timeIsNew: true,
        room: live.size,
        memberUids: withUid ? [withUid] : [],
        facilitators: [],
        why: "",
        canMake: Object.keys(people).filter((uid) => canMakeHere(own(people, uid), session, gridEnd)),
        existing: null,
      });
    });

  const removeGroup = (key: string) =>
    change((next) => {
      next.groups = next.groups.filter((group) => group.key !== key || group.id !== null);
    });

  const reset = () => {
    if (!preview) return;
    const sent = preview.view.options.find((each) => each.key === preview.active);
    if (sent) setPreview({ ...preview, working: { ...preview.working, [sent.key]: copyOf(sent) } });
    setSelected(null);
    setResults([]);
  };

  /** Claude's suggested moves, made in a preview: of the option they were about, or of the run as it is. */
  const previewMoves = (turn: Turn) => {
    const fromLive = turn.about === null || !preview;
    const target = fromLive ? optionFromLive(live, W.CLAUDES_MOVES, live.size) : own(preview.working, turn.about!);
    if (!target) return;
    const next = copyOf(target);
    for (const move of turn.moves) {
      for (const group of next.groups) {
        if (!group.memberUids.includes(move.uid)) continue;
        group.memberUids = group.memberUids.filter((each) => each !== move.uid);
        group.facilitators = group.facilitators.filter((f) => f.uid !== move.uid);
      }
      next.groups.find((group) => group.key === move.toKey)?.memberUids.push(move.uid);
    }
    if (fromLive) {
      const view: ArrangementOptionsView = {
        runId: live.runId,
        preview: !live.sent,
        programmeName: live.programmeName,
        programmeShortName: live.programmeShortName,
        grid: live.grid,
        minutes: sessionMinutes,
        size: live.size,
        startAgain: false,
        people: live.people,
        options: [optionFromLive(live, W.CLAUDES_MOVES, live.size)],
        asked: false,
        preferredWhy: "",
        notes: "",
        dropped: [],
        claudeConfigured: live.claudeConfigured,
      };
      setPreview({ view, working: { [next.key]: next }, active: next.key });
    } else if (preview) {
      setPreview({ ...preview, working: { ...preview.working, [next.key]: next }, active: next.key });
    }
    setResults([]);
  };

  // -------------------------------------------------------------------------
  // Apply
  // -------------------------------------------------------------------------

  const apply = async () => {
    if (!applies || !option || !draft || !changes) return;
    setPhase("applying");
    setNotice(null);
    const out: { ok: boolean; text: string }[] = [];
    const say = (ok: boolean, text: string) => {
      out.push({ ok, text });
      setResults([...out]);
    };
    let stopped = false;
    const idOf = new Map(draft.map((group) => [group.key, group.id] as const));
    const nameOfKey = new Map(draft.map((group) => [group.key, group.name] as const));
    // What the preview should now say of a group a press made, so a second press recognises it.
    const made = new Map<string, { id: string; name: string }>();
    try {
      for (const group of changes.groups) {
        const answer = await send(`${base}/groups`, "POST", {
          name: group.name,
          weekday: group.session.weekday,
          start: group.session.startTimeLocal,
          minutes: group.session.durationMinutes,
          places: group.room,
        });
        const id = typeof answer.data.groupId === "string" ? answer.data.groupId : null;
        if (!answer.ok || !id) {
          say(false, W.RESULT.groupFailed(group.name, answer.error));
          stopped = true;
          break;
        }
        idOf.set(group.key, id);
        made.set(group.key, { id, name: group.name });
        say(true, W.RESULT.groupMade(group.name));
      }
      if (!stopped) {
        for (const time of changes.times) {
          const answer = await send(`${base}/groups/${encodeURIComponent(time.groupId)}/time`, "PUT", {
            weekday: time.session.weekday,
            start: time.session.startTimeLocal,
            from: time.from,
          });
          if (!answer.ok) {
            say(false, W.RESULT.timeFailed(time.name, answer.error));
            stopped = true;
            break;
          }
          say(true, W.RESULT.timeSaved(time.name, time.session));
        }
      }
      if (!stopped && changes.places.length > 0) {
        const ordered = placementOrder(changes.places);
        const body = ordered.map((place) => ({ uid: place.uid, groupId: place.to ? (idOf.get(place.to) ?? null) : null }));
        const answer = await allocate(body);
        if (!answer.ok) {
          say(false, W.RESULT.placesFailed(answer.error));
          stopped = true;
        } else {
          let refused = rejectedOf(answer.data);
          // A seat freed later in the same request is free now: one more try for the people a full group turned away.
          const full = new Set(refused.filter((r) => r.reason === "group-full").map((r) => r.uid));
          if (full.size > 0) {
            const again = await allocate(body.filter((each) => full.has(each.uid)));
            if (again.ok) refused = [...refused.filter((r) => !full.has(r.uid)), ...rejectedOf(again.data)];
          }
          for (const place of ordered) {
            const to = place.to ? (nameOfKey.get(place.to) ?? W.A_GROUP) : null;
            const no = refused.find((r) => r.uid === place.uid);
            if (no) say(false, notMovedWords(nameOf(place.uid), to ?? liveName(place.from), no.reason));
            else say(true, W.RESULT.placed(nameOf(place.uid), to));
          }
          if (refused.length > 0) stopped = true;
        }
      }
      if (!stopped) {
        for (const each of changes.facilitators) {
          const groupId = idOf.get(each.key) ?? null;
          const group = nameOfKey.get(each.key) ?? W.A_GROUP;
          if (!groupId) continue;
          const answer = await send(`/api/courses/groups/${encodeURIComponent(groupId)}/facilitators`, "POST", { uids: each.uids });
          if (!answer.ok) {
            say(false, W.RESULT.facilitatingFailed(group, answer.error));
            stopped = true;
            break;
          }
          say(true, W.RESULT.facilitating(each.added.map(nameOf), group));
        }
      }
      for (const ask of changes.toAsk) say(true, W.CHANGE.ask(nameOf(ask.uid), nameOfKey.get(ask.key) ?? W.A_GROUP));
      say(!stopped, stopped ? W.RESULT.stopped : W.RESULT.done);
    } catch {
      say(false, W.CONNECTION);
      stopped = true;
    }
    if (made.size > 0) {
      // The groups a press made, by id and the name they were made with.
      setPreview((was) => {
        if (!was) return was;
        const kept = own(was.working, was.active);
        if (!kept) return was;
        const next = copyOf(kept);
        for (const group of next.groups) {
          const done = made.get(group.key);
          if (done) Object.assign(group, { id: done.id, name: done.name, timeIsNew: false });
        }
        return { ...was, working: { ...was.working, [next.key]: next } };
      });
    }
    const fresh = await reread();
    if (!fresh) say(false, W.READ_AGAIN_FAILED);
    if (!stopped && fresh) {
      setPreview(null);
      setSelected(null);
    }
    setPhase("idle");
  };

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  const chosen = selected ? (own(people, selected) ?? null) : null;
  const chosenRing = selected ? ringOf(selected) : null;
  const pinned = (uid: string) => (own(people, uid)?.appointed.length ?? 0) > 0;
  const inOption = (ring: DrawnRing) => !option || option.groups.some((group) => group.key === ring.key);
  const canMoveTo = (ring: DrawnRing) =>
    selected !== null && !ring.memberUids.includes(selected) && !pinned(selected) && inOption(ring) && (option !== null || (live.sent && ring.id !== null));
  const moveTo = (uid: string, key: string | null) => {
    if (pinned(uid)) return;
    if (option) {
      // Only into a group of the preview: one of the run's it leaves out is drawn as it is, and not moved into.
      if (key === null || option.groups.some((group) => group.key === key)) movePreview(uid, key);
    } else void moveLive(uid, key);
  };
  const reasonOf = (uid: string) => option?.unplaced.find((entry) => entry.uid === uid)?.reason ?? null;

  const newSession: SessionSlot = { weekday: newDay, startTimeLocal: hhmm(newStart), durationMinutes: sessionMinutes };
  const startTimes: number[] = [];
  for (let at = gridStart; at + sessionMinutes <= gridEnd; at += 30) startTimes.push(at);
  const everybody = Object.keys(people);
  const can = (session: SessionSlot) => (uid: string) => canMakeHere(own(people, uid), session, gridEnd);
  const newCounts = { leftOut: outside.filter(can(newSession)).length, everybody: everybody.filter(can(newSession)).length };

  /**
   * Up to six whole sessions on the hour inside the time somebody marked, at
   * most two a day: the ones most of the people in no group can make first,
   * then the ones most people can make.
   */
  const startsFor = (person: RingPerson): Start[] => {
    const found: Start[] = [];
    for (const weekday of DAYS) {
      const day: Start[] = [];
      for (let at = Math.ceil(gridStart / 60) * 60; at + sessionMinutes <= gridEnd; at += 60) {
        const session = { weekday, startTimeLocal: hhmm(at), durationMinutes: sessionMinutes };
        if (!canMakeHere(person, session, gridEnd)) continue;
        if (rings.some((ring) => ring.session?.weekday === weekday && ring.session.startTimeLocal === session.startTimeLocal)) continue;
        day.push({ session, leftOut: outside.filter(can(session)).length, everybody: everybody.filter(can(session)).length });
      }
      found.push(...day.sort((a, b) => b.leftOut - a.leftOut || b.everybody - a.everybody).slice(0, 2));
    }
    return found.sort((a, b) => b.leftOut - a.leftOut || b.everybody - a.everybody).slice(0, 6);
  };
  const addGroup = (session: SessionSlot, withUid: string | null) => {
    if (option) addGroupPreview(session, withUid);
    else if (live.sent && live.runId) void addGroupLive(session, withUid);
  };

  // The groups Claude is asked about: the ones on the screen with a time, keyed as an option's are.
  const screen: ScreenGroup[] = option
    ? option.groups.map((group) => ({
        key: group.key,
        name: group.name,
        session: group.session,
        room: group.room,
        memberUids: [...group.memberUids],
        facilitators: group.facilitators.map((f) => ({ uid: f.uid, role: f.role })),
      }))
    : optionFromLive(live, W.CLAUDES_MOVES, live.size).groups.map((group) => ({
        key: group.key,
        name: group.name,
        session: group.session,
        room: group.room,
        memberUids: [...group.memberUids],
        facilitators: [],
      }));

  const changeLines = changes && draft
    ? [
        ...changes.groups.map((group) => W.CHANGE.addGroup(group.name, group.session, group.room)),
        ...changes.times.map((time) => {
          const was = live.groups.find((group) => group.id === time.groupId)?.session ?? null;
          return W.CHANGE.time(time.name, time.session, was ? W.whenWords(was) : null);
        }),
        ...placementOrder(changes.places).map((place) => {
          const to = place.to ? (draft.find((group) => group.key === place.to)?.name ?? W.A_GROUP) : null;
          if (to === null) return W.CHANGE.takeOut(nameOf(place.uid), liveName(place.from));
          return place.from === null ? W.CHANGE.put(nameOf(place.uid), to) : W.CHANGE.move(nameOf(place.uid), liveName(place.from), to);
        }),
        ...changes.facilitators.map((each) =>
          W.CHANGE.facilitate(each.added.map(nameOf), draft.find((group) => group.key === each.key)?.name ?? W.A_GROUP),
        ),
      ]
    : [];
  const askLines = changes && draft
    ? changes.toAsk.map((ask) => W.CHANGE.ask(nameOf(ask.uid), draft.find((group) => group.key === ask.key)?.name ?? W.A_GROUP))
    : [];

  /** A live group's campus, saved at once through the campus route; a preview changes no campus. */
  const campusControl = (ring: DrawnRing) => {
    if (option || !live.sent || !ring.id) return null;
    return (
      <GroupCampusPicker
        roundId={live.roundId}
        programmeId={live.programmeId}
        groupId={ring.id}
        groupName={ring.name}
        value={ring.campus}
        onSaved={(message) => {
          void reread().then((fresh) => setNotice(fresh ? { ok: true, lines: [message] } : { ok: false, lines: [message, W.READ_AGAIN_FAILED] }));
        }}
      />
    );
  };

  const timeControl = (ring: DrawnRing) => {
    if (option || !live.sent || !ring.id || !ring.slot) return null;
    if (ring.told) return null;
    if (timing?.key !== ring.key) {
      return (
        <button
          type="button"
          className={styles.smallQuiet}
          disabled={busy}
          onClick={() => {
            const [h, m] = (ring.session?.startTimeLocal ?? "18:00").split(":").map(Number);
            setTiming({ key: ring.key, day: ring.session?.weekday ?? 1, start: (h || 0) * 60 + (m || 0) });
          }}
        >
          {W.CHANGE_TIME}
        </button>
      );
    }
    return (
      <div className={styles.actions}>
        <label className={styles.length}>
          <span className={styles.line}>{W.DAY_LABEL}</span>
          <Select aria-label={`${W.DAY_LABEL}: ${ring.name}`} value={String(timing.day)} disabled={busy} onChange={(event) => setTiming({ ...timing, day: Number(event.target.value) })}>
            {DAYS.map((day) => (
              <option key={day} value={String(day)}>
                {DAY[day]}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.length}>
          <span className={styles.line}>{W.STARTS_LABEL}</span>
          <Select aria-label={`${W.STARTS_LABEL}: ${ring.name}`} value={String(timing.start)} disabled={busy} onChange={(event) => setTiming({ ...timing, start: Number(event.target.value) })}>
            {startTimes.map((start) => (
              <option key={start} value={String(start)}>
                {hhmm(start)}
              </option>
            ))}
          </Select>
        </label>
        <button type="button" className={styles.small} disabled={busy} onClick={() => timeLive(ring, timing.day, timing.start)}>
          {W.SAVE_TIME}
        </button>
        <button type="button" className={styles.smallQuiet} disabled={busy} onClick={() => setTiming(null)}>
          {W.CANCEL}
        </button>
      </div>
    );
  };

  return (
    <section className={styles.panel} aria-label={W.TITLE}>
        <div className={styles.head}>
          <p className={styles.line}>{W.LEDE}</p>
          {live.sent ? (
            <p className={styles.counts}>
              {W.countsLine({ onList, inAGroup, notInAGroup: onList - inAGroup, untold })}
            </p>
          ) : (
            <p className={styles.preview}>{W.BEFORE_DECISIONS}</p>
          )}
          {live.notOnList.length > 0 ? (
            <p className={styles.flagLine}>
              {W.notOnListWords(live.notOnList.map((person) => person.name))}{" "}
              <Link className={styles.link} href={settingsHref}>
                {W.GO_TO_SETTINGS}
              </Link>
            </p>
          ) : null}
        </div>

        <div className={styles.actions}>
          <label className={styles.length}>
            <span className={styles.line}>{W.SESSIONS_OF}</span>
            <Select aria-label={W.SESSION_LENGTH} value={String(minutes)} disabled={busy} onChange={(event) => setMinutes(Number(event.target.value))}>
              {[...new Set([...live.lengths, live.minutes])]
                .filter((length) => length > 0)
                .sort((a, b) => a - b)
                .map((length) => (
                  <option key={length} value={String(length)}>
                    {lengthWords(length)}
                  </option>
                ))}
            </Select>
          </label>
          <button type="button" className={styles.quiet} disabled={busy} onClick={() => void suggest(false)}>
            {W.SUGGEST}
          </button>
          {live.claudeConfigured ? (
            <button type="button" className={styles.button} disabled={busy} onClick={() => void suggest(true)}>
              {phase === "suggesting" ? W.SUGGESTING : W.SUGGEST_WITH_CLAUDE}
            </button>
          ) : null}
          {phase === "suggesting" ? <span className={styles.line}>{W.CLAUDE_TAKES_A_MINUTE}</span> : null}
        </div>
        {movable > 0 ? (
          <label className={styles.check}>
            <input type="checkbox" checked={startAgain} disabled={busy} onChange={(event) => setStartAgain(event.target.checked)} />
            <span>{W.startAgainWords(movable)}</span>
          </label>
        ) : null}
        <p className={styles.line}>{W.SUGGEST_LINE}</p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <ul className={styles.steps} aria-live="polite">
            {notice.lines.map((line, i) => (
              <li key={i} className={notice.ok ? styles.stepOk : styles.stepFailed}>
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        {preview ? (
          <div className={styles.result} aria-live="polite">
            <div className={styles.previewHead}>
              <p className={styles.preview}>{preview.view.preview ? W.PREVIEW_BEFORE_DECISIONS : W.PREVIEW_LINE}</p>
              <button type="button" className={styles.quiet} disabled={busy} onClick={() => { setPreview(null); setSelected(null); }}>
                {W.CLOSE_PREVIEW}
              </button>
            </div>
            {preview.view.options.length === 0 ? (
              <p className={styles.line}>
                {Object.keys(preview.view.people).length === 0 ? W.NOTHING_TO_ARRANGE : W.NO_TIME_FOUND}
              </p>
            ) : null}
            {preview.view.preferredWhy ? <p className={styles.notes}>{preview.view.preferredWhy}</p> : null}
            {preview.view.notes ? <p className={styles.line}>{preview.view.notes}</p> : null}
            {preview.view.options.length > 1 ? (
              <div className={styles.tabs} role="tablist" aria-label={W.OPTIONS}>
                {preview.view.options.map((each) => (
                  <button
                    key={each.key}
                    type="button"
                    role="tab"
                    aria-selected={each.key === preview.active}
                    className={`${styles.tab} ${each.key === preview.active ? styles.tabOn : ""}`}
                    onClick={() => {
                      setPreview({ ...preview, active: each.key });
                      setSelected(null);
                      setResults([]);
                    }}
                  >
                    <span className={styles.tabKey}>{W.OPTION(each.key)}</span>
                    {each.title ? <span className={styles.tabTitle}>{each.title}</span> : null}
                    {each.preferred && preview.view.asked ? <span className={styles.badge}>{W.CLAUDES_PICK}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
            {option && (option.pros.length > 0 || option.cons.length > 0) ? (
              <div className={styles.proscons}>
                <div>
                  <strong className={styles.label}>{W.FOR}</strong>
                  <ul className={styles.list}>
                    {option.pros.map((pro) => (
                      <li key={pro}>{pro}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong className={styles.label}>{W.AGAINST}</strong>
                  <ul className={styles.list}>
                    {option.cons.map((con) => (
                      <li key={con}>{con}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={styles.board}>
          <div className={styles.rings}>
            {rings.length === 0 ? <p className={styles.line}>{W.NO_GROUPS}</p> : null}
            {rings.map((ring) => (
              <Ring
                key={ring.key}
                ring={ring}
                people={people}
                near={near}
                programme={live.programmeShortName}
                selected={selected}
                canMoveHere={canMoveTo(ring)}
                warnings={warningsFor(ring, people, near)}
                showNotTold={!option && live.published}
                disabled={busy}
                locked={!hydrated || phase === "applying" || phase === "saving"}
                onSelect={(uid) => setSelected(selected === uid ? null : uid)}
                onMoveHere={() => selected && moveTo(selected, ring.key)}
              >
                {timeControl(ring)}
                {campusControl(ring)}
                {option && ring.id === null ? (
                  <button type="button" className={styles.smallQuiet} disabled={busy} onClick={() => removeGroup(ring.key)}>
                    {W.REMOVE_GROUP(ring.memberUids.length)}
                  </button>
                ) : null}
              </Ring>
            ))}
          </div>

          <aside className={styles.side} aria-label={W.PERSON_PANEL}>
            {chosen ? (
              <PersonPanel
                person={chosen}
                ring={chosenRing}
                rings={rings}
                grid={live.grid}
                preview={option !== null}
                outside={outside.length}
                starts={option || (live.sent && live.runId) ? startsFor(chosen) : []}
                facilitatorsHref={facilitatorsHref}
                disabled={busy || (!option && !live.sent)}
                onMove={(key) => moveTo(chosen.uid, key)}
                onStart={(session) => addGroup(session, chosen.uid)}
                onRole={(role) => setRole(chosen.uid, role)}
                onFacilitate={(ring, add) => facilitateLive(ring, chosen.uid, add)}
                onClose={() => setSelected(null)}
              />
            ) : (
              <p className={styles.line}>{W.LEGEND}</p>
            )}
          </aside>
        </div>

        {outside.length > 0 ? (
          <div className={styles.unplaced}>
            <strong>{W.notInAGroupTitle(outside.length)}</strong>
            <div className={styles.tray}>
              {outside.map((uid) => {
                const reason = reasonOf(uid);
                const takenOut = option !== null && (own(live.people, uid)?.groupId ?? null) !== null;
                return (
                  <button
                    key={uid}
                    type="button"
                    className={`${styles.trayChip} ${selected === uid ? styles.chipSelected : ""} ${takenOut ? styles.chipMoves : ""}`}
                    aria-pressed={selected === uid}
                    disabled={!hydrated || phase === "applying" || phase === "saving"}
                    onClick={() => setSelected(selected === uid ? null : uid)}
                  >
                    {nameOf(uid)}
                    {takenOut ? <span className={styles.trayWhy}> · {W.TAKEN_OUT}</span> : null}
                    {!takenOut && reason ? <span className={styles.trayWhy}> · {own(W.REASON, reason) ?? ""}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {option || (live.sent && live.runId) ? (
          <div className={styles.unplaced}>
            <strong>{W.ADD_A_GROUP}</strong>
            <div className={styles.actions}>
              <label className={styles.length}>
                <span className={styles.line}>{W.DAY_LABEL}</span>
                <Select aria-label={W.NEW_DAY} value={String(newDay)} disabled={busy} onChange={(event) => setNewDay(Number(event.target.value))}>
                  {DAYS.map((day) => (
                    <option key={day} value={String(day)}>
                      {DAY[day]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className={styles.length}>
                <span className={styles.line}>{W.STARTS_LABEL}</span>
                <Select aria-label={W.NEW_START} value={String(newStart)} disabled={busy} onChange={(event) => setNewStart(Number(event.target.value))}>
                  {startTimes.map((start) => (
                    <option key={start} value={String(start)}>
                      {hhmm(start)}
                    </option>
                  ))}
                </Select>
              </label>
              <button type="button" className={styles.quiet} disabled={busy} onClick={() => addGroup(newSession, null)}>
                {W.ADD_THIS_GROUP}
              </button>
            </div>
            <p className={styles.line}>
              {W.newGroupCounts(newCounts.leftOut, outside.length, newCounts.everybody, everybody.length, newSession)}
            </p>
          </div>
        ) : null}

        {preview && preview.view.dropped.length > 0 ? (
          <details className={styles.dropped}>
            <summary>{W.DIDNT_FIT(preview.view.dropped.length)}</summary>
            <ul className={styles.list}>
              {preview.view.dropped.map((entry, i) => (
                <li key={i}>
                  {entry.suggestion}: {entry.why}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {option ? (
          <div className={styles.changes}>
            {applies ? (
              <>
                <strong>{W.CHANGES_TITLE}</strong>
                {changeLines.length === 0 ? (
                  <p className={styles.line}>{W.NOTHING_TO_APPLY}</p>
                ) : (
                  <>
                    <p className={styles.line}>{W.APPLY_LINE}</p>
                    <ol className={styles.changeList}>
                      {changeLines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  </>
                )}
                {askLines.length > 0 ? (
                  <ul className={styles.list}>
                    {askLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
            <div className={styles.actions}>
              {applies && changes ? (
                <button type="button" className={styles.button} disabled={busy || changes.count === 0} onClick={() => void apply()}>
                  {phase === "applying" ? W.APPLYING : W.applyLabel(changes.count)}
                </button>
              ) : null}
              <button type="button" className={styles.quiet} disabled={busy} onClick={reset}>
                {W.UNDO(option.key)}
              </button>
            </div>
          </div>
        ) : null}
        {results.length > 0 ? (
          <ol className={styles.steps} aria-live="polite">
            {results.map((step, i) => (
              <li key={i} className={step.ok ? styles.stepOk : styles.stepFailed}>
                {step.ok ? "✓" : "✗"} {step.text}
              </li>
            ))}
          </ol>
        ) : null}

        {live.claudeConfigured && screen.length > 0 ? (
          <AskClaude
            url={`${base}/arrangement`}
            minutes={sessionMinutes}
            groups={screen}
            about={option ? option.key : null}
            people={people}
            disabled={busy}
            onBusy={setChatting}
            onPreview={previewMoves}
          />
        ) : null}
    </section>
  );
}
