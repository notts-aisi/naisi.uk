import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { formatRoundDate } from "@/lib/admissions/window";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { freePlaces, isPooled } from "../decisions";
import type { ApplicationDoc, DecisionDoc, ReviewDoc } from "../model";
import {
  isApplicationForm,
  normaliseApplication,
  normaliseDecision,
  normaliseForm,
  type ApplicationForm,
} from "../normalise";
import { applicationRef, formRef, loadForm } from "../repo";
import { decisionRef, listReviews, listSentApplications } from "../staffRepo";
import { POOL_REASON_LABEL } from "../words";
import { studyLine } from "./boardWords";
import { loadFirstNames } from "./people";
import {
  civilDateLabel,
  invitableFor,
  inviteProblem,
  isInTerm,
  planTerm,
  poolProblem,
  type PoolChoice,
  type Term,
  type TermPerson,
} from "./plan";
import { POOLED_OUTCOME_AUDIT_KIND, programmeOf, shortNameOf } from "./programmes";
import { loadTerm } from "./term";
import type { PoolBoard, PoolComment, PoolProgramme, PoolRow } from "./views";

/**
 * POOLED APPLICANTS: the people no programme they ranked could take, and what
 * each of them will hear.
 *
 * Two things live here. {@link buildPoolBoard} is everything the page shows,
 * built field by field. {@link setPooledOutcome} is the one writer of a
 * pooled applicant's outcome.
 *
 * ## What the writer keeps true
 *
 *  - IT TELLS NOBODY ANYTHING. The outcome is written to the decision
 *    document, which nothing that serves an applicant can reach. The
 *    applicant's own document is not touched and no email is sent: they hear
 *    on decision day, with everybody else.
 *  - AN INVITATION NEEDS A FREE PLACE. The whole term is read inside the
 *    transaction (every application and every decision document on the form),
 *    so two people inviting to a programme's last place cannot both succeed.
 *  - NOBODY ALREADY TOLD IS CHANGED. Once decision day has reached a person,
 *    or has finished for the form, their outcome is what they were told.
 *  - THE DECISION DOCUMENT ALWAYS SAYS WHOSE IT IS. Every write carries
 *    `roundId` and `uid` beside the outcome, because that is how a form's
 *    decisions are found again when the form is removed.
 *  - EVERY CHANGE IS LOGGED: who picked, for whom, and when, as one audit row
 *    in the same transaction. The row names the applicant by uid and not by
 *    name, so the log does not keep somebody's name after their account goes.
 */

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function rowFor(
  form: ApplicationForm,
  term: Term,
  person: TermPerson,
  application: ApplicationDoc | undefined,
  comments: PoolComment[],
): PoolRow {
  const about = application?.sent?.aboutYou;
  const reasons: string[] = [];
  const couldSuit: string[] = [];
  for (const programmeId of person.ranked) {
    const entry = person.decision?.programmes[programmeId];
    if (!entry || entry.decision !== "pool") continue;
    const reason = entry.poolReason ? POOL_REASON_LABEL[entry.poolReason] : "";
    if (reason && !reasons.includes(reason)) reasons.push(reason);
    const suits = programmeOf(form, entry.couldSuitProgrammeId)?.shortName;
    if (suits && !couldSuit.includes(suits)) couldSuit.push(suits);
  }

  const told = person.result !== null;
  let outcome: PoolChoice | null = null;
  if (person.outcome.kind === "invited") {
    outcome = { kind: "invite", programmeId: person.outcome.programmeId };
  } else if (person.outcome.kind === "no-offer") {
    outcome = { kind: "no-offer" };
  }

  return {
    uid: person.uid,
    name: person.name,
    degree: about?.subject.trim() ?? "",
    detail: about ? studyLine(about) : "",
    ranked: person.ranked.map((programmeId, at) => ({
      rank: at + 1,
      programmeId,
      shortName: shortNameOf(form, programmeId),
    })),
    reasons,
    couldSuit,
    comments,
    outcome,
    inviteOptions: told
      ? []
      : invitableFor(form, term.tally, person).map((programmeId) => ({
          programmeId,
          shortName: shortNameOf(form, programmeId),
        })),
    told,
  };
}

export async function buildPoolBoard(
  db: Firestore,
  form: ApplicationForm,
  now: Date,
): Promise<PoolBoard> {
  const [{ term, applications }, reviews] = await Promise.all([
    loadTerm(db, form),
    listReviews(db, form.round.id),
  ]);
  const pooled = term.people.filter((person) => isPooled(person.outcome));
  const pooledUids = new Set(pooled.map((person) => person.uid));

  // Each reviewer's overall comment on a pooled applicant, newest first.
  const written = new Map<string, ReviewDoc[]>();
  for (const review of reviews) {
    if (!pooledUids.has(review.applicantUid) || !review.overallComment.trim()) continue;
    const list = written.get(review.applicantUid) ?? [];
    list.push(review);
    written.set(review.applicantUid, list);
  }
  const reviewers = await loadFirstNames(
    db,
    [...written.values()].flat().map((review) => review.reviewerUid),
  );
  const commentsOf = (uid: string): PoolComment[] =>
    (written.get(uid) ?? [])
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
      .map((review) => ({
        text: review.overallComment.trim(),
        by: reviewers.get(review.reviewerUid) ?? "",
      }));

  const programmes: PoolProgramme[] = form.programmeIds.map((programmeId) => {
    const settings = programmeOf(form, programmeId);
    const counted = term.tally.programmes[programmeId];
    const places = settings?.places ?? null;
    const placed = counted?.placed ?? 0;
    return {
      id: programmeId,
      shortName: settings?.shortName ?? programmeId,
      places,
      placed,
      invited: counted?.invited ?? 0,
      open: places === null ? null : Math.max(0, places - placed),
      left: freePlaces(form, term.tally, programmeId),
      firstChoice: pooled.filter((person) => person.ranked[0] === programmeId).length,
    };
  });

  const { outcomes } = term.tally;
  return {
    roundId: form.round.id,
    termLabel: form.round.label,
    today: formatRoundDate(now),
    hearOn: civilDateLabel(form.round.decisionsByDate),
    sentOn: form.decisionsSentAt ? formatRoundDate(form.decisionsSentAt) : null,
    counts: {
      pooled: pooled.length,
      invitations: outcomes.invited,
      noOffer: outcomes.noOffer,
      needsOutcome: outcomes.needsOutcome,
    },
    programmes,
    rows: pooled.map((person) =>
      rowFor(form, term, person, applications.get(person.uid), commentsOf(person.uid)),
    ),
  };
}

// ---------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------

/** One person's outcome, or "No offer this time" for everybody who has none yet. */
export type PoolRequest =
  | { uid: string; choice: PoolChoice }
  | { everyoneWithoutOne: true; choice: { kind: "no-offer" } };

export type PoolWrite =
  | { ok: true; changed: number }
  | { ok: false; status: 400 | 404 | 409; error: string };

function refuse(status: 400 | 404 | 409, error: string): PoolWrite {
  return { ok: false, status, error };
}

function stored(choice: PoolChoice, actorUid: string) {
  const who = { setByUid: actorUid, setAt: FieldValue.serverTimestamp() };
  return choice.kind === "invite"
    ? { kind: "invite", programmeId: choice.programmeId, ...who }
    : { kind: "no-offer", ...who };
}

/**
 * The fields one outcome write names. The outcome is replaced whole, so a
 * change from an invitation to no offer leaves no programme behind in it, and
 * everything else on the decision document is left alone.
 */
const OUTCOME_FIELDS = ["roundId", "uid", "pooledOutcome", "updatedAt"];

/** Who is acting: their uid, and the name the audit log shows. */
export type PoolActor = { uid: string; displayName?: string };

function sameChoice(current: DecisionDoc["pooledOutcome"], choice: PoolChoice): boolean {
  if (!current || current.kind !== choice.kind) return false;
  return current.kind !== "invite" || (choice.kind === "invite" && current.programmeId === choice.programmeId);
}

export async function setPooledOutcome(
  db: Firestore,
  actor: PoolActor,
  roundId: string,
  request: PoolRequest,
): Promise<PoolWrite> {
  const form = await loadForm(db, roundId);
  if (!form) return refuse(404, "There is no application form here.");

  // Who is in the term is settled before the transaction: the list only says
  // which documents to read, and every one of them is read again inside it.
  const uids = (await listSentApplications(db, form)).filter(isInTerm).map((application) => application.uid);
  if ("uid" in request && !uids.includes(request.uid)) {
    return refuse(404, "Nobody by that id has an application on this form.");
  }

  return db.runTransaction(async (tx) => {
    const formSnap = await tx.get(formRef(db, roundId));
    if (!formSnap.exists || !isApplicationForm(formSnap.data())) {
      return refuse(404, "There is no application form here.");
    }
    const live = normaliseForm(formSnap.id, formSnap.data());
    if (live.decisionsSentAt) {
      return refuse(
        409,
        `Decisions for ${live.round.label} have gone out, so an outcome can no longer change.`,
      );
    }
    if (uids.length === 0) return { ok: true, changed: 0 } satisfies PoolWrite;

    const [applicationSnaps, decisionSnaps] = await Promise.all([
      tx.getAll(...uids.map((uid) => applicationRef(db, roundId, uid))),
      tx.getAll(...uids.map((uid) => decisionRef(db, roundId, uid))),
    ]);
    const applications: ApplicationDoc[] = [];
    const decisions = new Map<string, DecisionDoc>();
    uids.forEach((uid, at) => {
      const applicationSnap = applicationSnaps[at];
      const application = applicationSnap.exists
        ? normaliseApplication(applicationSnap.id, applicationSnap.data(), live.round.availabilityGrid)
        : null;
      if (application) applications.push(application);
      const decisionSnap = decisionSnaps[at];
      if (decisionSnap.exists) {
        decisions.set(uid, normaliseDecision(decisionSnap.id, decisionSnap.data()));
      }
    });
    const term = planTerm(live, applications, decisions);

    const write = (uid: string, choice: PoolChoice) =>
      tx.set(
        decisionRef(db, roundId, uid),
        {
          roundId,
          uid,
          pooledOutcome: stored(choice, actor.uid),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { mergeFields: OUTCOME_FIELDS },
      );
    const log = (subjectUid: string | null, detail: string) =>
      tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
        kind: POOLED_OUTCOME_AUDIT_KIND,
        // A form is not a run: the run axis is empty and the form's id is kept.
        runId: "",
        roundId,
        groupId: null,
        subjectUid,
        actorUid: actor.uid,
        actorName: actor.displayName ?? "",
        targetLabel: live.round.label,
        detail,
        at: FieldValue.serverTimestamp(),
      });

    if ("uid" in request) {
      const person = term.people.find((candidate) => candidate.uid === request.uid);
      if (!person) return refuse(404, "Nobody by that id has an application on this form.");
      const notPooled = poolProblem(live, person);
      if (notPooled) return refuse(409, notPooled);
      const { choice } = request;
      if (choice.kind === "invite") {
        if (!programmeOf(live, choice.programmeId)) {
          return refuse(400, "That programme is not on this form.");
        }
        const noInvite = inviteProblem(live, term.tally, person, choice.programmeId);
        if (noInvite) return refuse(409, noInvite);
      }
      // Picking what is already picked changes nothing, and keeps the record
      // of who picked it first.
      if (sameChoice(person.decision?.pooledOutcome ?? null, choice)) {
        return { ok: true, changed: 0 } satisfies PoolWrite;
      }
      write(person.uid, choice);
      log(
        person.uid,
        choice.kind === "invite"
          ? `Picked an invitation to ${shortNameOf(live, choice.programmeId)} for a pooled applicant.`
          : "Picked no offer this time for a pooled applicant.",
      );
      return { ok: true, changed: 1 } satisfies PoolWrite;
    }

    // Everybody pooled with nothing picked yet, and nobody else.
    let changed = 0;
    for (const person of term.people) {
      if (person.result || person.outcome.kind !== "needs-outcome") continue;
      write(person.uid, request.choice);
      changed += 1;
    }
    if (changed > 0) {
      log(
        null,
        changed === 1
          ? "Picked no offer this time for the 1 pooled applicant who had nothing picked."
          : `Picked no offer this time for the ${changed} pooled applicants who had nothing picked.`,
      );
    }
    return { ok: true, changed } satisfies PoolWrite;
  });
}
