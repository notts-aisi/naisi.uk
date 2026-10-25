import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { opensProgrammeGroups, roleOnProgramme } from "../access";
import { isInTerm } from "../decisions";
import { own } from "../keys";
import { isId } from "../normalise";
import { loadForm } from "../repo";
import { listDecisions, listSentApplications } from "../staffRepo";
import { placeHoldersOn } from "./holders";
import { paintedWeekOf } from "./paintedWeek";
import { RUNS_COLLECTION, readRun } from "./run";
import {
  defaultLength,
  lengthFromGroups,
  lengthOptions,
  pickLength,
  timesPicture,
  type LengthSource,
  type TimesGroup,
  type TimesPicture,
} from "./times";

/**
 * THE TIMES PICTURE'S ONE READ, for the Groups tab of a programme.
 *
 * AN ADMIN'S AND THE PROGRAMME'S LEAD'S, DECIDED BEFORE ANYBODY IS READ. The
 * picture counts the people who hold a place by when they said they are free,
 * and names the ones no group suits. On the course side those people are
 * seen by an admin and by the lead of the programme that names the run
 * (`rowIsServedTo`), so those two are answered here (`opensProgrammeGroups`).
 * Anybody else with a role on the programme, a reviewer, is answered once
 * the form's settings say who leads it, before anybody's application, any
 * decision or the run is read.
 *
 * WHAT IS READ: the form, the run its programme names and that run's groups,
 * then, once decisions have gone out, every sent application and decision on
 * the form, so that who holds a place is `holdingOf()`'s answer and nobody
 * else's. The painted weeks are read off each application through
 * `paintedWeekOf`, the reading the allocation board uses.
 *
 * WHAT IS WRITTEN: nothing. Nothing of anybody's week is kept: the picture
 * is worked out on each request and drawn into an admin's page.
 *
 * NOBODY IS COUNTED UNTIL DECISIONS HAVE BEEN SENT. Who holds a place is a
 * person's to be told on decision day, as the hand-over panel beside it on
 * the Settings tab has it.
 */

/** What the page draws, field by field. */
export type TimesView = {
  roundId: string;
  programmeId: string;
  /**
   * Who is looking: an admin, or the programme's lead. A lead is not offered
   * what only an admin can do from here (naming the run, the run editor).
   */
  viewer: "admin" | "lead";
  /** The programme in a sentence: "AGI Strategy". */
  programmeName: string;
  /** The run the programme names, while it is on the site. */
  run: { id: string; courseId: string } | null;
  /**
   * Why there is no picture, or null when there is one:
   *  - `no-run`: the programme names no course run yet;
   *  - `run-gone`: the run it names is no longer on the site;
   *  - `not-sent`: decisions have not gone out, so nobody holds a place yet.
   */
  blank: "no-run" | "run-gone" | "not-sent" | null;
  /** The length counted, the lengths that can be picked, and where the default came from. */
  length: { counted: number; options: number[]; source: LengthSource };
  /** Null whenever `blank` says why. */
  picture: TimesPicture | null;
};

export type TimesOutcome =
  | { status: "ok"; view: TimesView }
  /** No form here, no such programme on it, or no role on it. */
  | { status: "none" }
  /**
   * Somebody with a role on the programme who is neither an admin nor its
   * lead. Only the form was read: nobody's application, decision or run.
   */
  | { status: "not-yours" };

const GROUPS_COLLECTION = "courseGroups";

/** The run's groups that are not archived, reduced to what the picture reads. */
async function groupsOf(db: Firestore, runId: string): Promise<TimesGroup[]> {
  // One equality on one field, so no declared index.
  const snap = await db.collection(GROUPS_COLLECTION).where("runId", "==", runId).get();
  const groups: TimesGroup[] = [];
  for (const doc of snap.docs) {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    if (group.archived) continue;
    groups.push({
      id: group.id,
      name: group.name.trim() || "Untitled group",
      // The weekly slot and nothing else: no room and no meeting link.
      session: {
        weekday: group.session.weekday,
        startTimeLocal: group.session.startTimeLocal,
        durationMinutes: group.session.durationMinutes,
      },
    });
  }
  return groups;
}

/** The picture, for an admin or the programme's lead. `requestedLength` is the address's `length`, as it came. */
export async function loadTimesPicture(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  requestedLength: unknown,
): Promise<TimesOutcome> {
  if (!isId(roundId) || !isId(programmeId)) return { status: "none" };
  const form = await loadForm(db, roundId);
  if (!form) return { status: "none" };
  const programme = own(form.programmes, programmeId);
  if (!programme) return { status: "none" };
  // Who leads it, from the form's settings, asked at the point of use.
  const role = roleOnProgramme(actor, form, programmeId);
  if (role === null) return { status: "none" };
  if (!opensProgrammeGroups(role)) return { status: "not-yours" };

  const view: TimesView = {
    roundId: form.round.id,
    programmeId: programme.id,
    viewer: role === "admin" ? "admin" : "lead",
    programmeName: programme.shortName,
    run: null,
    blank: "no-run",
    length: { counted: 0, options: [], source: { kind: "none" } },
    picture: null,
  };

  if (programme.runId !== null) {
    const snap = await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
    const read = snap.exists ? readRun(snap.id, snap.data()) : null;
    view.blank = read ? null : "run-gone";
    if (read) view.run = { id: read.run.id, courseId: read.run.courseId };
  }
  if (!view.run) return { status: "ok", view };

  const groups = await groupsOf(db, view.run.id);
  const source = lengthFromGroups(groups);
  const options = lengthOptions(groups);
  const counted = pickLength(requestedLength, options, defaultLength(source));
  view.length = { counted, options, source };

  // Nobody is counted, or named, until everybody has been told.
  if (form.decisionsSentAt === null) return { status: "ok", view: { ...view, blank: "not-sent" } };

  const [applications, decisions] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
  ]);
  // Counted from the people in the term, like every other count of places.
  const inTerm = applications.filter(isInTerm);
  const byUid = new Map(inTerm.map((application) => [application.uid, application] as const));
  const people = placeHoldersOn(form, programme.id, inTerm, decisions).map((holder) => ({
    uid: holder.uid,
    name: holder.name,
    week: paintedWeekOf(form.round.availabilityGrid, byUid.get(holder.uid) ?? null),
  }));

  view.picture = timesPicture({ grid: form.round.availabilityGrid, minutes: counted, people, groups });
  return { status: "ok", view };
}
