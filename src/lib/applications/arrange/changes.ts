import type { SessionSlot } from "@/lib/admissions/availability";
import { own } from "../keys";

/**
 * WHAT "APPLY N CHANGES" SENDS: the differences between the run's groups as
 * they are and a preview drawn over them, and nothing else.
 *
 * A preview is a suggestion (`./options.ts`, `./advice.ts`) with whatever the
 * admin changed in it, held on the screen. Pressing Apply sends, in order:
 *
 *  1. THE GROUPS: each new group (one a preview adds) through the
 *     programme's groups route, and each of the run's groups given a new time
 *     through its time route. A new group whose name an earlier press already
 *     made, at the same time, is that group (`recognise`), not made again; one
 *     whose name is taken by a group at another time is given a free name.
 *  2. THE PLACES, in one request to the allocate route: only the people whose
 *     group in the preview is not the group they sit in now. Taking somebody
 *     out of a group goes first and a first placement last
 *     (`placementOrder`), so a seat a move frees is free before it is taken.
 *  3. THE FACILITATORS WHO OFFERED, group by group, beside each group's own,
 *     through the group's facilitators route. Somebody marked to facilitate
 *     who did not offer is never sent: they are listed to ask by hand
 *     (`toAsk`).
 *
 * Nobody is emailed by any of it. Pure, with no imports beyond types and
 * `own`, so a test reads exactly what a press would send.
 */

/** One of the run's groups as it is, as much as a change is worked out from. */
export type LiveGroupFacts = {
  id: string;
  name: string;
  /** Null for a group with no time yet. */
  session: SessionSlot | null;
  /** Its stored day and start ("" for none), which a change of time is sent with. */
  slot: { weekday: number; start: string };
  facilitatorUids: readonly string[];
  memberUids: readonly string[];
};

/** Everybody who may be placed: where they sit now, and whether they offered to facilitate. */
export type LivePeople = Readonly<Record<string, { groupId: string | null; offered: boolean }>>;

/** A group as a preview holds it. */
export type DraftGroup = {
  /** The screen's own key for it: "B2". */
  key: string;
  /** The run's group, or null for one Apply adds. */
  id: string | null;
  name: string;
  /** Null only for one of the run's groups that has no time and is given none. */
  session: SessionSlot | null;
  room: number;
  memberUids: readonly string[];
  facilitators: readonly { uid: string; role: "lead" | "second" }[];
};

export type GroupAdded = { key: string; name: string; session: SessionSlot; room: number };
export type TimeChanged = {
  key: string;
  groupId: string;
  name: string;
  session: SessionSlot;
  from: { weekday: number; start: string };
};
/** Somebody whose group changes: `to` is a preview group's key, or null for no group. */
export type PlaceChanged = { uid: string; from: string | null; to: string | null };
/** The facilitators who offered that a group gains, and its whole list once they are added. */
export type FacilitatorsAdded = { key: string; added: string[]; uids: string[] };

export type ChangeSet = {
  groups: GroupAdded[];
  times: TimeChanged[];
  places: PlaceChanged[];
  facilitators: FacilitatorsAdded[];
  /** Marked to facilitate in the preview, and did not offer: asked by hand, never sent. */
  toAsk: { uid: string; key: string }[];
  /** How many changes a press would send: groups, times, places and facilitators, one each. */
  count: number;
};

const sameStart = (a: SessionSlot, b: SessionSlot) =>
  a.weekday === b.weekday && a.startTimeLocal === b.startTimeLocal;

const lower = (name: string) => name.trim().toLowerCase();

/** The first "Group A", "Group B" no group has, after the last letter where every group is named that way. */
export function freeGroupName(taken: readonly string[]): string {
  const used = new Set(taken.map(lower));
  const letters = taken.map((name) => /^group ([a-z])$/i.exec(name.trim())?.[1]?.toUpperCase() ?? null);
  if (taken.length > 0 && letters.every((letter) => letter !== null)) {
    const next = Math.max(...letters.map((letter) => letter!.charCodeAt(0))) + 1;
    if (next <= 90) return `Group ${String.fromCharCode(next)}`;
  }
  for (let code = 65; code <= 90; code += 1) {
    const name = `Group ${String.fromCharCode(code)}`;
    if (!used.has(lower(name))) return name;
  }
  let n = taken.length + 1;
  while (used.has(lower(`Group ${n}`))) n += 1;
  return `Group ${n}`;
}

/**
 * The preview with every new group the run now has recognised: a new group
 * whose name a live group has, at the same day and start, IS that group (an
 * earlier press made it). One whose name a live group has at another time is
 * renamed, so the press does not stop on a name that is taken.
 */
export function recognise(draft: readonly DraftGroup[], live: readonly LiveGroupFacts[]): DraftGroup[] {
  const claimed = new Set(draft.flatMap((group) => (group.id ? [group.id] : [])));
  const out: DraftGroup[] = [];
  for (const group of draft) {
    if (group.id !== null) {
      out.push(group);
      continue;
    }
    const same = live.find((each) => lower(each.name) === lower(group.name));
    if (same && !claimed.has(same.id) && same.session && group.session && sameStart(same.session, group.session)) {
      claimed.add(same.id);
      out.push({ ...group, id: same.id });
      continue;
    }
    if (same) {
      const taken = [...live.map((each) => each.name), ...draft.map((each) => each.name), ...out.map((each) => each.name)];
      out.push({ ...group, name: freeGroupName(taken) });
      continue;
    }
    out.push(group);
  }
  return out;
}

/**
 * A suggestion's groups as a preview over the run: its groups, then any of
 * the run's groups it leaves out (one it could give no time), with whoever
 * sits in it now and is not seated elsewhere in the suggestion, so nobody is
 * taken out of a group because a suggestion could not draw it.
 */
export function draftOver(groups: readonly DraftGroup[], live: readonly LiveGroupFacts[]): DraftGroup[] {
  const shown = new Set(groups.flatMap((group) => (group.id ? [group.id] : [])));
  const seated = new Set(groups.flatMap((group) => group.memberUids));
  const out = [...groups];
  for (const group of live) {
    if (shown.has(group.id)) continue;
    out.push({
      key: `live-${group.id}`,
      id: group.id,
      name: group.name,
      session: group.session,
      room: Math.max(group.memberUids.length, 1),
      memberUids: group.memberUids.filter((uid) => !seated.has(uid)),
      facilitators: [],
    });
  }
  return out;
}

/** The differences between the run as it is and a preview over it: what a press sends. */
export function changesBetween(
  live: { groups: readonly LiveGroupFacts[]; people: LivePeople },
  draft: readonly DraftGroup[],
): ChangeSet {
  const liveById = new Map(live.groups.map((group) => [group.id, group] as const));
  const out: ChangeSet = { groups: [], times: [], places: [], facilitators: [], toAsk: [], count: 0 };

  for (const group of draft) {
    if (group.id === null) {
      if (group.session) out.groups.push({ key: group.key, name: group.name.trim(), session: group.session, room: group.room });
      continue;
    }
    const was = liveById.get(group.id);
    if (!was || !group.session) continue;
    if (!was.session || !sameStart(was.session, group.session)) {
      out.times.push({ key: group.key, groupId: group.id, name: group.name, session: group.session, from: { ...was.slot } });
    }
  }

  // Where each person is in the preview: a group's key, or nowhere.
  const target = new Map<string, string>();
  for (const group of draft) for (const uid of group.memberUids) if (!target.has(uid)) target.set(uid, group.key);
  const idOf = new Map(draft.map((group) => [group.key, group.id] as const));
  for (const uid of Object.keys(live.people).sort()) {
    const now = own(live.people, uid)?.groupId ?? null;
    const to = target.get(uid) ?? null;
    if (to === null) {
      if (now !== null) out.places.push({ uid, from: now, to: null });
      continue;
    }
    const toId = idOf.get(to) ?? null;
    if (toId !== null && toId === now) continue;
    out.places.push({ uid, from: now, to });
  }

  for (const group of draft) {
    const already = group.id ? (liveById.get(group.id)?.facilitatorUids ?? []) : [];
    const added: string[] = [];
    for (const { uid } of group.facilitators) {
      if (already.includes(uid) || added.includes(uid)) continue;
      if (own(live.people, uid)?.offered === true) added.push(uid);
      else out.toAsk.push({ uid, key: group.key });
    }
    if (added.length > 0) out.facilitators.push({ key: group.key, added, uids: [...already, ...added] });
  }

  out.count =
    out.groups.length +
    out.times.length +
    out.places.length +
    out.facilitators.reduce((sum, each) => sum + each.added.length, 0);
  return out;
}

/**
 * The order the places are sent in: out of a group first, then from one
 * group to another, then into a group for the first time, each by account,
 * so a seat a move frees is free before anybody is put in it.
 */
export function placementOrder(places: readonly PlaceChanged[]): PlaceChanged[] {
  const rank = (place: PlaceChanged) => (place.to === null ? 0 : place.from !== null ? 1 : 2);
  return [...places].sort((a, b) => rank(a) - rank(b) || a.uid.localeCompare(b.uid));
}
