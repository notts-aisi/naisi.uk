"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import CountedTextarea from "@/components/ui/CountedTextarea";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { own } from "@/lib/applications/keys";
import { lengthWords } from "@/lib/courses/sessionLength";
import type { SessionSlot } from "@/lib/admissions/availability";
import type { ArrangementOptionsView, RingFacilitator, RingGroup, RingOption, RingPerson } from "@/lib/applications/arrange/view";
import styles from "./ArrangeGroups.module.css";
import WeekChart from "./WeekChart";

/**
 * Arrange groups, on a programme's Times view, for an admin.
 *
 * Suggest asks the arrangement route for up to five options: the site's own
 * splits of the people into groups by when they are free, ranked by Claude
 * with pros and cons, a reason for each group and a facilitator for each.
 * Each group is a ring: its day, time and programme in the middle, its people
 * around the edge, the facilitator marked. Clicking a person shows what Claude
 * made of their application, links to the application itself, and lets the
 * admin make them a facilitator; clicking another ring then moves them there.
 * Every change is checked on the spot against when each person said they are
 * free, the group's room and its facilitators. The options and every change
 * live on this page and nowhere else.
 *
 * Sessions are counted at the length picked here, which starts as the
 * Times view's own (the groups' length, else the programme's usual one).
 *
 * ASK CLAUDE: a question about the option on the screen, with the admin's
 * changes, answered in words; the moves it suggests that fit can be made
 * with one press. The conversation lives on this page; the last few turns
 * are sent back with each question.
 *
 * BEFORE DECISION DAY IT IS A PREVIEW, from the decisions as they stand:
 * nobody is on the run yet, so there is nothing to Apply.
 *
 * APPLY USES THE SITE'S OWN ROUTES, in order, and stops at the first refusal:
 * a new group is added (`.../programmes/[id]/groups`), a group with no time is
 * given one (`.../groups/[id]/time`), everybody is placed in one request
 * (`/api/courses/runs/[runId]/allocate`), and each facilitator who offered is
 * added beside the group's own (`/api/courses/groups/[id]/facilitators`).
 * Somebody who did not offer is never made a facilitator here: the page says
 * to ask them, from Groups, Facilitators. Nobody is emailed: telling people
 * their group is still Publish.
 */

type Step = { label: string; ok: boolean; detail?: string };
type Turn = {
  question: string;
  answer: string;
  moves: { uid: string; toKey: string; why: string }[];
  dropped: { suggestion: string; why: string }[];
  /** The option the question was about. */
  optionKey: string;
  made: boolean;
};

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const REASON: Record<string, string> = {
  "no-week": "said nothing about when they are free",
  "fits-none": "can make none of these times",
  "no-room": "no room in a group they can make",
};
const POTENTIAL: Record<string, string> = { high: "Strong", medium: "Possible", low: "Unlikely" };

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, data, error: typeof data.error === "string" ? data.error : `It answered ${response.status}.` };
}

/** "Amara Okafor" as a name tag: "Amara O." */
function tagName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const minutesOf = (text: string) => {
  const [h, m] = text.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Whether somebody can make a whole session, from the stretches they marked:
 * the same reading the site uses (`handover/paintedWeek.ts`), so a group added
 * on this page is checked as the site's own are. Somebody who marked under
 * four hours is read as free from their first mark that day to the grid's end.
 */
function canMakeHere(person: RingPerson | undefined, session: SessionSlot, gridEnd: number): boolean {
  if (!person || !person.week.said) return false;
  const start = minutesOf(session.startTimeLocal);
  const end = start + session.durationMinutes;
  if (end > gridEnd) return false;
  const day = person.week.marked.filter((range) => range.weekday === session.weekday);
  if (person.week.fromFirstMark) {
    const first = Math.min(...day.map((range) => range.start));
    return Number.isFinite(first) && start >= first;
  }
  let reach = start;
  for (const range of [...day].sort((a, b) => a.start - b.start)) {
    if (range.start <= reach && range.end > reach) reach = range.end;
  }
  return reach >= end;
}

/** The next "Group X" an option does not have. */
function nextName(groups: readonly RingGroup[]): string {
  const taken = new Set(groups.map((group) => group.name.trim().toLowerCase()));
  for (let code = 65; code <= 90; code += 1) {
    const name = `Group ${String.fromCharCode(code)}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  return `Group ${groups.length + 1}`;
}

const copyOf = (option: RingOption): RingOption => ({
  ...option,
  groups: option.groups.map((group) => ({
    ...group,
    memberUids: [...group.memberUids],
    facilitators: group.facilitators.map((f) => ({ ...f })),
  })),
});

/** What is wrong with one group as it stands now, a sentence each. */
function warningsFor(group: RingGroup, people: Record<string, RingPerson>, nearUids: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const nameOf = (uid: string) => own(people, uid)?.name ?? "Somebody";
  for (const uid of group.memberUids) {
    if (nearUids.has(uid)) out.push(`${nameOf(uid)} is near their time, not in it: check with them.`);
    else if (!group.canMake.includes(uid)) out.push(`${nameOf(uid)} said they can’t make this time.`);
  }
  if (group.memberUids.length > group.room) out.push(`${group.memberUids.length} people, and room for ${group.room}.`);
  const lead = group.facilitators.find((f) => f.role === "lead");
  const already = group.existing?.facilitatorUids.length ?? 0;
  if (!lead) {
    if (already === 0) out.push("No facilitator.");
  } else if (!lead.offered && !group.facilitators.some((f) => f.role === "second" && f.offered)) {
    out.push(`${nameOf(lead.uid)} didn’t offer to facilitate, and nobody here who did is backing them up.`);
  }
  return out;
}

export default function ArrangeGroups({
  roundId,
  programmeId,
  lengths,
  counted,
}: {
  roundId: string;
  programmeId: string;
  /** The session lengths that can be picked, in minutes. */
  lengths: number[];
  /** The length the Times view counts. */
  counted: number;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [minutes, setMinutes] = useState(counted);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  /** The "Add a group" form: a day (Sunday first) and a start, in minutes past midnight. */
  const [newDay, setNewDay] = useState(1);
  const [newStart, setNewStart] = useState(18 * 60);
  const [view, setView] = useState<ArrangementOptionsView | null>(null);
  const [working, setWorking] = useState<Record<string, RingOption>>({});
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const base = `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;

  const option = active ? (own(working, active) ?? null) : null;
  const people = view?.people ?? {};
  const nearUids = useMemo(() => new Set(option?.nearUids ?? []), [option]);
  const groupOf = (uid: string) => option?.groups.find((group) => group.memberUids.includes(uid)) ?? null;
  const unplaced = option
    ? Object.keys(people)
        .filter((uid) => !option.groups.some((group) => group.memberUids.includes(uid)))
        .sort((a, b) => (own(people, a)?.name ?? "").localeCompare(own(people, b)?.name ?? ""))
    : [];
  const reasonOf = (uid: string) => option?.unplaced.find((entry) => entry.uid === uid)?.reason ?? null;
  const busy = !hydrated || asking || applying || chatting;
  const gridStart = view?.grid.startMinute ?? 540;
  const gridEnd = view?.grid.endMinute ?? 1260;
  const sessionMinutes = view?.minutes ?? minutes;
  const startTimes: number[] = [];
  for (let at = gridStart; at + sessionMinutes <= gridEnd; at += 30) startTimes.push(at);
  const newSession: SessionSlot = { weekday: newDay, startTimeLocal: hhmm(newStart), durationMinutes: sessionMinutes };
  const newCounts = {
    leftOut: unplaced.filter((uid) => canMakeHere(own(people, uid), newSession, gridEnd)).length,
    everybody: Object.keys(people).filter((uid) => canMakeHere(own(people, uid), newSession, gridEnd)).length,
  };
  /**
   * Up to six whole sessions on the hour inside the time somebody marked, at
   * most two a day: the ones most of the people left out can make first, then
   * the ones most people can make.
   */
  const startsFor = (person: RingPerson): { session: SessionSlot; leftOut: number; everybody: number }[] => {
    const found: { session: SessionSlot; leftOut: number; everybody: number }[] = [];
    for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
      const day: typeof found = [];
      for (let at = Math.ceil(gridStart / 60) * 60; at + sessionMinutes <= gridEnd; at += 60) {
        const session = { weekday, startTimeLocal: hhmm(at), durationMinutes: sessionMinutes };
        if (!canMakeHere(person, session, gridEnd)) continue;
        if (option?.groups.some((group) => group.session.weekday === weekday && group.session.startTimeLocal === session.startTimeLocal)) continue;
        const can = (uid: string) => canMakeHere(own(people, uid), session, gridEnd);
        day.push({ session, leftOut: unplaced.filter(can).length, everybody: Object.keys(people).filter(can).length });
      }
      found.push(...day.sort((a, b) => b.leftOut - a.leftOut || b.everybody - a.everybody).slice(0, 2));
    }
    return found.sort((a, b) => b.leftOut - a.leftOut || b.everybody - a.everybody).slice(0, 6);
  };

  const suggest = async (askClaude: boolean) => {
    setAsking(true);
    setError(null);
    setSteps([]);
    setSelected(null);
    try {
      const answer = await send(`${base}/arrangement`, "POST", { askClaude, minutes: String(minutes) });
      if (!answer.ok) {
        setError(answer.error);
        return;
      }
      const next = answer.data.arrangement as ArrangementOptionsView;
      setView(next);
      setWorking(Object.fromEntries(next.options.map((each) => [each.key, copyOf(each)])));
      setActive(next.options.find((each) => each.preferred)?.key ?? next.options[0]?.key ?? null);
    } catch {
      setError("That couldn’t be sent. Check your connection and try again.");
    } finally {
      setAsking(false);
    }
  };

  /** Change the option on screen, never the one Claude sent. */
  const change = (edit: (draft: RingOption) => void) => {
    if (!option) return;
    const draft = copyOf(option);
    edit(draft);
    setWorking({ ...working, [draft.key]: draft });
    setSteps([]);
  };

  const moveTo = (uid: string, key: string | null) =>
    change((draft) => {
      for (const group of draft.groups) {
        if (!group.memberUids.includes(uid)) continue;
        group.memberUids = group.memberUids.filter((each) => each !== uid);
        // A facilitator sits in the group they facilitate.
        group.facilitators = group.facilitators.filter((f) => f.uid !== uid);
      }
      const target = key ? draft.groups.find((group) => group.key === key) : undefined;
      if (target) target.memberUids.push(uid);
    });

  const setRole = (uid: string, role: RingFacilitator["role"] | null) =>
    change((draft) => {
      const group = draft.groups.find((each) => each.memberUids.includes(uid));
      if (!group) return;
      group.facilitators = group.facilitators.filter((f) => f.uid !== uid && (role === null || f.role !== role));
      if (role) {
        const person = own(people, uid);
        group.facilitators.push({ uid, role, offered: person?.offered ?? false, why: "", bySite: false });
        group.facilitators.sort((a, b) => (a.role === b.role ? 0 : a.role === "lead" ? -1 : 1));
      }
    });

  /** Claude's suggested moves, made together on the option they were about. */
  const makeMoves = (turn: Turn, at: number) => {
    const target = own(working, turn.optionKey);
    if (!target) return;
    const draft = copyOf(target);
    for (const move of turn.moves) {
      for (const group of draft.groups) {
        if (!group.memberUids.includes(move.uid)) continue;
        group.memberUids = group.memberUids.filter((each) => each !== move.uid);
        group.facilitators = group.facilitators.filter((f) => f.uid !== move.uid);
      }
      draft.groups.find((group) => group.key === move.toKey)?.memberUids.push(move.uid);
    }
    setWorking({ ...working, [draft.key]: draft });
    setTurns(turns.map((each, i) => (i === at ? { ...each, made: true } : each)));
    setActive(draft.key);
    setSteps([]);
  };

  const ask = async () => {
    if (!option || !question.trim()) return;
    setChatting(true);
    setChatError(null);
    try {
      const answer = await send(`${base}/arrangement`, "POST", {
        minutes: String(minutes),
        ask: {
          question: question.trim(),
          history: turns.slice(-6).map((turn) => ({ question: turn.question, answer: turn.answer })),
          groups: option.groups.map((group) => ({
            key: group.key,
            name: group.name,
            session: group.session,
            room: group.room,
            memberUids: group.memberUids,
            facilitators: group.facilitators.map((f) => ({ uid: f.uid, role: f.role })),
          })),
        },
      });
      if (!answer.ok) {
        setChatError(answer.error);
        return;
      }
      const said = answer.data.ask as Omit<Turn, "question" | "optionKey" | "made">;
      setTurns([...turns, { question: question.trim(), ...said, optionKey: option.key, made: false }]);
      setQuestion("");
    } catch {
      setChatError("That couldn’t be sent. Check your connection and try again.");
    } finally {
      setChatting(false);
    }
  };

  /** A group of the admin's own, at a time they pick, with somebody already in it if they started it from them. */
  const addGroup = (session: SessionSlot, withUid: string | null) =>
    change((draft) => {
      if (withUid) {
        for (const group of draft.groups) {
          group.memberUids = group.memberUids.filter((each) => each !== withUid);
          group.facilitators = group.facilitators.filter((f) => f.uid !== withUid);
        }
      }
      let n = draft.groups.length + 1;
      while (draft.groups.some((group) => group.key === `${draft.key}${n}`)) n += 1;
      draft.groups.push({
        key: `${draft.key}${n}`,
        id: null,
        name: nextName(draft.groups),
        session,
        timeIsNew: true,
        room: view?.size ?? 8,
        memberUids: withUid ? [withUid] : [],
        facilitators: [],
        why: "",
        canMake: Object.keys(people).filter((uid) => canMakeHere(own(people, uid), session, view?.grid.endMinute ?? 1260)),
        existing: null,
      });
    });

  /** Take away a group this page would add; its people go back to "Not in a group". */
  const removeGroup = (key: string) =>
    change((draft) => {
      draft.groups = draft.groups.filter((group) => group.key !== key || group.id !== null);
    });

  const reset = () => {
    const sent = view?.options.find((each) => each.key === active);
    if (sent) setWorking({ ...working, [sent.key]: copyOf(sent) });
    setSelected(null);
    setSteps([]);
  };

  const apply = async () => {
    if (!option || !view || view.preview || !view.runId) return;
    setApplying(true);
    setError(null);
    const done: Step[] = [];
    const note = (step: Step) => {
      done.push(step);
      setSteps([...done]);
      return step.ok;
    };
    try {
      // 1 and 2: every group has an id and a time.
      const ids: string[] = [];
      for (const group of option.groups) {
        const start = group.session.startTimeLocal;
        if (group.id === null) {
          const made = await send(`${base}/groups`, "POST", {
            name: group.name,
            weekday: group.session.weekday,
            start,
            minutes: group.session.durationMinutes,
            places: group.room,
          });
          const id = typeof made.data.groupId === "string" ? made.data.groupId : null;
          if (!note({ label: `Add ${group.name}`, ok: made.ok && id !== null, detail: made.ok ? undefined : made.error })) return;
          ids.push(id!);
          continue;
        }
        if (group.timeIsNew && group.existing) {
          const timed = await send(`${base}/groups/${encodeURIComponent(group.id)}/time`, "PUT", {
            weekday: group.session.weekday,
            start,
            from: group.existing.slot,
          });
          if (!note({ label: `Give ${group.name} its time`, ok: timed.ok, detail: timed.ok ? undefined : timed.error })) return;
        }
        ids.push(group.id);
      }

      // 3: everybody placed, in one request.
      const placements = option.groups.flatMap((group, index) => group.memberUids.map((uid) => ({ uid, groupId: ids[index] })));
      const placed = await send(`/api/courses/runs/${encodeURIComponent(view.runId)}/allocate`, "POST", { placements });
      const rejected = Array.isArray(placed.data.rejected) ? (placed.data.rejected as { reason?: string }[]) : [];
      if (
        !note({
          label: `Place ${placements.length} people`,
          ok: placed.ok && rejected.length === 0,
          detail: !placed.ok
            ? placed.error
            : rejected.length > 0
              ? `${rejected.length} could not be placed (${[...new Set(rejected.map((r) => r.reason))].join(", ")}). If it says not-accepted, hand everybody over to the run first.`
              : undefined,
        })
      ) return;

      // 4: each facilitator who offered, beside the group's own.
      const toAsk: string[] = [];
      for (const [index, group] of option.groups.entries()) {
        for (const f of group.facilitators.filter((each) => !each.offered)) toAsk.push(`${own(people, f.uid)?.name ?? "Somebody"} for ${group.name}`);
        const offered = group.facilitators.filter((each) => each.offered).map((each) => each.uid);
        if (offered.length === 0) continue;
        const uids = [...new Set([...(group.existing?.facilitatorUids ?? []), ...offered])];
        const staffed = await send(`/api/courses/groups/${encodeURIComponent(ids[index])}/facilitators`, "POST", { uids });
        const names = offered.map((uid) => own(people, uid)?.name ?? "Somebody").join(" and ");
        if (!note({ label: `${names} ${offered.length === 1 ? "facilitates" : "facilitate"} ${group.name}`, ok: staffed.ok, detail: staffed.ok ? undefined : staffed.error })) return;
      }
      if (toAsk.length > 0) {
        note({
          label: `Still to ask, because they didn’t offer: ${toAsk.join("; ")}. Ask them from Groups, Facilitators, under “Didn’t offer, but worth asking”.`,
          ok: true,
        });
      }
      note({ label: "Done. Nobody has been emailed: Publish tells people their group.", ok: true });
      router.refresh();
    } catch {
      note({ label: "That couldn’t be sent. Check your connection; what is ticked above was saved.", ok: false });
    } finally {
      setApplying(false);
    }
  };

  const chosen = selected ? (own(people, selected) ?? null) : null;
  const chosenGroup = selected ? groupOf(selected) : null;
  const chosenRole = chosenGroup?.facilitators.find((f) => f.uid === selected)?.role ?? null;

  const ring = (group: RingGroup) => {
    const n = group.memberUids.length;
    const warnings = warningsFor(group, people, nearUids);
    const canMove = selected !== null && !group.memberUids.includes(selected);
    const selectedFits = selected !== null && group.canMake.includes(selected);
    return (
      <div key={group.key} className={styles.ringCard}>
        <div className={`${styles.ring} ${warnings.length > 0 ? styles.ringWarn : ""}`}>
          <div className={styles.circle} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.centre} ${canMove ? styles.centreTarget : ""}`}
            disabled={busy || !canMove}
            onClick={() => selected && moveTo(selected, group.key)}
            aria-label={canMove && chosen ? `Move ${chosen.name} to ${group.name}` : `${group.name}, ${DAY[group.session.weekday]} ${group.session.startTimeLocal}`}
          >
            <span className={styles.when}>
              {DAY[group.session.weekday]} {group.session.startTimeLocal}
            </span>
            <span className={styles.centreLine}>
              {group.session.durationMinutes} min · {view?.programmeShortName}
            </span>
            <span className={styles.centreLine}>
              {group.name} · {n} of {group.room}
              {group.id === null ? " · new" : group.timeIsNew ? " · new time" : ""}
            </span>
            {canMove ? (
              <span className={selectedFits ? styles.moveHint : styles.moveHintWarn}>
                {selectedFits ? "Move here" : "Move here (can’t make it)"}
              </span>
            ) : null}
          </button>
          {group.memberUids.map((uid, i) => {
            const person = own(people, uid);
            const angle = ((-90 + (360 * i) / Math.max(n, 1)) * Math.PI) / 180;
            const role = group.facilitators.find((f) => f.uid === uid)?.role ?? null;
            const off = nearUids.has(uid) || !group.canMake.includes(uid);
            return (
              <button
                key={uid}
                type="button"
                className={[
                  styles.chip,
                  role === "lead" ? styles.chipLead : "",
                  role === "second" ? styles.chipSecond : "",
                  off ? styles.chipOff : "",
                  selected === uid ? styles.chipSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` }}
                disabled={!hydrated || applying}
                aria-pressed={selected === uid}
                title={person?.name}
                onClick={() => setSelected(selected === uid ? null : uid)}
              >
                {role === "lead" ? <span className={styles.chipRole}>Lead</span> : null}
                {role === "second" ? <span className={styles.chipRole}>Back-up</span> : null}
                <span>{tagName(person?.name ?? "?")}</span>
                {person?.flags ? <span className={styles.chipFlag} aria-label="Pangram flagged answers">!</span> : null}
              </button>
            );
          })}
        </div>
        {group.existing && group.existing.facilitatorNames.length > 0 ? (
          <p className={styles.facilitatorWhy}>
            Facilitating now, on the run: <strong>{group.existing.facilitatorNames.join(" and ")}</strong>
          </p>
        ) : null}
        {group.why ? <p className={styles.why}>{group.why}</p> : null}
        {group.facilitators.map((f) =>
          f.why ? (
            <p key={f.uid} className={styles.facilitatorWhy}>
              <strong>{own(people, f.uid)?.name}</strong> {f.role === "lead" ? "leads" : "backs up"}: {f.why}
            </p>
          ) : null,
        )}
        {warnings.length > 0 ? (
          <ul className={styles.warnings}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {group.id === null ? (
          <button type="button" className={styles.smallQuiet} disabled={busy} onClick={() => removeGroup(group.key)}>
            Remove this group
            {group.memberUids.length === 1
              ? " (its 1 person goes to “Not in a group”)"
              : group.memberUids.length > 1
                ? ` (its ${group.memberUids.length} people go to “Not in a group”)`
                : ""}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <section className={styles.panel} aria-label="Arrange groups">
      <div className={styles.head}>
        <h2 className={styles.title}>Arrange groups</h2>
        <p className={styles.line}>
          The site works out several ways to split the people into groups by when they’re free, and spreads the people who
          offered to facilitate so each group has one. Claude then ranks up to five, with pros and cons, says why each
          group’s people suit each other, and picks a facilitator for each, looking for people who might help run the
          society one day. Click a person to see their application and make them a facilitator, then click another ring to
          move them. Pangram flags are shown for you to weigh; they don’t count against anybody. Only admins see this, and
          nothing is saved until you press Apply.
        </p>
      </div>
      <div className={styles.actions}>
        <label className={styles.length}>
          <span className={styles.line}>Sessions of</span>
          <Select
            aria-label="Session length"
            value={String(minutes)}
            disabled={busy}
            onChange={(event) => setMinutes(Number(event.target.value))}
          >
            {[...new Set([...lengths, counted])]
              .sort((a, b) => a - b)
              .map((length) => (
                <option key={length} value={String(length)}>
                  {lengthWords(length)}
                </option>
              ))}
          </Select>
        </label>
        <button type="button" className={styles.button} disabled={busy} onClick={() => void suggest(true)}>
          {asking ? "Working it out…" : view ? "Suggest again" : "Suggest options with Claude"}
        </button>
        <button type="button" className={styles.quiet} disabled={busy} onClick={() => void suggest(false)}>
          Times only, without Claude
        </button>
        {asking ? <span className={styles.line}>Claude takes a minute or two.</span> : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {view ? (
        <div className={styles.result} aria-live="polite">
          {view.preview ? (
            <p className={styles.preview}>
              A preview, from the decisions as they stand. Places can still change before decision day, and nobody is on
              the run yet, so there is nothing to apply until decisions have gone out.
            </p>
          ) : null}
          {view.options.length === 0 ? (
            <p className={styles.line}>
              {Object.keys(view.people).length === 0
                ? "Nobody to arrange yet: nobody holds a place on this programme."
                : "No group time could be worked out: the people here who marked a real week have no time in common, or everybody marked under 4 hours. Give a group a time above, then suggest again."}
            </p>
          ) : null}
          {view.preferredWhy ? <p className={styles.notes}>{view.preferredWhy}</p> : null}
          {view.notes ? <p className={styles.line}>{view.notes}</p> : null}

          {view.options.length > 0 ? (
            <div className={styles.tabs} role="tablist" aria-label="Options">
              {view.options.map((each) => (
                <button
                  key={each.key}
                  type="button"
                  role="tab"
                  aria-selected={each.key === active}
                  className={`${styles.tab} ${each.key === active ? styles.tabOn : ""}`}
                  onClick={() => {
                    setActive(each.key);
                    setSelected(null);
                    setSteps([]);
                  }}
                >
                  <span className={styles.tabKey}>Option {each.key}</span>
                  {each.title ? <span className={styles.tabTitle}>{each.title}</span> : null}
                  {each.preferred && view.asked ? <span className={styles.badge}>Claude’s pick</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {option ? (
            <>
              {option.pros.length > 0 || option.cons.length > 0 ? (
                <div className={styles.proscons}>
                  <div>
                    <strong className={styles.label}>For</strong>
                    <ul className={styles.list}>
                      {option.pros.map((pro) => (
                        <li key={pro}>{pro}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong className={styles.label}>Against</strong>
                    <ul className={styles.list}>
                      {option.cons.map((con) => (
                        <li key={con}>{con}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className={styles.board}>
                <div className={styles.rings}>{option.groups.map(ring)}</div>

                <aside className={styles.side} aria-label="The person you picked">
                  {chosen ? (
                    <div className={styles.person}>
                      <div className={styles.personHead}>
                        <strong>{chosen.name}</strong>
                        <a className={styles.link} href={chosen.href} target="_blank" rel="noreferrer">
                          Open their application
                        </a>
                      </div>
                      <p className={styles.line}>
                        {chosen.offered ? "Offered to facilitate." : "Didn’t offer to facilitate."}
                        {chosen.told ? " Already told their group, so Apply leaves them in it." : ""}
                        {chosen.littleMarked ? " Marked under 4 hours in the week." : ""}
                      </p>
                      {chosen.potential ? (
                        <p className={styles.line}>
                          <strong>As a facilitator: {own(POTENTIAL, chosen.potential.level) ?? chosen.potential.level}.</strong>{" "}
                          {chosen.potential.why}
                        </p>
                      ) : null}
                      <p className={chosen.flags ? styles.flagLine : styles.line}>
                        {chosen.flags === null
                          ? "Pangram: not checked."
                          : chosen.flags === 0
                            ? "Pangram: nothing flagged."
                            : `Pangram: ${chosen.flags} ${chosen.flags === 1 ? "answer" : "answers"} worth a look. Read them before deciding; a flag is never a finding on its own.`}
                      </p>
                      {chosen.read ? (
                        <div className={styles.read}>
                          <p className={styles.line}>
                            {chosen.read.lean ? <strong>Claude’s lean: {chosen.read.lean}. </strong> : null}
                            {chosen.read.summary}
                          </p>
                          {chosen.read.strengths.length > 0 ? (
                            <p className={styles.line}>Strengths: {chosen.read.strengths.join("; ")}.</p>
                          ) : null}
                          {chosen.read.concerns.length > 0 ? (
                            <p className={styles.line}>Concerns: {chosen.read.concerns.join("; ")}.</p>
                          ) : null}
                          {chosen.read.thin > 0 ? (
                            <p className={styles.line}>
                              {chosen.read.thin} {chosen.read.thin === 1 ? "answer" : "answers"} thin or brief.
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className={styles.line}>Claude hasn’t read their application.</p>
                      )}
                      <p className={styles.line}>
                        {chosenGroup
                          ? `In ${chosenGroup.name}. Pick a group on the chart, or click another ring, to move them.`
                          : "Not in a group. Pick a group on the chart, or click a ring, to put them in it."}
                      </p>
                      {chosen.week.said ? null : (
                        <p className={styles.flagLine}>They haven’t said when they’re free, so nothing is shaded.</p>
                      )}
                      <WeekChart
                        grid={view.grid}
                        marked={chosen.week.marked}
                        fromFirstMark={chosen.week.fromFirstMark}
                        groups={option.groups.map((group) => ({
                          key: group.key,
                          name: group.name,
                          session: group.session,
                          fits: selected !== null && group.canMake.includes(selected),
                          current: selected !== null && group.memberUids.includes(selected),
                        }))}
                        disabled={busy}
                        onPick={(key) => selected && moveTo(selected, key)}
                      />
                      {startsFor(chosen).length > 0 ? (
                        <div className={styles.starts}>
                          <span className={styles.line}>Or start a new group at a time they marked:</span>
                          <div className={styles.tray}>
                            {startsFor(chosen).map((start) => (
                              <button
                                key={`${start.session.weekday}@${start.session.startTimeLocal}`}
                                type="button"
                                className={styles.trayChip}
                                disabled={busy}
                                onClick={() => addGroup(start.session, chosen.uid)}
                              >
                                {DAY[start.session.weekday]} {start.session.startTimeLocal}
                                <span className={styles.trayWhy}>
                                  {" "}
                                  · {start.leftOut} of {unplaced.length} not in a group, {start.everybody} in all
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className={styles.personActions}>
                        {chosenGroup ? (
                          <>
                            <button type="button" className={styles.small} disabled={busy || chosenRole === "lead"} onClick={() => setRole(selected!, "lead")}>
                              Make lead
                            </button>
                            <button type="button" className={styles.small} disabled={busy || chosenRole === "second"} onClick={() => setRole(selected!, "second")}>
                              Make back-up
                            </button>
                            {chosenRole ? (
                              <button type="button" className={styles.small} disabled={busy} onClick={() => setRole(selected!, null)}>
                                Not a facilitator
                              </button>
                            ) : null}
                            <button type="button" className={styles.small} disabled={busy} onClick={() => moveTo(selected!, null)}>
                              Take out of groups
                            </button>
                          </>
                        ) : null}
                        <button type="button" className={styles.smallQuiet} onClick={() => setSelected(null)}>
                          Done
                        </button>
                      </div>
                      {!chosen.offered && chosenRole ? (
                        <p className={styles.flagLine}>
                          They didn’t offer, so Apply won’t make them a facilitator: ask them from Groups, Facilitators.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className={styles.line}>
                      Click a person to see what Claude made of their application, make them a facilitator, or move them.
                      Lead and Back-up mark the facilitators; a red tag is somebody who can’t make that time, and “!” is a
                      Pangram flag.
                    </p>
                  )}
                </aside>
              </div>

              <div className={styles.unplaced}>
                <strong>Add a group</strong>
                <div className={styles.actions}>
                  <label className={styles.length}>
                    <span className={styles.line}>Day</span>
                    <Select aria-label="Day of the new group" value={String(newDay)} disabled={busy} onChange={(event) => setNewDay(Number(event.target.value))}>
                      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                        <option key={day} value={String(day)}>
                          {DAY[day]}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className={styles.length}>
                    <span className={styles.line}>Starts</span>
                    <Select aria-label="Start of the new group" value={String(newStart)} disabled={busy} onChange={(event) => setNewStart(Number(event.target.value))}>
                      {startTimes.map((start) => (
                        <option key={start} value={String(start)}>
                          {hhmm(start)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <button type="button" className={styles.quiet} disabled={busy} onClick={() => addGroup(newSession, null)}>
                    Add this group
                  </button>
                </div>
                <p className={styles.line}>
                  {newCounts.leftOut} of the {unplaced.length} not in a group, and {newCounts.everybody} of all {Object.keys(people).length},
                  can make {DAY[newDay]} {hhmm(newStart)} for {minutes} minutes.
                </p>
              </div>

              {unplaced.length > 0 ? (
                <div className={styles.unplaced}>
                  <strong>Not in a group ({unplaced.length})</strong>
                  <div className={styles.tray}>
                    {unplaced.map((uid) => (
                      <button
                        key={uid}
                        type="button"
                        className={`${styles.trayChip} ${selected === uid ? styles.chipSelected : ""}`}
                        aria-pressed={selected === uid}
                        disabled={!hydrated || applying}
                        onClick={() => setSelected(selected === uid ? null : uid)}
                      >
                        {own(people, uid)?.name}
                        {reasonOf(uid) ? <span className={styles.trayWhy}> · {own(REASON, reasonOf(uid)!) ?? ""}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {view.dropped.length > 0 ? (
                <details className={styles.dropped}>
                  <summary>Claude suggestions that didn’t fit ({view.dropped.length})</summary>
                  <ul className={styles.list}>
                    {view.dropped.map((entry, i) => (
                      <li key={i}>
                        {entry.suggestion}: {entry.why}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className={styles.actions}>
                {view.preview || !view.runId ? (
                  <span className={styles.line}>Apply opens once decisions have gone out and people are on the run.</span>
                ) : (
                  <>
                    <button type="button" className={styles.button} disabled={busy} onClick={() => void apply()}>
                      {applying ? "Applying…" : `Apply option ${option.key}`}
                    </button>
                    <span className={styles.line}>Adds groups, places people and adds facilitators who offered. Nobody is emailed.</span>
                  </>
                )}
                <button type="button" className={styles.quiet} disabled={busy} onClick={reset}>
                  Undo my changes to option {option.key}
                </button>
              </div>
              {steps.length > 0 ? (
                <ol className={styles.steps}>
                  {steps.map((step, i) => (
                    <li key={i} className={step.ok ? styles.stepOk : styles.stepFailed}>
                      {step.ok ? "✓" : "✗"} {step.label}
                      {step.detail ? <span className={styles.line}> · {step.detail}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : null}

              {view.claudeConfigured ? (
                <section className={styles.chat} aria-label="Ask Claude about these groups">
                  <h3 className={styles.chatTitle}>Ask Claude about these groups</h3>
                  <p className={styles.line}>
                    About option {option.key} as it is on your screen, your changes included. Claude also sees how many
                    people on each programme can meet at each time, so you can ask about joint sessions. Nothing is saved.
                  </p>
                  {turns.map((turn, i) => (
                    <div key={i} className={styles.turn}>
                      <p className={styles.question}>
                        <strong>You{turn.optionKey !== option.key ? ` (about option ${turn.optionKey})` : ""}:</strong>{" "}
                        {turn.question}
                      </p>
                      <p className={styles.answer}>{turn.answer}</p>
                      {turn.moves.length > 0 ? (
                        <div className={styles.suggested}>
                          <ul className={styles.list}>
                            {turn.moves.map((move) => (
                              <li key={`${move.uid}:${move.toKey}`}>
                                {own(people, move.uid)?.name ?? "Somebody"} to{" "}
                                {own(working, turn.optionKey)?.groups.find((g) => g.key === move.toKey)?.name ?? "a group"}
                                {move.why ? `: ${move.why}` : ""}
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            className={styles.small}
                            disabled={busy || turn.made}
                            onClick={() => makeMoves(turn, i)}
                          >
                            {turn.made
                              ? "Made"
                              : `Make ${turn.moves.length === 1 ? "this move" : `these ${turn.moves.length} moves`} in option ${turn.optionKey}`}
                          </button>
                        </div>
                      ) : null}
                      {turn.dropped.length > 0 ? (
                        <p className={styles.line}>
                          Left out because they don’t fit: {turn.dropped.map((d) => `${d.suggestion} (${d.why})`).join("; ")}.
                        </p>
                      ) : null}
                    </div>
                  ))}
                  <CountedTextarea
                    aria-label="Your question for Claude"
                    value={question}
                    max={1000}
                    rows={3}
                    disabled={busy}
                    placeholder="For example: the governance and alignment streams should meet together for the first two sessions. Which times work for both?"
                    onChange={(event) => setQuestion(event.target.value)}
                  />
                  <div className={styles.actions}>
                    <button type="button" className={styles.button} disabled={busy || !question.trim()} onClick={() => void ask()}>
                      {chatting ? "Claude is thinking…" : "Ask Claude"}
                    </button>
                    {chatting ? <span className={styles.line}>This can take a minute.</span> : null}
                  </div>
                  {chatError ? (
                    <p className={styles.error} role="alert">
                      {chatError}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
