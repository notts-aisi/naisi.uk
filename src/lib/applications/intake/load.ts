import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { wouldFacilitate } from "@/lib/courses/facilitatorAsks/rules";
import type { SessionUser } from "@/lib/firebase/session";
import { admissionAssessmentId, ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";
import { canRunTerm } from "../access";
import { applicationReadOf, readForProgramme } from "../assessment/stored";
import type { Lean, StoredApplicationRead } from "../assessment/types";
import { isInTerm, outcomeFor, placementFor, standingWith } from "../decisions";
import { nameOnRecord } from "../handover/holders";
import { own } from "../keys";
import { loadForm, loadQuestionSets } from "../repo";
import { NOT_FOUND, refuse } from "../review/refusals";
import { termPictureFor } from "../review/term";
import type { Refusal } from "../review/types";
import { scorableKeysFor, sectionScore } from "../scoring";
import { listDecisions, listReviews, listSentApplications } from "../staffRepo";
import { matchIntake, type MatchPerson, type Standing } from "./match";

/**
 * EVERYTHING A WHOLE-TERM PLAN IS WORKED OUT FROM, for an admin.
 *
 * The term as the review screens read it (`../review/term.ts`), so the
 * viewer's own application is left out exactly as it is everywhere else: a
 * plan for who goes where is a decision about each person in it. Then, for
 * each person and each programme they ranked: the lead's decision so far,
 * Claude's stored read for that programme (`../assessment/`), the
 * committee's score, and whether they would facilitate it. Then the draft
 * (`./match.ts`).
 *
 * Only before decision day: once it has run, every decision is fixed, and a
 * plan could change nothing.
 */

export type IntakeProgramme = {
  id: string;
  name: string;
  shortName: string;
  kind: string;
  places: number | null;
  /** How many hold a place on it by the decisions as they stand. */
  placedNow: number;
};

export type IntakePerson = {
  uid: string;
  name: string;
  ranked: string[];
  on: Record<
    string,
    { standing: Standing; lean: Lean | null; score: number | null; summary: string | null; fit: string | null; facilitates: boolean }
  >;
  /** The place the decisions as they stand give them, or null. */
  placedNow: string | null;
  /** What the decisions as they stand say: accepted, undecided, pooled and so on. */
  outcomeNow: string;
  /** Whether Claude has read the application, and whether Pangram has checked it. */
  hasRead: boolean;
  hasPangram: boolean;
};

export type IntakeLoaded = {
  roundId: string;
  programmes: IntakeProgramme[];
  people: IntakePerson[];
  draft: Map<string, string | null>;
};

export type IntakeLoadResult = { ok: true; intake: IntakeLoaded } | Refusal;

export async function loadIntake(db: Firestore, user: SessionUser, roundId: string): Promise<IntakeLoadResult> {
  if (!canRunTerm(user)) return refuse(403, "Only an admin can plan the whole intake.");
  const form = await loadForm(db, roundId);
  if (!form) return NOT_FOUND;
  if (form.decisionsSentAt !== null) {
    return refuse(409, "Decisions have gone out, so nothing in a plan could change. It is for before decision day.");
  }

  const [sets, applications, decisions, reviews] = await Promise.all([
    loadQuestionSets(db, form.round.id),
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
    listReviews(db, form.round.id),
  ]);
  const term = termPictureFor({ form, applications, decisions, reviews, viewerUid: user.uid });
  const inTerm = term.applications.filter(isInTerm);

  // Claude's stored reads, one per application, and who Pangram has checked.
  const stored = new Map<string, StoredApplicationRead>();
  const checked = new Set<string>();
  const uids = inTerm.map((application) => application.uid);
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids
      .slice(i, i + 100)
      .map((uid) => db.collection(ASSESSMENTS_COLLECTION).doc(admissionAssessmentId(form.round.id, uid)));
    if (refs.length === 0) continue;
    for (const snap of await db.getAll(...refs)) {
      const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
      const read = data ? applicationReadOf(data) : null;
      if (!data || typeof data.uid !== "string") continue;
      if (read) stored.set(data.uid, read);
      // A check with an answer Pangram could not take (no credit, busy) is not
      // a check: Read everyone asks again.
      const pangram = data.pangram as { answers?: unknown; failed?: unknown } | null | undefined;
      if (pangram && Array.isArray(pangram.answers) && !(Array.isArray(pangram.failed) && pangram.failed.length > 0)) {
        checked.add(data.uid);
      }
    }
  }

  const invitable = new Set(form.programmeIds);
  const people: IntakePerson[] = [];
  for (const application of inTerm) {
    if (!application.sent) continue;
    const ranked = term.ranked.get(application.uid) ?? [];
    const decision = term.decisions.get(application.uid) ?? null;
    const theirReviews = term.reviews.get(application.uid) ?? [];
    const on: IntakePerson["on"] = {};
    for (const programmeId of ranked) {
      const programme = own(form.programmes, programmeId);
      if (!programme) continue;
      const whole = stored.get(application.uid);
      const read = whole ? readForProgramme(whole, programmeId) : null;
      const score = programme.useScores
        ? sectionScore(theirReviews, scorableKeysFor(form, sets, programmeId, application.sent)).score
        : null;
      on[programmeId] = {
        standing: standingWith(decision, programmeId) as Standing,
        lean: read && typeof read.lean === "string" ? read.lean : null,
        score,
        summary: read && typeof read.summary === "string" ? read.summary : null,
        fit: read && typeof read.fit === "string" ? read.fit : null,
        facilitates: wouldFacilitate(form, sets, application.sent, programme),
      };
    }
    people.push({
      uid: application.uid,
      name: nameOnRecord(application),
      ranked,
      on,
      placedNow: placementFor(ranked, decision),
      outcomeNow: outcomeFor(ranked, decision, invitable).kind,
      hasRead: stored.has(application.uid),
      hasPangram: checked.has(application.uid),
    });
  }

  const programmes: IntakeProgramme[] = form.programmeIds.flatMap((programmeId) => {
    const programme = own(form.programmes, programmeId);
    if (!programme || programme.closed) return [];
    return [
      {
        id: programme.id,
        name: programme.name,
        shortName: programme.shortName,
        kind: programme.kind,
        places: programme.places ?? null,
        placedNow: people.filter((person) => person.placedNow === programme.id).length,
      },
    ];
  });

  const draft = matchIntake(
    people.map((person): MatchPerson => ({
      uid: person.uid,
      ranked: person.ranked.filter((id) => programmes.some((p) => p.id === id)),
      on: Object.fromEntries(Object.entries(person.on).map(([id, x]) => [id, { standing: x.standing, lean: x.lean, score: x.score }])),
    })),
    programmes.map((programme) => ({ id: programme.id, places: programme.places })),
  );

  return { ok: true, intake: { roundId: form.round.id, programmes, people, draft } };
}
