import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { placeHoldersOn, type PlaceHolder } from "@/lib/applications/handover/holders";
import { own } from "@/lib/applications/keys";
import type { ProgrammeSettings } from "@/lib/applications/model";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { listDecisions, listSentApplications } from "@/lib/applications/staffRepo";
import type { SurveyAudience } from "@/lib/firestore/surveys";

/**
 * WHO A PROGRAMME SURVEY IS FOR: everybody holding a place on the programme
 * now, through `placeHoldersOn`, the one test the hand-over, its panel and
 * Publish share. Somebody who gave their place back, or left, holds none;
 * somebody invited holds one from the moment they accept. Nobody is named
 * before decisions are sent.
 *
 * The audience is read when a button is drawn and again when it is pressed,
 * never stored as a list: the people rows record who was SENT it, and the
 * difference between the two is "who joined since".
 *
 * A later audience ("still on the programme at the end", for the after
 * survey) is a second function beside this one, asked through the same
 * `SurveyAudience` union.
 */

export type AudienceRead =
  | { status: "ok"; form: ApplicationForm; programme: ProgrammeSettings; holders: PlaceHolder[] }
  /** The form, or the programme on it, is no longer there. */
  | { status: "gone" };

export async function readAudience(db: Firestore, audience: SurveyAudience): Promise<AudienceRead> {
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
