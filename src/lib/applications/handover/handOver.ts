import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION, type CourseAuditKind } from "@/lib/firestore/courseAudit";
import { buildFormPlaceRow, courseApplicationId } from "@/lib/firestore/courseApplications";
import { canRunTerm } from "../access";
import { own } from "../keys";
import type { ProgrammeSettings } from "../model";
import { isApplicationForm, isId, normaliseForm, type ApplicationForm } from "../normalise";
import { formRef, loadForm } from "../repo";
import { listDecisions, listSentApplications } from "../staffRepo";
import { placeHoldersOn, type PlaceHolder } from "./holders";
import {
  RUN_APPLICATIONS_COLLECTION,
  readRun,
  runRef,
  runStanding,
  type Done,
  type Refusal,
  type RunRead,
} from "./run";

/**
 * THE HAND-OVER: the people who hold a place on a programme, onto the list
 * its run's allocation board reads.
 *
 * Decision day tells everybody where they stand. Groups are then formed on a
 * course run's allocation board, which lists the ACCEPTED rows in the run's
 * own applications collection and nobody else. So after decisions have been
 * sent an admin presses this once for each programme, and it writes one such
 * row for each person who holds a place on it (`placeHoldersOn`).
 *
 * ## What a press does, and all it does
 *
 *  - It CREATES a row for each holder who has none: who they are, that they
 *    hold a place, and where the place came from (`buildFormPlaceRow`).
 *  - It moves the run's own count of accepted applications by the number of
 *    rows it made, in the same transaction, like every other writer of a row.
 *  - It appends one line to the course log saying how many, and who pressed.
 *
 * It never changes a row that is already there, whatever that row says. It
 * removes nobody. It puts nobody in a group: the board's first placement
 * goes on making the place on the run, as it always has. It emails nobody.
 *
 * ## Pressed twice, and twice at once
 *
 * A row's id is the run and the person (`courseApplicationId`), so there is
 * one place it can be. Each transaction reads the rows it is about to write
 * and creates only the ones that are missing. A second press finds them all
 * and writes nothing at all. Two presses at once read the same gaps; the one
 * that commits second has read rows that changed, runs again, finds them
 * there and creates none, so the count moves once.
 *
 * ## What is asked again inside the transaction
 *
 * That decisions have been sent, which run the programme names, and that the
 * run can still take people. All three are read through the transaction, so
 * a run changed or archived while a press runs makes it run again and meet
 * the refusal. Who holds a place is read just before, outside it: a reply
 * that lands during a press can leave somebody handed over who has just given
 * their place back, and the panel then names them, as it does for anybody who
 * gives a place back later.
 *
 * Admin only (`canRunTerm`, asked of the session before anything is read).
 */

export const HAND_OVER_AUDIT_KIND = "run-hand-over" satisfies CourseAuditKind;

export const ONLY_AN_ADMIN_HANDS_OVER = "Only an admin can hand people over to a course run.";
const NO_FORM: Refusal = { ok: false, status: 404, error: "There is no application form here." };
const NO_PROGRAMME: Refusal = { ok: false, status: 404, error: "That programme is not on this form." };

export const DECISIONS_NOT_SENT =
  "Decisions have not been sent yet. People are handed over once everybody has been told.";
export const NO_RUN_NAMED = "Say which course run this programme places people on first.";
export const RUN_IS_A_DRAFT =
  "That run is still a draft. Move it on from draft first: its members cannot open a draft run.";
export const CHANGED_WHILE_PRESSING =
  "Something about this programme’s run changed while that was running. Check the run and press again.";

/** What each way a named run can have stopped standing is told as, at a hand-over. */
const RUN_NO_LONGER_STANDS: Record<
  Exclude<ReturnType<typeof runStanding>, { ok: true }>["why"],
  string
> = {
  "no-course": "This programme is no longer tied to a course page, so its run cannot take people.",
  gone: "The run this programme names is no longer on the site. Pick another run.",
  "other-course": "The run this programme names is not a run of the course it is tied to. Pick another run.",
  archived: "The run this programme names has been archived, so nobody can be placed on it.",
  over: "The run this programme names has finished or was cancelled, so nobody can be placed on it.",
  "open-enrolment":
    "The run this programme names takes sign-ups from a session picker, so nobody is placed on it from here.",
};

/**
 * What stops a hand-over, as a sentence, or null when one can be pressed.
 * The same answer for the panel that draws the button and for the writer,
 * which asks it again of what its transaction read.
 */
export function handOverBlocker(
  form: Pick<ApplicationForm, "decisionsSentAt">,
  programme: Pick<ProgrammeSettings, "runId" | "courseId">,
  run: RunRead | null,
): string | null {
  if (form.decisionsSentAt === null) return DECISIONS_NOT_SENT;
  if (programme.runId === null) return NO_RUN_NAMED;
  const standing = runStanding(run, programme.courseId);
  if (!standing.ok) return RUN_NO_LONGER_STANDS[standing.why];
  // A draft run has never had anybody on it, and nothing in the member area
  // is written for one: its own members cannot read a draft run's document.
  if (run?.run.status === "draft") return RUN_IS_A_DRAFT;
  return null;
}

export type HandOverReceipt = {
  /** Rows this press created. */
  handedOver: number;
  /** People who hold a place and already had a row on the run. */
  alreadyThere: number;
};

/** Rows read and written per transaction: well inside the limit on writes. */
const CHUNK = 200;

/** One sentence for the log. It says how many, and names nobody. */
export function handOverSentence(input: {
  actorName: string;
  programmeName: string;
  count: number;
}): string {
  const people = input.count === 1 ? "1 person" : `${input.count} people`;
  return `${input.actorName} handed over ${people} who hold a place on ${input.programmeName} to this run’s allocation board.`;
}

const actorNameOf = (user: SessionUser) => (user.displayName ?? "").trim() || "Someone";

/**
 * Hand over everybody who holds a place on this programme and is not yet on
 * its run's list. See the note at the top for everything it does and does
 * not do.
 */
export async function handOverProgramme(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<Done<HandOverReceipt> | Refusal> {
  if (!canRunTerm(actor)) return { ok: false, status: 403, error: ONLY_AN_ADMIN_HANDS_OVER };
  if (!isId(roundId)) return NO_FORM;
  if (!isId(programmeId)) return NO_PROGRAMME;

  const form = await loadForm(db, roundId);
  if (!form) return NO_FORM;
  const programme = own(form.programmes, programmeId);
  if (!programme) return NO_PROGRAMME;

  // NOBODY'S APPLICATION IS READ UNTIL EVERYBODY HAS BEEN TOLD. Everything
  // below lists the whole term, the caller's own application included, which
  // no committee screen may do while a decision could still be learnt early.
  if (form.decisionsSentAt === null) return { ok: false, status: 409, error: DECISIONS_NOT_SENT };

  // The rest is asked once here, so a press that plainly cannot go is
  // answered without reading anybody's application. All of it is asked again
  // inside each transaction.
  const runId = programme.runId;
  const runSnap = runId === null ? null : await runRef(db, runId).get();
  const early = handOverBlocker(
    form,
    programme,
    runSnap && runSnap.exists ? readRun(runSnap.id, runSnap.data()) : null,
  );
  if (early !== null || runId === null) {
    return { ok: false, status: 409, error: early ?? NO_RUN_NAMED };
  }

  const [applications, decisions] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
  ]);
  const holders = placeHoldersOn(form, programmeId, applications, decisions);

  const receipt: HandOverReceipt = { handedOver: 0, alreadyThere: 0 };
  for (let from = 0; from < holders.length; from += CHUNK) {
    const chunk = holders.slice(from, from + CHUNK);
    const outcome = await db.runTransaction((tx) =>
      writeChunk(tx, db, actor, { roundId, programmeId, runId }, chunk),
    );
    if (!outcome.ok) return outcome;
    receipt.handedOver += outcome.value.handedOver;
    receipt.alreadyThere += outcome.value.alreadyThere;
  }
  return { ok: true, value: receipt };
}

/**
 * One transaction: read what the press depends on again, then create the
 * rows that are missing. The counts are returned and never kept outside, so
 * a transaction that runs twice is counted once.
 */
async function writeChunk(
  tx: Transaction,
  db: Firestore,
  actor: SessionUser,
  target: { roundId: string; programmeId: string; runId: string },
  chunk: readonly PlaceHolder[],
): Promise<Done<HandOverReceipt> | Refusal> {
  const { roundId, programmeId, runId } = target;
  const formSnap = await tx.get(formRef(db, roundId));
  if (!formSnap.exists || !isApplicationForm(formSnap.data())) return NO_FORM;
  const form = normaliseForm(formSnap.id, formSnap.data());
  const programme = own(form.programmes, programmeId);
  if (!programme) return NO_PROGRAMME;
  if (programme.runId !== runId) return { ok: false, status: 409, error: CHANGED_WHILE_PRESSING };

  const ref = runRef(db, runId);
  const runSnap = await tx.get(ref);
  const run = runSnap.exists ? readRun(runSnap.id, runSnap.data()) : null;
  const blocked = handOverBlocker(form, programme, run);
  if (blocked !== null || !run) return { ok: false, status: 409, error: blocked ?? CHANGED_WHILE_PRESSING };

  const rows = db.collection(RUN_APPLICATIONS_COLLECTION);
  const refs = chunk.map((holder) => rows.doc(courseApplicationId(runId, holder.uid)));
  const found = await tx.getAll(...refs);

  let handedOver = 0;
  chunk.forEach((holder, at) => {
    // There already, whatever it says: a row is never changed from here.
    if (found[at].exists) return;
    tx.create(refs[at], {
      ...buildFormPlaceRow({
        runId,
        courseId: run.run.courseId,
        uid: holder.uid,
        displayName: holder.name,
        fromForm: { roundId, programmeId },
      }),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    handedOver += 1;
  });

  if (handedOver > 0) {
    // The count moves with the rows, in the transaction that makes them.
    tx.update(ref, {
      "applicationCounts.accepted": FieldValue.increment(handedOver),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      kind: HAND_OVER_AUDIT_KIND,
      // About the run, so keyed to the run: the form's own id is not on the
      // row, and the run is what outlives the form.
      runId,
      roundId: null,
      groupId: null,
      // About several people and naming none of them.
      subjectUid: null,
      actorUid: actor.uid,
      actorName: actorNameOf(actor),
      targetLabel: `${form.round.label} · ${programme.shortName}`,
      detail: handOverSentence({
        actorName: actorNameOf(actor),
        programmeName: programme.shortName,
        count: handedOver,
      }),
      at: FieldValue.serverTimestamp(),
    });
  }
  return { ok: true, value: { handedOver, alreadyThere: chunk.length - handedOver } };
}
