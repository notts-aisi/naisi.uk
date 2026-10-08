import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseApplicationDoc } from "@/lib/firestore/courseApplications";
import { COURSE_RUN_STATUS_LABEL } from "@/lib/firestore/courses";
import { canRunTerm } from "../access";
import { applicationFormPath } from "../editor/olderRounds";
import { own } from "../keys";
import type { ProgrammeSettings } from "../model";
import { isId, type ApplicationForm } from "../normalise";
import { loadForm } from "../repo";
import { listDecisions, listSentApplications } from "../staffRepo";
import { handOverBlocker } from "./handOver";
import { compareWithRun, nameOnRecord, placeHoldersOn, type PlaceHolder } from "./holders";
import {
  RUNS_COLLECTION,
  RUN_APPLICATIONS_COLLECTION,
  RUN_HAS_APPLICATIONS,
  RUN_LOCKED,
  RUN_TAKEN,
  isRowFrom,
  listForms,
  listRunRows,
  programmeNaming,
  readRun,
  runStanding,
  standingSentence,
  type RunRead,
} from "./run";
import type { HandOverPersonView, RunChoiceView, RunPanelView } from "./views";

/**
 * THE "COURSE RUN" PANEL'S ONE READ.
 *
 * For an admin, on a programme's Settings tab: the runs the programme can
 * name, the run it names, what stops a hand-over, and how the people who
 * hold a place compare with the run's own list.
 *
 * ADMIN ONLY, AND DECIDED BEFORE ANYTHING IS READ. The panel names people,
 * and naming a run and handing people over are part of running the term.
 *
 * NOBODY IS NAMED UNTIL DECISIONS HAVE BEEN SENT. Who holds a place is only a
 * person's to be told on decision day, and a hand-over cannot run before it,
 * so before then the panel says what is in the way and lists nobody.
 *
 * AN ADMIN WHO APPLIED IS LISTED LIKE ANYBODY ELSE. Every other committee
 * screen leaves the viewer's own application out, because what is decided
 * about a person is not theirs to see early. Nothing here is early: these
 * lists exist only once the term is marked as sent, when everybody, the
 * viewer included, has been told. And the hand-over has to put them on the
 * run like anybody else who holds a place.
 */

export type RunPanelOutcome =
  | { status: "ok"; panel: RunPanelView }
  /** No form here, or no such programme on it. */
  | { status: "none" }
  /** Somebody who is not an admin. Nothing was read. */
  | { status: "not-admin" };

const boardPathFor = (courseId: string, runId: string) =>
  `/admin/courses/${encodeURIComponent(courseId)}/runs/${encodeURIComponent(runId)}/allocation`;
const listPathFor = (courseId: string, runId: string) =>
  `/admin/courses/${encodeURIComponent(courseId)}/runs/${encodeURIComponent(runId)}/applications`;

function labelOf(read: RunRead): string {
  return `${read.run.label.trim() || "Untitled run"} · ${COURSE_RUN_STATUS_LABEL[read.run.status]}`;
}

/**
 * Whether a run has any application of its own. Their ids are enough to
 * know, so nothing of anybody's row is read.
 */
async function runHasApplications(db: Firestore, runId: string): Promise<boolean> {
  const snap = await db.collection(RUN_APPLICATIONS_COLLECTION).where("runId", "==", runId).select().get();
  return snap.docs.length > 0;
}

/**
 * The picker's entries: every run of the tied course, each with whether this
 * programme can name it, then the run already named if it is not one of
 * them. The same rules the writer applies (`setProgrammeRun`), so the route
 * accepts what the picker offered.
 */
async function listRunChoices(
  db: Firestore,
  forms: readonly ApplicationForm[],
  roundId: string,
  programme: ProgrammeSettings,
  chosen: RunRead | null,
): Promise<RunChoiceView[]> {
  const choices: RunChoiceView[] = [];
  let chosenSeen = false;
  if (programme.courseId !== null) {
    const snap = await db.collection(RUNS_COLLECTION).where("courseId", "==", programme.courseId).get();
    for (const doc of snap.docs) {
      const read = readRun(doc.id, doc.data());
      if (!read) continue;
      const isChosen = doc.id === programme.runId;
      if (isChosen) chosenSeen = true;
      const standing = runStanding(read, programme.courseId);
      let note = "";
      if (!standing.ok) note = standingSentence(standing);
      else if (!isChosen) {
        const named = programmeNaming(forms, doc.id);
        const elsewhere = named !== null && !(named.roundId === roundId && named.programmeId === programme.id);
        if (elsewhere) note = RUN_TAKEN;
        else if (await runHasApplications(db, doc.id)) note = RUN_HAS_APPLICATIONS;
      }
      // A run that cannot be picked is still listed while it is the one
      // named, so the box never shows "No run yet" over a name that is stored.
      if (note !== "" && !isChosen && !standing.ok) continue;
      choices.push({ id: doc.id, label: labelOf(read), selectable: note === "", note });
    }
  }
  choices.sort((a, b) => a.label.localeCompare(b.label, "en") || a.id.localeCompare(b.id));
  if (programme.runId !== null && !chosenSeen) {
    // Named, and not among the tied course's runs any more: the run has gone,
    // or the programme's course tie has changed since.
    const standing = runStanding(chosen, programme.courseId);
    choices.push({
      id: programme.runId,
      label: chosen ? labelOf(chosen) : "A run that is no longer on the site",
      selectable: false,
      note: standing.ok ? "" : standingSentence(standing),
    });
  }
  return choices;
}

/** The panel, for an admin. See the note at the top. */
export async function loadRunPanel(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<RunPanelOutcome> {
  if (!canRunTerm(actor)) return { status: "not-admin" };
  if (!isId(roundId) || !isId(programmeId)) return { status: "none" };
  const form = await loadForm(db, roundId);
  if (!form) return { status: "none" };
  const programme = own(form.programmes, programmeId);
  if (!programme) return { status: "none" };

  const runSnap =
    programme.runId === null ? null : await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
  const run = runSnap && runSnap.exists ? readRun(runSnap.id, runSnap.data()) : null;

  const [forms, rows] = await Promise.all([
    listForms(db),
    programme.runId === null ? ([] as CourseApplicationDoc[]) : listRunRows(db, programme.runId),
  ]);
  const choices = await listRunChoices(db, forms, roundId, programme, run);
  const handedOver = rows.some((row) => isRowFrom(row, roundId, programmeId));

  const personPath = (uid: string) =>
    `${applicationFormPath(form.round.id)}/programmes/${programme.id}/applications/${encodeURIComponent(uid)}`;
  const person = (holder: PlaceHolder): HandOverPersonView => ({
    uid: holder.uid,
    name: holder.name,
    applicationPath: personPath(holder.uid),
  });

  const panel: RunPanelView = {
    programmeName: programme.shortName,
    courseTied: programme.courseId !== null,
    runId: programme.runId,
    choices,
    runLocked: handedOver ? RUN_LOCKED : null,
    boardPath: run ? boardPathFor(run.run.courseId, run.run.id) : null,
    listPath: run ? listPathFor(run.run.courseId, run.run.id) : null,
    blocked: handOverBlocker(form, programme, run),
    holders: null,
    onTheList: 0,
    toHandOver: [],
    gaveBack: [],
    notAccepted: [],
    otherRows: 0,
  };
  // Nobody is named, or counted, until everybody has been told.
  if (form.decisionsSentAt === null) return { status: "ok", panel };

  const [applications, decisions] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
  ]);
  const holders = placeHoldersOn(form, programmeId, applications, decisions);
  const names = new Map(applications.map((application) => [application.uid, nameOnRecord(application)]));
  const compared = compareWithRun({ holders, rows, roundId, programmeId, names });
  panel.holders = holders.length;
  panel.onTheList = compared.onTheList.length;
  panel.toHandOver = compared.toHandOver.map(person);
  panel.gaveBack = compared.gaveBack.map(person);
  panel.notAccepted = compared.notAccepted.map(person);
  panel.otherRows = compared.otherRows;
  return { status: "ok", panel };
}
