import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { fromFirstMark, markedRanges, type MarkedRange, type SessionSlot } from "@/lib/admissions/availability";
import { claudeConfigured } from "@/lib/ai/claude";
import { formPlaceFactsFor } from "@/lib/applications/handover/board";
import { paintedWeekOf } from "@/lib/applications/handover/paintedWeek";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { loadApplication } from "@/lib/applications/staffRepo";
import { loadPublishPlan, readGroupSessions, type PlannedOutside, type PublishPlan } from "@/lib/courses/allocationPublish";
import { doesTrackLeadWork, runStaffingOf, type RunStaffing } from "@/lib/courses/runStaffing";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseApplication, rowIsServedTo } from "@/lib/firestore/courseApplications";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { PUBLISH_ADMIN_ONLY } from "@/lib/courses/publishWords";
import { readPlacementDrafts } from "./store";
import type { OutsideRow, OutsideSection } from "./view";

export type { OutsideRow, OutsideSection };

/**
 * "OUTSIDE THE TIMES THEY GAVE", read for one caller: the people a press of
 * Publish would tell their group who are placed outside the times they gave,
 * what was chosen for each, and, for an admin, each one's week beside their
 * group's session.
 *
 * WHO: an admin, or the lead of the programme that names the run, decided as
 * Publish decides who that is (`runStaffingOf`): the people who write a note,
 * and the only ones shown one. The people are Publish's own
 * (`loadPublishPlan`'s `outside`), read from the run's rows exactly as the
 * press reads them, so this list and the press's refusal are one list.
 *
 * WHAT AN ADMIN SEES BESIDES: the week the person painted on the form, as
 * stretches of time, against their own group's session, and how much of it
 * falls in what they gave, so a note is written knowing the overlap. And
 * Claude's draft, which only an admin may ask for. A lead sees neither: a
 * lead's screens show no painted week, and the draft is an admin's.
 *
 * Nothing here writes.
 */

export type OutsideRead =
  | { ok: true; section: OutsideSection; plan: PublishPlan; staffing: RunStaffing }
  | { ok: false; status: 403; error: string };

/** How many minutes of a session fall inside the stretches given. */
export function overlapMinutes(ranges: readonly MarkedRange[], session: SessionSlot): number {
  const [h, m] = session.startTimeLocal.split(":").map(Number);
  const start = (h || 0) * 60 + (m || 0);
  const end = start + session.durationMinutes;
  return ranges
    .filter((range) => range.weekday === session.weekday)
    .reduce((sum, range) => sum + Math.max(0, Math.min(end, range.end) - Math.max(start, range.start)), 0);
}

const iso = (at: Date | null) => (at ? at.toISOString() : null);

function noteOf(entry: PlannedOutside): OutsideRow["note"] {
  if (entry.note.state === "noted") return { state: "noted", text: entry.note.text, by: entry.note.by, at: iso(entry.note.at) };
  if (entry.note.state === "without") return { state: "without", by: entry.note.by, at: iso(entry.note.at) };
  return { state: "missing" };
}

/** The week an admin is shown for one person, read from their application on the form. */
async function weekFor(
  db: Firestore,
  forms: Map<string, ApplicationForm | null>,
  entry: PlannedOutside,
  session: SessionSlot | undefined,
): Promise<OutsideRow["week"]> {
  if (!entry.fromForm || !session || !session.startTimeLocal) return null;
  if (!forms.has(entry.fromForm.roundId)) forms.set(entry.fromForm.roundId, await loadForm(db, entry.fromForm.roundId));
  const form = forms.get(entry.fromForm.roundId);
  if (!form) return null;
  const application = await loadApplication(db, form, entry.uid);
  const grid = form.round.availabilityGrid;
  const week = paintedWeekOf(grid, application);
  if (week.kind !== "given" || !application?.sent) return null;
  const mask = application.sent.availability;
  const marked = markedRanges(mask, grid);
  // What the site reads them as free for: their marks, or from each day's
  // first mark on when they marked little in all.
  const read = week.minimal === true ? markedRanges(fromFirstMark(mask, grid), grid) : marked;
  return {
    grid: { startMinute: grid.startMinute, endMinute: grid.endMinute },
    marked,
    fromFirstMark: week.minimal === true,
    session: { weekday: session.weekday, startTimeLocal: session.startTimeLocal, durationMinutes: session.durationMinutes },
    overlapMinutes: overlapMinutes(read, session),
  };
}

/** The section for this caller, with the plan it was read from. */
export async function readOutsideSection(db: Firestore, actor: SessionUser, run: CourseRunDoc): Promise<OutsideRead> {
  const staffing = await runStaffingOf(db, actor, run);
  // An admin or the lead of the programme that names the run: the people a
  // note is written by, and the only ones who see one. A track lead and no
  // more is refused here, as everybody else is.
  if (!doesTrackLeadWork(staffing) || (!staffing.isAdmin && staffing.leadOf === null)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  // The run's rows, each asked who it is served to, exactly as Publish reads them.
  const appSnap = await db.collection("courseApplications").where("runId", "==", run.id).limit(500).get();
  const rows = appSnap.docs.map((d) => normalizeCourseApplication(d.id, d.data() ?? {}));
  const served = rows.filter((a) => rowIsServedTo(a, staffing));
  const accepted = served.filter((a) => a.status === "accepted");
  const sessions = await readGroupSessions(db, run.id);
  const formPlaces = await formPlaceFactsFor(db, staffing, accepted.filter((a) => a.fromForm !== null), sessions);
  const plan = await loadPublishPlan(db, run, {
    accepted,
    adminOnly: served.length < rows.length,
    formPlaces,
  });
  if (plan.adminOnly) return { ok: false, status: 403, error: PUBLISH_ADMIN_ONLY };

  const admin = staffing.isAdmin;
  const claude = admin && claudeConfigured();
  const sessionOf = new Map(sessions.map((group) => [group.id, group.session] as const));
  // Claude's drafts, an admin's alone: a lead is never sent one.
  const drafts = admin
    ? await readPlacementDrafts(
        db,
        run.id,
        plan.outside.flatMap((entry) => (entry.fromForm ? [{ uid: entry.uid, roundId: entry.fromForm.roundId }] : [])),
      )
    : new Map();
  const forms = new Map<string, ApplicationForm | null>();
  const rowsOut: OutsideRow[] = [];
  for (const entry of plan.outside) {
    rowsOut.push({
      uid: entry.uid,
      name: entry.name,
      groupId: entry.groupId,
      groupName: entry.groupName,
      meets: entry.meets,
      note: noteOf(entry),
      draft: admin && drafts.has(entry.uid) ? { text: drafts.get(entry.uid)!.text, basis: drafts.get(entry.uid)!.basis } : null,
      canDraft: claude && entry.fromForm !== null && entry.uid !== actor.uid,
      own: entry.uid === actor.uid,
      week: admin ? await weekFor(db, forms, entry, sessionOf.get(entry.groupId)) : null,
    });
  }
  return { ok: true, section: { admin, rows: rowsOut, needed: plan.notesNeeded }, plan, staffing };
}
