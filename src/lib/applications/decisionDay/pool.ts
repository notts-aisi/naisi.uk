import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { claudeConfigured } from "@/lib/ai/claude";
import { formatRoundDate } from "@/lib/admissions/window";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { freePlaces, isPooled } from "../decisions";
import { own } from "../keys";
import { APPLICATION_LIMITS, type ApplicationDoc, type DecisionDoc, type ReviewDoc } from "../model";
import {
  isApplicationForm,
  normaliseApplication,
  normaliseDecision,
  normaliseForm,
  type ApplicationForm,
} from "../normalise";
import { applicationRef, formRef, loadForm } from "../repo";
import { OWN_APPLICATION } from "../review/refusals";
import { decisionRef, listReviews, listSentApplications } from "../staffRepo";
import { gaveBackOf } from "../status/reasons";
import { standingOf } from "../status/standing";
import { POOL_REASON_LABEL } from "../words";
import { studyLine } from "./boardWords";
import { composeDecisionEmail } from "./emailCopy";
import { loadInviteDrafts, type StoredInviteDraft } from "./inviteDraft";
import { emailContext, previewOf, type EmailContext } from "./letters";
import { loadFirstNames } from "./people";
import {
  civilDateLabel,
  invitableFor,
  inviteProblem,
  isInTerm,
  onePerson,
  planTerm,
  poolProblem,
  type PoolChoice,
  type Term,
  type TermPerson,
} from "./plan";
import { POOLED_OUTCOME_AUDIT_KIND, programmeOf, shortNameOf } from "./programmes";
import { loadTerm } from "./term";
import type { PoolBoard, PoolComment, PoolLeftRow, PoolProgramme, PoolRow } from "./views";

/**
 * POOLED APPLICANTS: the people no programme they ranked could take, and what
 * each of them will hear.
 *
 * Two things live here. {@link buildPoolBoard} is everything the page shows,
 * built field by field. {@link setPooledOutcome} is the one writer of a
 * pooled applicant's outcome.
 *
 * NOBODY READS OR DECIDES THEIR OWN APPLICATION HERE. The page is an admin's,
 * and an admin can have applied and been pooled. The page is built for
 * whoever is looking (`loadTerm` takes them) from the term with their own
 * application left out: it is in no row, no count and no number of places,
 * and the page says so in one line. The writer refuses the caller's own id
 * before it reads anything, and "everybody who has nothing picked" is
 * everybody but the caller, so their own outcome is another admin's to
 * choose.
 *
 * NOBODY DISAPPEARS FROM THE PAGE. Somebody pooled who gives a place or an
 * invitation back after they were told leaves the term, and so leaves every
 * count and the list of people to pick for. They are kept in a list of their
 * own (`left`) with what they said and the reason they gave, because the
 * reason is often something the committee can put right.
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
 *    or has finished for the form, their outcome is what they were told,
 *    here. A place given back after the send is offered by its own writer
 *    (`../freedPlaces/offer.ts`), on its own terms.
 *  - THE DECISION DOCUMENT ALWAYS SAYS WHOSE IT IS. Every write carries
 *    `roundId` and `uid` beside the outcome, because that is how a form's
 *    decisions are found again when the form is removed.
 *  - EVERY CHANGE IS LOGGED: who picked, for whom, and when, as one audit row
 *    in the same transaction. The row names the applicant by uid and not by
 *    name, so the log does not keep somebody's name after their account goes.
 *
 * ## An invitation's personal note
 *
 * {@link setInviteNote} is the one writer of the few sentences an admin adds
 * to one person's invitation email (`PooledOutcome.note`), under the same
 * rules: admins only, never the caller's own, nobody already told, nothing
 * once the term is sent, one audit row (which says a note was written, never
 * what it says). The note belongs to the invitation it was written for:
 * picking another programme, or no offer, replaces the outcome whole and the
 * note goes with it. Claude may draft the words (`./inviteNote.ts`), and its
 * draft is kept apart, on the assessment document, where nothing sends it.
 */

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

type RowExtras = {
  comments: PoolComment[];
  context: EmailContext;
  /** Who saved each note, by first name. */
  names: ReadonlyMap<string, string>;
  draft: StoredInviteDraft | null;
};

function rowFor(
  form: ApplicationForm,
  term: Term,
  person: TermPerson,
  application: ApplicationDoc | undefined,
  { comments, context, names, draft }: RowExtras,
): PoolRow {
  const about = application?.sent?.aboutYou;
  const reasons: string[] = [];
  const couldSuit: string[] = [];
  for (const programmeId of person.ranked) {
    const entry = own(person.decision?.programmes, programmeId);
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

  const invitedTo = outcome?.kind === "invite" ? outcome.programmeId : null;
  const picked = person.decision?.pooledOutcome ?? null;
  const saved = invitedTo && picked?.kind === "invite" && picked.programmeId === invitedTo ? picked.note : null;
  const email = invitedTo
    ? composeDecisionEmail({
        outcome: { kind: "invited", programmeId: invitedTo },
        firstName: person.firstName,
        form: context.form,
        ranked: person.ranked,
        leadNames: context.leadNames,
        replyBy: context.replyBy,
        confirmBy: context.confirmBy,
        note: saved?.text ?? null,
        links: context.links,
      })
    : null;

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
    note: saved ? { text: saved.text, by: names.get(saved.setByUid) ?? "" } : null,
    draft: invitedTo && draft?.programmeId === invitedTo ? { text: draft.text, basis: draft.basis } : null,
    email: email ? previewOf(person, email) : null,
  };
}

/**
 * Somebody pooled who gave a place or an invitation back after they were
 * told: what they said and why, read off their own application. Null for
 * anybody who left some other way, who has nothing of the kind to show.
 */
function leftRowFor(
  form: ApplicationForm,
  person: TermPerson,
  application: ApplicationDoc | undefined,
): PoolLeftRow | null {
  if (!application) return null;
  const gaveBack = gaveBackOf(application);
  const standing = standingOf(application);
  if (!gaveBack || standing.kind !== "released") return null;
  const about = application.sent?.aboutYou;
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
    programme: programmeOf(form, standing.programmeId)?.shortName ?? null,
    said: gaveBack.said,
    reason: gaveBack.reason,
  };
}

export async function buildPoolBoard(
  db: Firestore,
  form: ApplicationForm,
  /** Whoever the page is for. Their own application is left out of it. */
  viewerUid: string,
  now: Date,
): Promise<PoolBoard> {
  const [{ shown: term, shownApplications: applications, leftApplications, own: ownApplication }, reviews] =
    await Promise.all([loadTerm(db, form, viewerUid), listReviews(db, form.round.id)]);
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
  // Only the people with an invitation picked can have a note or a draft.
  const invited = pooled.filter((person) => person.outcome.kind === "invited");
  const noteSetters = invited.flatMap((person) => {
    const picked = person.decision?.pooledOutcome;
    return picked?.kind === "invite" && picked.note ? [picked.note.setByUid] : [];
  });
  const [reviewers, context, drafts] = await Promise.all([
    loadFirstNames(db, [...[...written.values()].flat().map((review) => review.reviewerUid), ...noteSetters]),
    emailContext(db, form),
    loadInviteDrafts(db, form.round.id, invited.map((person) => person.uid)),
  ]);
  const commentsOf = (uid: string): PoolComment[] =>
    (written.get(uid) ?? [])
      .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
      .map((review) => ({
        text: review.overallComment.trim(),
        by: reviewers.get(review.reviewerUid) ?? "",
      }));

  const programmes: PoolProgramme[] = form.programmeIds.map((programmeId) => {
    const settings = programmeOf(form, programmeId);
    const counted = own(term.tally.programmes, programmeId);
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
    ownApplication,
    programmes,
    rows: pooled.map((person) =>
      rowFor(form, term, person, applications.get(person.uid), {
        comments: commentsOf(person.uid),
        context,
        names: reviewers,
        draft: drafts.get(person.uid) ?? null,
      }),
    ),
    claudeConfigured: claudeConfigured(),
    // Listed, and not counted: they left the term when they replied.
    left: term.left
      .filter((person) => isPooled(person.outcome))
      .map((person) => leftRowFor(form, person, leftApplications.get(person.uid)))
      .filter((row): row is PoolLeftRow => row !== null),
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
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

function refuse(status: 400 | 403 | 404 | 409, error: string): PoolWrite {
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

/** What the writer answers once the term is sent: nothing is picked here, and where a freed place goes. */
export function pickedNoMore(termLabel: string): string {
  return (
    `Decisions for ${termLabel} have gone out, so an outcome can no longer be picked here. ` +
    "A place given back can be offered from its programme’s Applications tab until the end of week 1."
  );
}

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
  // Before anything is read, so the answer is the same wherever the caller's
  // own application stands, pooled or not.
  if ("uid" in request && request.uid === actor.uid) return refuse(403, OWN_APPLICATION);
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
    // Nothing is picked here once the term is sent. The one outcome that can
    // still change after the send, "No offer this time" to an invitation for
    // a place somebody gave back, has its own writer, window and test
    // (`../freedPlaces/`), and the sentence says where it is.
    if (live.decisionsSentAt) return refuse(409, pickedNoMore(live.round.label));
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
    // EVERYBODY, the caller's own application included: an invitation needs
    // a place that is really free, and a place somebody holds is taken
    // whoever is asking. Nothing here is listed or counted for a screen.
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

    // Everybody pooled with nothing picked yet, and nobody else. Never the
    // caller's own application: that outcome is another admin's to choose,
    // and the number the page offered this for did not count it.
    let changed = 0;
    for (const person of term.people) {
      if (person.uid === actor.uid) continue;
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

// ---------------------------------------------------------------------------
// An invitation's personal note
// ---------------------------------------------------------------------------

/** The most a note may say. */
export const INVITE_NOTE_LIMIT = APPLICATION_LIMITS.inviteNote;

/**
 * Save the personal note in one pooled applicant's invitation email, or take
 * it off with an empty `text`. The note is written as the caller's, whoever
 * drafted the words, and is sent on decision day with the invitation it was
 * saved with. Nobody is told anything now.
 */
export async function setInviteNote(
  db: Firestore,
  actor: PoolActor,
  roundId: string,
  applicantUid: string,
  text: string,
): Promise<PoolWrite> {
  // Before anything is read, as for an outcome.
  if (applicantUid === actor.uid) return refuse(403, OWN_APPLICATION);
  const note = text.replace(/\r\n?/g, "\n").trim();
  if (note.length > INVITE_NOTE_LIMIT) {
    return refuse(400, `Keep the note to ${INVITE_NOTE_LIMIT} characters.`);
  }
  const form = await loadForm(db, roundId);
  if (!form) return refuse(404, "There is no application form here.");

  return db.runTransaction(async (tx) => {
    const formSnap = await tx.get(formRef(db, roundId));
    if (!formSnap.exists || !isApplicationForm(formSnap.data())) {
      return refuse(404, "There is no application form here.");
    }
    const live = normaliseForm(formSnap.id, formSnap.data());
    if (live.decisionsSentAt) return refuse(409, pickedNoMore(live.round.label));

    const [applicationSnap, decisionSnap] = await Promise.all([
      tx.get(applicationRef(db, roundId, applicantUid)),
      tx.get(decisionRef(db, roundId, applicantUid)),
    ]);
    const application = applicationSnap.exists
      ? normaliseApplication(applicationSnap.id, applicationSnap.data(), live.round.availabilityGrid)
      : null;
    if (!application || !isInTerm(application)) {
      return refuse(404, "Nobody by that id has an application on this form.");
    }
    // This one person's standing: whether they are pooled, and told, reads
    // nobody else's decisions.
    const decision = decisionSnap.exists ? normaliseDecision(decisionSnap.id, decisionSnap.data()) : null;
    const person = onePerson(live, application, decision);
    if (!person) return refuse(404, "Nobody by that id has an application on this form.");
    const notPooled = poolProblem(live, person);
    if (notPooled) return refuse(409, notPooled);
    const picked = person.decision?.pooledOutcome ?? null;
    if (person.outcome.kind !== "invited" || picked?.kind !== "invite") {
      return refuse(409, `Pick an invitation for ${person.name} first: a note goes with an invitation.`);
    }
    if ((picked.note?.text ?? "") === note) return { ok: true, changed: 0 } satisfies PoolWrite;

    tx.set(
      decisionRef(db, roundId, applicantUid),
      {
        roundId,
        uid: applicantUid,
        // The invitation as it was picked, with the note beside it.
        pooledOutcome: {
          kind: "invite",
          programmeId: picked.programmeId,
          setByUid: picked.setByUid,
          setAt: picked.setAt,
          note: note ? { text: note, setByUid: actor.uid, setAt: FieldValue.serverTimestamp() } : null,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { mergeFields: OUTCOME_FIELDS },
    );
    // What the note says stays out of the log: it is about the applicant.
    tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      kind: POOLED_OUTCOME_AUDIT_KIND,
      runId: "",
      roundId,
      groupId: null,
      subjectUid: applicantUid,
      actorUid: actor.uid,
      actorName: actor.displayName ?? "",
      targetLabel: live.round.label,
      detail: note
        ? `Saved the personal note in a pooled applicant’s invitation to ${shortNameOf(live, picked.programmeId)}.`
        : `Took the personal note off a pooled applicant’s invitation to ${shortNameOf(live, picked.programmeId)}.`,
      at: FieldValue.serverTimestamp(),
    });
    return { ok: true, changed: 1 } satisfies PoolWrite;
  });
}
