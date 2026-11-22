import type { AllocGroup, AllocRow } from "@/features/courses/useAllocation";
import type { BoardPanelView, PanelPerson } from "@/lib/applications/handover/boardPanelView";
import { own } from "@/lib/applications/keys";
import { MOVE_HERE, MOVE_HERE_CANT, WARN } from "@/features/applications/circles/circlesWords";
import { notToldYet } from "./peopleInGroupsBoard";

/**
 * WHAT PEOPLE IN GROUPS SHOWN AS RINGS DRAWS, worked out from what the board
 * already holds: the run's groups and who sits in each (the allocation
 * route's answer, as Columns draws it), and when each person is free AS THE
 * PERSON'S PANEL'S ONE READ ANSWERED THIS READER (`BoardPanelView`, from
 * `GET .../programmes/[programmeId]/panel`).
 *
 * EVERY MARK, TAG AND SENTENCE ABOUT SOMEBODY'S TIME COMES FROM THAT ANSWER
 * AND NOTHING ELSE. The server answers a week only where the reader may read
 * the person's application; for anybody else it answers `may-not`, and here
 * that person is `unknown` for every group: no red tag, no "didn’t mark this
 * time as free", no "(can’t make it)" on a Move here. The card marks the
 * allocation route carries (`fromForm`) are Columns' and are never read here.
 * A person whose week is no longer on file is `unknown` too: nothing is
 * known of it to say.
 *
 * Pangram's flag is an admin's alone: drawn only for an admin, from the
 * panel's admins-only part, which the server sends nobody else.
 *
 * Pure, with no server import, so the board in the browser and a test read
 * the same rings. The words are Circles' own (`circlesWords.ts`).
 */

/** Whether somebody can make a group's time, as far as this reader has been told. */
export type RingFit = "fits" | "cant" | "unknown";

/** One person around a ring. */
export type RingMember = {
  uid: string;
  name: string;
  /** "Amara Okafor" as a name tag: "Amara O.". */
  tag: string;
  /** They facilitate this group and sit in it. */
  facilitating: boolean;
  /** This reader was told they can't make the group's time: the red tag. */
  cant: boolean;
  /** Placed here and not told yet, once the groups are published. */
  notTold: boolean;
  /** Told about another group and moved since: the next Publish emails them. */
  moved: boolean;
  /** Their own answer about this group's time was that they can't make it. */
  cantAnswer: boolean;
  /** Pangram flagged answers: an admin's alone. */
  flagged: boolean;
};

/** One of the run's groups as a ring. */
export type BoardRing = {
  id: string;
  name: string;
  /** Its slot in the board's short form, "" with none. */
  when: string;
  capacity: number | null;
  members: RingMember[];
  /** Its facilitators who hold no place on the run, by first name. */
  outside: { uid: string; firstName: string }[];
  /** What is wrong with it as it stands, a sentence each. */
  warnings: string[];
};

/** "Amara Okafor" as a name tag: "Amara O.". Circles' own. */
export function tagName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

/**
 * Whether somebody can make a group's session, from the panel's answer for
 * this reader alone. Anything but a week the reader was given is `unknown`.
 */
export function fitOf(person: PanelPerson | null | undefined, groupId: string): RingFit {
  const week = person?.week;
  if (!week) return "unknown";
  if (week.kind === "given") {
    const line = week.groups.find((each) => each.key === groupId);
    return line ? (line.fits ? "fits" : "cant") : "unknown";
  }
  // They sent the form with nothing marked: they can make none of the groups drawn on their chart.
  if (week.kind === "none-given") {
    return week.chart.days.some((day) => day.bars.some((bar) => bar.key === groupId)) ? "cant" : "unknown";
  }
  return "unknown";
}

/** The words in the middle of a ring while somebody is picked: Move here, or Move here (can't make it). */
export function moveHereWords(person: PanelPerson | null | undefined, groupId: string): string {
  return fitOf(person, groupId) === "cant" ? MOVE_HERE_CANT : MOVE_HERE;
}

export function ringsOf(input: {
  groups: readonly AllocGroup[];
  /** Who sits in each group now, in the board's order. */
  membersOf: (groupId: string) => readonly AllocRow[];
  nameOf: (uid: string) => string;
  /** The panel's one read, or null while it is on its way or failed: then no mark about anybody's time. */
  panel: BoardPanelView | null;
  admin: boolean;
  /** The run's groups have been published, so a placement can be "Not told yet". */
  published: boolean;
}): BoardRing[] {
  const { groups, membersOf, nameOf, panel, admin, published } = input;
  const personOf = (uid: string) => (panel ? (own(panel.people, uid) ?? null) : null);
  return groups.map((group) => {
    const rows = membersOf(group.id);
    const uids = new Set(rows.map((row) => row.uid));
    const members: RingMember[] = rows.map((row) => {
      const name = nameOf(row.uid);
      const person = personOf(row.uid);
      return {
        uid: row.uid,
        name,
        tag: tagName(name),
        facilitating: group.facilitatorUids.includes(row.uid),
        cant: fitOf(person, group.id) === "cant",
        notTold: notToldYet(row, group, published),
        moved: Boolean(row.moved),
        cantAnswer: published && row.timeAnswer?.kind === "cant",
        flagged: admin && person?.claude?.flagged === true,
      };
    });
    const outside = group.facilitatorUids.flatMap((uid, at) =>
      uids.has(uid) ? [] : [{ uid, firstName: group.facilitatorFirstNames[at] || "NAISI member" }],
    );
    const warnings: string[] = [];
    for (const member of members) if (member.cant) warnings.push(WARN.cant(member.name));
    if (group.capacity !== null && members.length > group.capacity) warnings.push(WARN.over(members.length, group.capacity));
    if (group.facilitatorUids.length === 0) warnings.push(WARN.noFacilitator);
    return { id: group.id, name: group.name, when: group.when, capacity: group.capacity, members, outside, warnings };
  });
}
