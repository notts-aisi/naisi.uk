import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { own } from "@/lib/applications/keys";
import { listForms } from "@/lib/applications/handover/run";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { readRunEndById } from "@/lib/courses/finishing/record";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isProgrammeAudience } from "@/lib/firestore/surveys";
import { PUBLIC_NUMBERS_COLLECTION, normalizePublicNumbers, publicNumbersId, type PublicNumbersDoc } from "@/lib/publicNumbers/model";
import { buildOffer, type OfferSurvey, type PublicOffer } from "./publicNumbers";
import { answersOf, listSurveys } from "./repo";
import { SURVEY_STAGES } from "./templates";

/**
 * WHAT PUBLIC NUMBERS ARE MADE FROM, for one programme, read once and handed
 * to `buildOffer`, which counts: the programme's OWN surveys, one per stage
 * (its before survey, its survey at the end, its follow-ups), their answers,
 * and how many each was sent to. Nothing else is read: never the survey about
 * leaving, a survey after an event, the anonymous form, the ratings or the
 * Kairos file.
 *
 * A programme here is one of a term's form tied to a course, since the
 * course's page is where its numbers are shown.
 *
 * Admins only ask here; the page and the routes decide that first. Every read
 * is a document by its id, the whole small `surveys` collection, or one
 * equality on one field, so none needs a declared index.
 */

export type NumbersProgramme = {
  roundId: string;
  programmeId: string;
  /** "AGI Strategy Fellowship": the programme's whole name. */
  name: string;
  /** The term, as its form names it: "Autumn 2026". */
  term: string;
  kind: "fellowship" | "incubator";
  /** The course whose public page shows the block. */
  courseId: string;
  runId: string | null;
};

/** A programme of a loaded form, when it is tied to a course; null otherwise. */
export function numbersProgrammeOf(form: ApplicationForm, programmeId: string): NumbersProgramme | null {
  if (!form.programmeIds.includes(programmeId)) return null;
  const programme = own(form.programmes, programmeId);
  if (!programme || !programme.courseId) return null;
  return {
    roundId: form.round.id,
    programmeId,
    name: programme.name.trim() || programme.shortName.trim() || "Programme",
    term: form.round.label,
    kind: programme.kind === "incubator" ? "incubator" : "fellowship",
    courseId: programme.courseId,
    runId: programme.runId,
  };
}

/** One programme, by its form and its id, when it is tied to a course; null otherwise. */
export async function loadNumbersProgramme(db: Firestore, roundId: string, programmeId: string): Promise<NumbersProgramme | null> {
  if (!roundId || !programmeId || roundId.includes("/") || programmeId.includes("/")) return null;
  const form = await loadForm(db, roundId);
  return form ? numbersProgrammeOf(form, programmeId) : null;
}

/** Every programme on every form tied to a course, each form's in its own order. */
export async function listNumbersProgrammes(db: Firestore): Promise<NumbersProgramme[]> {
  return (await listForms(db)).flatMap((form) =>
    form.programmeIds.flatMap((programmeId) => {
      const programme = numbersProgrammeOf(form, programmeId);
      return programme ? [programme] : [];
    }),
  );
}

/** The programme's own surveys, one per stage (the oldest, should there be two), with their answers. */
async function ownSurveys(db: Firestore, programme: NumbersProgramme): Promise<OfferSurvey[]> {
  const all = await listSurveys(db);
  const out: OfferSurvey[] = [];
  for (const stage of SURVEY_STAGES) {
    const survey = all
      .filter((each) => each.kind === stage && isProgrammeAudience(each.audience, programme.roundId, programme.programmeId))
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))[0];
    if (!survey) continue;
    const answers = await answersOf(db, survey);
    out.push({
      stage,
      items: survey.items,
      answers: answers.map((answer) => ({ id: answer.id, uid: answer.respondent?.uid ?? null, answers: answer.answers })),
      sent: survey.presses.filter((press) => press.kind !== "remind").reduce((sum, press) => sum + press.count, 0),
    });
  }
  return out;
}

/** What an admin is offered for the programme's public page, as its surveys stand now. */
export async function loadOffer(db: Firestore, programme: NumbersProgramme): Promise<PublicOffer> {
  return buildOffer({ kind: programme.kind, term: programme.term, surveys: await ownSurveys(db, programme) });
}

/**
 * What is published for the programme now, or null. A record whose own ids
 * name another programme (two pairs of ids can join to one address) is not
 * this programme's.
 */
export async function readPublished(db: Firestore, programme: Pick<NumbersProgramme, "roundId" | "programmeId">): Promise<PublicNumbersDoc | null> {
  const snap = await db.collection(PUBLIC_NUMBERS_COLLECTION).doc(publicNumbersId(programme.roundId, programme.programmeId)).get();
  if (!snap.exists) return null;
  const doc = normalizePublicNumbers(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  return doc.roundId === programme.roundId && doc.programmeId === programme.programmeId ? doc : null;
}

/** The day of the programme's run's last session, "YYYY-MM-DD", or null: it orders a course's terms on its page. */
export async function lastSessionOf(db: Firestore, programme: NumbersProgramme, now: Date): Promise<string | null> {
  if (!programme.runId) return null;
  return (await readRunEndById(db, programme.runId, now))?.lastDateKey ?? null;
}

/** The first name of whoever published, for the line that says when and by whom, or "". */
export async function publisherName(db: Firestore, uid: string): Promise<string> {
  if (!uid || uid.includes("/")) return "";
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? firstNameOfUser((snap.data() ?? {}) as Record<string, unknown>) : "";
}
