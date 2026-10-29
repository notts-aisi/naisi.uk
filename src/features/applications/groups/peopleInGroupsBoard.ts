import type { DropdownOption } from "@/components/ui/Dropdown";
import { cardFit, facilitatedGroupOf, facilitatesWords } from "@/features/courses/allocationFit";
import type { AllocGroup, AllocRow } from "@/features/courses/useAllocation";
import { MARK_CANT_MAKE, MARK_CAN_MAKE } from "@/lib/courses/timeAnswer/words";
import * as words from "./peopleInGroupsWords";

/**
 * WHAT A CARD AND ITS MENU SAY ON A PROGRAMME'S PEOPLE IN GROUPS (board
 * st-groups), as pure functions the board and its tests ask.
 *
 * A card's word about when somebody is free is `cardFit`'s answer, the one
 * every board's card asks (whether they sit in a group whose session they
 * cannot make, whether their card says they gave their place back), put in
 * the board's words: "Hasn’t said when they’re free", "Fits A, B", "Fits
 * none of the 2 times", "Not free Mon 6pm". Whether they said they are
 * coming is the People tab's answer, handed in.
 *
 * Pure, so the board in the browser and a test ask the same functions.
 */

/** The To place column's id: no group has it. */
export const POOL = "__to_place__";
/** The move menu's last choice for a seat still on the run. Not a column. */
export const TAKE_OFF = "__take_off__";

export type Mark = { words: string; tone: "plain" | "warn" | "ok" };

/** The letters of the groups whose session a card's person can make, A before B. */
export function fitTags(row: AllocRow, groups: readonly AllocGroup[]): string[] {
  const timed = groups.filter((group) => group.sessionLabel !== "");
  const fits = row.fromForm
    ? timed.filter((group) => row.fromForm?.availability === "given" && row.fromForm.canMakeGroupIds.includes(group.id))
    : timed.filter((group) => row.availability.includes(group.sessionLabel));
  return [...new Set(fits.map((group) => group.tag))].sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true }));
}

/**
 * Placed in a group and not told yet, once the groups are published: Publish
 * has written no "Your group" email to them since they were put there (a
 * move clears the stamp), and their card does not say they gave their place
 * back, whom no press writes to. The board's mark and the line over it both
 * ask this.
 */
export function notToldYet(row: AllocRow, group: AllocGroup | null, published: boolean): boolean {
  return (
    published &&
    group !== null &&
    row.enrolmentStatus === "active" &&
    !row.allocatedEmailAt &&
    !cardFit(row, { id: group.id, sessionLabel: group.sessionLabel }, []).gaveBack
  );
}

/**
 * Everything a card says under the name, in the board's order, and whether
 * the card is outlined: its person sits in a group whose session they
 * cannot make. `group` is the column the card is in, null for To place.
 * `published`: the run's groups have been published, so a card placed and
 * not told says so.
 */
export function marksOf(
  row: AllocRow,
  group: AllocGroup | null,
  groups: readonly AllocGroup[],
  coming: boolean,
  published = false,
): { marks: Mark[]; warns: boolean } {
  const fit = cardFit(
    row,
    group ? { id: group.id, sessionLabel: group.sessionLabel } : null,
    groups.map((each) => ({ id: each.id, sessionLabel: each.sessionLabel })),
  );
  const marks: Mark[] = [];
  const conflict = fit.conflict && group !== null;
  const tags = fitTags(row, groups);
  const timed = groups.filter((each) => each.sessionLabel !== "").length;
  if (row.fromForm?.availability === "none-given") marks.push({ words: words.HASNT_SAID, tone: "warn" });
  else if (row.fromForm?.availability === "not-on-file") marks.push({ words: words.NOT_ON_FILE, tone: "plain" });
  // Sitting in a group whose session they cannot make: said first, and the
  // card is outlined. The groups they can make still follow, so the lead
  // knows where to move them.
  if (conflict && group) marks.push({ words: words.notFreeWords(group.when || group.name), tone: "warn" });
  if (notToldYet(row, group, published)) marks.push({ words: words.NOT_TOLD_YET, tone: "plain" });
  if (tags.length > 0) marks.push({ words: words.fitsWords(tags), tone: "plain" });
  else if (!conflict && timed > 0 && row.fromForm?.availability === "given") {
    marks.push({ words: words.fitsNoneWords(timed), tone: "warn" });
  }
  // Their answer to "Can you make this time?" about the group they are in
  // (null unless told, and never for a group they have left).
  if (row.timeAnswer?.kind === "yes") marks.push({ words: MARK_CAN_MAKE, tone: "ok" });
  if (row.timeAnswer?.kind === "cant") marks.push({ words: MARK_CANT_MAKE, tone: "warn" });
  if (coming) marks.push({ words: words.COMING, tone: "ok" });
  if (fit.gaveBack) marks.push({ words: words.GAVE_PLACE_BACK, tone: "warn" });
  const facilitates = facilitatedGroupOf(row.uid, groups);
  if (facilitates) {
    marks.push({
      words: facilitatesWords(facilitates.name || "a group"),
      tone: facilitates.id === group?.id ? "plain" : "warn",
    });
  }
  if (row.allocatedEmailAt && row.allocatedEmailDelivery === "held") marks.push({ words: words.EMAIL_HELD, tone: "warn" });
  if (row.allocatedEmailAt && row.allocatedEmailDelivery === "suppressed") {
    marks.push({ words: words.EMAIL_STOPPED, tone: "warn" });
  }
  return { marks, warns: conflict };
}

/**
 * A card's "..." menu: To place, each group with how many sit in it now
 * ("Group A · 7 of 8"), and last, for a seat still on the run, taking its
 * person off the run. `seatedIn` says how many cards a column holds now.
 * No group is held back for being full: the allocate route decides that.
 */
export function menuOptions(
  row: Pick<AllocRow, "enrolmentStatus">,
  groups: readonly Pick<AllocGroup, "id" | "name" | "capacity">[],
  seatedIn: (groupId: string) => number,
): DropdownOption[] {
  return [
    { value: POOL, label: words.TO_PLACE },
    ...groups.map((group) => ({ value: group.id, label: words.moveOptionWords(group.name, seatedIn(group.id), group.capacity) })),
    ...(row.enrolmentStatus === "active" ? [{ value: TAKE_OFF, label: words.TAKE_OFF }] : []),
  ];
}
