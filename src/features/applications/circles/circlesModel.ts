import type { SessionSlot } from "@/lib/admissions/availability";
import { draftOver, recognise, type DraftGroup, type LiveGroupFacts, type LivePeople } from "@/lib/applications/arrange/changes";
import type { CircleGroup, CirclesView, RingGroup, RingOption, RingPerson } from "@/lib/applications/arrange/view";
import { own } from "@/lib/applications/keys";
import { WARN } from "./circlesWords";

/**
 * WHAT CIRCLES DRAWS, worked out from what it was sent: the run's groups as
 * they are, or a preview over them, as one list of rings, and what a press
 * of Apply would be worked out from. Pure, so the screen and a test read the
 * same rings.
 */

/** One ring on the screen. */
export type DrawnRing = {
  /** The screen's key: a live group's id, or a preview group's key ("B2"). */
  key: string;
  /** The run's group, or null for one a preview adds. */
  id: string | null;
  name: string;
  /** Null for a group with no time yet. */
  session: SessionSlot | null;
  /** Null for no limit. */
  room: number | null;
  memberUids: string[];
  /** A mark on a person who facilitates it: on the run already, or proposed by a preview. */
  roles: Record<string, { label: "facilitating" | "lead" | "second"; isNew: boolean }>;
  /** Its facilitators who hold no place on the run, by first name. */
  outside: string[];
  /** A preview adds it, or gives it a new time. */
  isNew: boolean;
  newTime: boolean;
  /** Publish has told somebody its time. */
  told: boolean;
  /** Everybody who can make its time. */
  canMake: string[];
  /** In a preview: the people who sit somewhere else now. */
  movesIn: string[];
  /** Claude's sentence on the group, and on each facilitator it picked. */
  why: string;
  whys: { uid: string; role: "lead" | "second"; why: string }[];
  /** Its stored day and start, for a change of time; null for a preview's new group. */
  slot: { weekday: number; start: string } | null;
  /** The campus a live group meets on, or null (none chosen, or a preview's new group). */
  campus: "university-park" | "jubilee" | "online" | null;
};

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
export function canMakeHere(person: RingPerson | undefined, session: SessionSlot, gridEnd: number): boolean {
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

/** The run's groups as they are. */
export function liveRings(view: CirclesView): DrawnRing[] {
  return view.groups.map((group) => ({
    key: group.id,
    id: group.id,
    name: group.name,
    session: group.session,
    room: group.room,
    memberUids: [...group.memberUids],
    roles: Object.fromEntries(
      group.facilitators.filter((f) => f.member).map((f) => [f.uid, { label: "facilitating" as const, isNew: false }]),
    ),
    outside: group.facilitators.filter((f) => !f.member).map((f) => f.name),
    isNew: false,
    newTime: false,
    told: group.told,
    canMake: [...group.canMake],
    movesIn: [],
    why: "",
    whys: [],
    slot: { ...group.slot },
    campus: group.campus,
  }));
}

/** A preview option over the run's groups: its groups, then any of the run's it leaves out, as they are. */
export function previewRings(option: RingOption, view: CirclesView, people: Record<string, RingPerson>): DrawnRing[] {
  const liveById = new Map(view.groups.map((group) => [group.id, group] as const));
  const shown = new Set(option.groups.flatMap((group) => (group.id ? [group.id] : [])));
  const seated = new Set(option.groups.flatMap((group) => group.memberUids));
  const rings: DrawnRing[] = option.groups.map((group) => {
    const live = group.id ? liveById.get(group.id) : undefined;
    const roles: DrawnRing["roles"] = {};
    for (const f of live?.facilitators ?? []) {
      if (group.memberUids.includes(f.uid)) roles[f.uid] = { label: "facilitating", isNew: false };
    }
    for (const f of group.facilitators) {
      if (own(roles, f.uid)) continue;
      roles[f.uid] = { label: f.role, isNew: true };
    }
    return {
      key: group.key,
      id: group.id,
      name: group.name,
      session: group.session,
      room: live ? live.room : group.room,
      memberUids: [...group.memberUids],
      roles,
      outside: (live?.facilitators ?? []).filter((f) => !f.member && !group.memberUids.includes(f.uid)).map((f) => f.name),
      isNew: group.id === null,
      newTime: group.id !== null && group.timeIsNew,
      told: live?.told ?? false,
      canMake: [...group.canMake],
      movesIn: group.memberUids.filter((uid) => (own(people, uid)?.groupId ?? null) !== group.id),
      why: group.why,
      whys: group.facilitators.filter((f) => f.why).map((f) => ({ uid: f.uid, role: f.role, why: f.why })),
      slot: live ? { ...live.slot } : group.existing ? { ...group.existing.slot } : null,
      campus: live?.campus ?? null,
    };
  });
  for (const ring of liveRings(view)) {
    if (shown.has(ring.key)) continue;
    rings.push({ ...ring, memberUids: ring.memberUids.filter((uid) => !seated.has(uid)) });
  }
  return rings;
}

/** What is wrong with one ring as it stands, a sentence each. */
export function warningsFor(ring: DrawnRing, people: Record<string, RingPerson>, nearUids: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const nameOf = (uid: string) => own(people, uid)?.name ?? "Somebody";
  for (const uid of ring.memberUids) {
    if (nearUids.has(uid)) out.push(WARN.near(nameOf(uid)));
    else if (ring.session && !ring.canMake.includes(uid)) out.push(WARN.cant(nameOf(uid)));
  }
  if (ring.room !== null && ring.memberUids.length > ring.room) out.push(WARN.over(ring.memberUids.length, ring.room));
  const roles = Object.entries(ring.roles);
  const lead = roles.find(([, role]) => role.label === "lead");
  if (roles.length === 0 && ring.outside.length === 0) {
    out.push(WARN.noFacilitator);
  } else if (lead && !own(people, lead[0])?.offered) {
    const backed = roles.some(([uid, role]) => role.label !== "lead" && own(people, uid)?.offered);
    if (!backed) out.push(WARN.noBackUp(nameOf(lead[0])));
  }
  return out;
}

/** The run's groups and people as Apply works out its changes from them. */
export function liveFacts(view: CirclesView): { groups: LiveGroupFacts[]; people: LivePeople } {
  const people: Record<string, { groupId: string | null; offered: boolean }> = {};
  for (const [uid, person] of Object.entries(view.people)) people[uid] = { groupId: person.groupId, offered: person.offered };
  return {
    groups: view.groups.map((group: CircleGroup) => ({
      id: group.id,
      name: group.name,
      session: group.session,
      slot: { ...group.slot },
      facilitatorUids: group.facilitators.map((f) => f.uid),
      memberUids: [...group.memberUids],
    })),
    people,
  };
}

/**
 * A preview option as Apply reads it: its groups, each new one an earlier
 * press made recognised as that group (`recognise`), then the run's groups it
 * leaves out, with their people (`draftOver`). In that order, so a group a
 * press made is matched to the preview's group before it could be counted as
 * one the preview leaves out.
 */
export function draftOf(option: RingOption, view: CirclesView): DraftGroup[] {
  const groups: DraftGroup[] = option.groups.map((group) => ({
    key: group.key,
    id: group.id,
    name: group.name,
    session: group.session,
    room: group.room,
    memberUids: [...group.memberUids],
    facilitators: group.facilitators.map((f) => ({ uid: f.uid, role: f.role })),
  }));
  const live = liveFacts(view).groups;
  return draftOver(recognise(groups, live), live);
}

/**
 * The run's groups as an option of their own, for moves Claude suggested on
 * the groups as they are: each group with a time, keyed "A1", "A2" in order,
 * as the question about them was asked.
 */
export function optionFromLive(view: CirclesView, title: string, size: number): RingOption {
  const groups: RingGroup[] = [];
  view.groups.forEach((group) => {
    if (!group.session) return;
    groups.push({
      key: `A${groups.length + 1}`,
      id: group.id,
      name: group.name,
      session: group.session,
      timeIsNew: false,
      room: group.room ?? Math.max(size, group.memberUids.length),
      memberUids: [...group.memberUids],
      facilitators: [],
      why: "",
      canMake: [...group.canMake],
      existing: {
        facilitatorUids: group.facilitators.map((f) => f.uid),
        facilitatorNames: group.facilitators.map((f) => f.name),
        slot: { ...group.slot },
      },
    });
  });
  return { key: "A", title, pros: [], cons: [], preferred: true, size, groups, unplaced: [], nearUids: [], movedUids: [] };
}
