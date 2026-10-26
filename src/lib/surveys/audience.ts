import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { placeHoldersOn, type PlaceHolder } from "@/lib/applications/handover/holders";
import { own } from "@/lib/applications/keys";
import type { ProgrammeSettings } from "@/lib/applications/model";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { listDecisions, listSentApplications } from "@/lib/applications/staffRepo";
import type { SurveyAudience } from "@/lib/firestore/surveys";
import { namesOf } from "./names";
import { peopleOf } from "./repo";

/**
 * WHO A PROGRAMME SURVEY IS FOR, read when a button is drawn and again when
 * it is pressed, never stored as a list: the people rows record who was SENT
 * it, and the difference between the two is "who joined since".
 *
 *  - A PROGRAMME'S AUDIENCE (`programme`): everybody holding a place on the
 *    programme now, through `placeHoldersOn`, the one test the hand-over, its
 *    panel and Publish share. Somebody who gave their place back, or left,
 *    holds none; somebody invited holds one from the moment they accept.
 *    Nobody is named before decisions are sent. Sent before a programme,
 *    that is everybody starting it; sent at its end, everybody still on it,
 *    finished or not.
 *  - THE FOLLOW-UPS' AUDIENCE (`followUps`): everybody whose row on the
 *    programme's before survey says yes to being contacted at 6 and 12
 *    months, as it says now. A person changes it on their survey's page, and
 *    the next press reads the change. Nobody else is ever sent a follow-up.
 */

export type AudienceRead =
  | { status: "ok"; form: ApplicationForm | null; programme: ProgrammeSettings | null; holders: PlaceHolder[] }
  /** The form, or the programme on it, is no longer there. */
  | { status: "gone" };

/**
 * The people a follow-up is for: a yes on the before survey's row, and an
 * account still there to send it to. Read from the rows, so it needs no form.
 */
async function followUpHolders(db: Firestore, consentFrom: string): Promise<PlaceHolder[]> {
  const said = (await peopleOf(db, consentFrom)).filter((person) => person.consents.followUps === true);
  const names = await namesOf(db, said.map((person) => person.respondent.uid));
  return said
    .filter((person) => names.has(person.respondent.uid))
    .map((person) => ({ uid: person.respondent.uid, name: names.get(person.respondent.uid) ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid));
}

export async function readAudience(db: Firestore, audience: SurveyAudience): Promise<AudienceRead> {
  if (audience.kind === "followUps") {
    return { status: "ok", form: null, programme: null, holders: await followUpHolders(db, audience.consentFrom) };
  }
  const form = await loadForm(db, audience.roundId);
  if (!form) return { status: "gone" };
  const programme = own(form.programmes, audience.programmeId);
  if (!programme) return { status: "gone" };
  if (form.decisionsSentAt === null) return { status: "ok", form, programme, holders: [] };
  const [applications, decisions] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
  ]);
  return { status: "ok", form, programme, holders: placeHoldersOn(form, audience.programmeId, applications, decisions) };
}
