import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  AVAILABILITY_DAYS,
  normalizeAvailabilityMask,
  type AvailabilityGrid,
  type AvailabilityMask,
} from "@/lib/admissions/availability";
import { freeUntilWords, groupsGoOutDay } from "@/lib/courses/groupsGoOut";
import { readPlaceOnRun } from "@/lib/courses/placeOnRun";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { ApplicantError, changeSentAvailability } from "../applicant/store";
import { isId, own } from "../keys";
import type { ApplicationDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { loadForm, loadOwnApplication } from "../repo";
import { standingOf } from "./standing";

/**
 * "WHEN YOU’RE FREE" STAYS OPEN UNTIL GROUPS GO OUT (Q7: boards
 * st-application-phone and st-late-phone).
 *
 * Somebody holding a place on a fellowship can change the week they painted
 * on the form, from their own application page, until Publish has told them
 * their group. It is the same week the form asked for, on the form's own
 * grid, held to the same codec and limits as a save of the form
 * (`normalizeAvailabilityMask` against the form's grid, at most seven days),
 * and it is written where the week has always been: the application of
 * record (`sent.availability`, and the draft beside it), by the one writer
 * of what was sent (`changeSentAvailability` in `../applicant/store.ts`),
 * which keeps the version it replaces as a send keeps one. So the
 * allocation board's fit marks and the times picture, which read that week
 * through `paintedWeekOf`, read the changed one the next time they are
 * drawn.
 *
 * WHO. A place is the person's own page's reading of their own application
 * (`standingOf`): this is the application system's own door, and it may not
 * read a decision. Not before decision day has told them, not an invitation
 * not yet answered, not a place given back, not an incubator's (whose people
 * are told of no group). ONCE PUBLISH HAS TOLD THEM their group, or once
 * they have left or been taken off, the week is the group's, and it is shut
 * (`readPlaceOnRun`, the one reading of where a place stands on its run).
 *
 * Reads and writes the caller's own application, by the session's uid, and
 * reads their own seat and the run. Nothing of anybody else's.
 */

export type WhenFreeView = {
  /** The form's grid, which the editor draws on. */
  grid: AvailabilityGrid;
  /** The week as painted, on that grid. */
  availability: AvailabilityMask;
  /** "We use this to put you in a group. You can change it until we email your group on Wed 28 Oct." */
  line: string;
};

export const WHEN_FREE_SHUT_PLACE = "Only somebody holding a place on a fellowship can change when they’re free here.";
export const WHEN_FREE_SHUT_TOLD =
  "We’ve emailed you your group, so when you’re free can’t be changed here now. Email ai-safety@uonsu.com if it has changed.";
type Open = { open: true; programmeId: string; groupsGoOutOn: string | null };
/** Why it is shut: no place on a fellowship, or a place whose group has been told (or which has left). */
type Shut = { open: false; why: "no-place" | "told" };

/** Whether the week is still theirs to change, and the day groups go out; or why not. */
async function openFor(
  db: Firestore,
  form: ApplicationForm,
  application: ApplicationDoc,
  uid: string,
  now: Date,
): Promise<Open | Shut> {
  if (!application.sent) return { open: false, why: "no-place" };
  const standing = standingOf(application);
  if (standing.kind !== "place" || !standing.programmeId) return { open: false, why: "no-place" };
  const programme = own(form.programmes, standing.programmeId);
  if (!programme || programme.kind !== "fellowship") return { open: false, why: "no-place" };
  const onRun = await readPlaceOnRun(db, form, standing.programmeId, uid, now);
  if (onRun.kind !== "not-in-a-group") return { open: false, why: "told" };
  const runId = programme.runId;
  let groupsGoOutOn: string | null = null;
  if (runId && isId(runId)) {
    const snap = await db.collection("courseRuns").doc(runId).get();
    if (snap.exists && snap.data()?.destroying !== true) {
      groupsGoOutOn = normalizeCourseRun(snap.id, snap.data() ?? {}).groupsGoOutOn;
    }
  }
  return { open: true, programmeId: standing.programmeId, groupsGoOutOn };
}

/**
 * What the application page's "When you’re free" card draws for this person,
 * or null when the week is not theirs to change (and the card is not drawn).
 */
export async function loadWhenFree(
  db: Firestore,
  roundId: string,
  uid: string,
  now: Date,
): Promise<WhenFreeView | null> {
  if (!isId(roundId)) return null;
  const form = await loadForm(db, roundId);
  if (!form) return null;
  const application = await loadOwnApplication(db, form, uid);
  if (!application?.sent) return null;
  const open = await openFor(db, form, application, uid, now);
  if (!open.open) return null;
  const grid = form.round.availabilityGrid;
  return {
    grid,
    availability: normalizeAvailabilityMask(application.sent.availability, grid),
    line: freeUntilWords(groupsGoOutDay(open.groupsGoOutOn, londonDateKey(now))),
  };
}

/** The days a request carries, or the sentence that says what is wrong with them. */
export function readFreeDays(raw: unknown): { days: unknown[] } | { error: string } {
  const body = (raw ?? null) as { days?: unknown } | null;
  const days = body && typeof body === "object" ? body.days : undefined;
  if (!Array.isArray(days)) return { error: "Send the week you’re free as its days." };
  if (days.length > AVAILABILITY_DAYS) return { error: "That is more days than the availability grid has." };
  return { days };
}

/**
 * Change the painted week. Answers whether anything changed. Every refusal
 * is an `ApplicantError` the route answers with.
 */
export async function changeWhenFree(
  db: Firestore,
  form: ApplicationForm,
  uid: string,
  days: unknown[],
  now: Date,
): Promise<{ changed: boolean }> {
  const before = await loadOwnApplication(db, form, uid);
  if (!before) throw new ApplicantError("There is no application of yours on this form.", 404);
  const open = await openFor(db, form, before, uid, now);
  if (!open.open) throw new ApplicantError(open.why === "told" ? WHEN_FREE_SHUT_TOLD : WHEN_FREE_SHUT_PLACE, 409);
  const grid = form.round.availabilityGrid;
  // The form's grid FIRST, so the request's days cannot bring a geometry with them.
  const next = normalizeAvailabilityMask({ ...grid, days }, grid);

  return changeSentAvailability(db, form, uid, next);
}
