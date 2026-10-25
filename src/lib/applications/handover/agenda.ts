import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { canReadApplication } from "../access";
import { joinedByInvitation } from "../decisions";
import { own } from "../keys";
import type { ApplicationQuestion } from "../model";
import { normaliseApplication, type ApplicationForm } from "../normalise";
import { applicationRef, loadQuestionSets } from "../repo";
import { streamSetsFor } from "../sections";

/**
 * THE AGENDA A PROGRAMME'S APPLICANTS RANKED, AND WHAT EACH PERSON TAKING
 * PART RANKED (board in-agenda).
 *
 * The application form can ask a programme's applicants to put a list in the
 * order they would like it: an incubator's project agenda. Its answers are
 * stored on each person's own application, in `sent.answers`, as the options
 * they placed, first choice first. An incubator whose teams are made from the
 * agenda (`CourseRunDoc.teamsFrom`) makes them from those answers.
 *
 * ## Which question is the agenda
 *
 * The first question that asks for a ranking among the programme's OWN
 * question sets (its stream sets, in the form's order): the questions only
 * that programme's applicants were asked. A ranking asked of everybody, or of
 * every incubator, is not one programme's agenda. A programme whose sets ask
 * for no ranking has no agenda, and the Teams tab says so.
 *
 * ## Who is told what somebody ranked
 *
 * The programme's lead and admins, and nobody else: not a reviewer, not a
 * group's facilitator, not the run's track lead, not the other people taking
 * part. Each person's ranks are answers from their application. So this module
 * is read only by the Teams tab's loader, after its gate has decided the caller
 * is the programme's lead or an admin, and it asks again, for each person,
 * whether the caller may read that application at all (`canReadApplication`:
 * an admin, or a role on a programme the person ranked or joined). An answer
 * that is not one of the question's own options now (an option renamed since)
 * is left out, and nothing else of the application leaves here.
 * `tests/course-hub-teams-rankings.test.mjs` holds who imports it.
 */

export type Agenda = {
  setId: string;
  questionId: string;
  /** The question as the form asked it. */
  text: string;
  /** What was ranked, in the form's order. */
  items: string[];
};

/** The programme's agenda, or null when its own sets ask nobody to rank anything. */
export async function findAgenda(db: Firestore, form: ApplicationForm, programmeId: string): Promise<Agenda | null> {
  const sets = streamSetsFor(form, await loadQuestionSets(db, form.round.id), programmeId);
  for (const set of sets) {
    const question = set.questions.find((candidate: ApplicationQuestion) => candidate.type === "rank");
    if (question && question.options.length > 0) {
      return { setId: set.id, questionId: question.id, text: question.text, items: [...question.options] };
    }
  }
  return null;
}

/**
 * What each of these people ranked, first choice first, kept to the agenda's
 * own items. A person with no application on this form, one the caller may not
 * read, or one that answered nothing is not in the map.
 */
export async function readRankings(
  db: Firestore,
  user: SessionUser,
  form: ApplicationForm,
  agenda: Agenda,
  uids: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const list = [...new Set(uids)].filter(Boolean);
  if (list.length === 0) return out;
  const snaps = await db.getAll(...list.map((uid) => applicationRef(db, form.round.id, uid)));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const application = normaliseApplication(snap.id, snap.data(), form.round.availabilityGrid);
    if (!application?.sent || !application.uid) continue;
    if (!canReadApplication(user, form, application.sent.rankedProgrammeIds, joinedByInvitation(application))) continue;
    const answers = own(application.sent.answers, agenda.setId);
    const answer = answers ? own(answers, agenda.questionId) : undefined;
    if (!Array.isArray(answer)) continue;
    const ranking = answer.filter((item, at) => agenda.items.includes(item) && answer.indexOf(item) === at);
    if (ranking.length > 0) out.set(application.uid, ranking);
  }
  return out;
}
