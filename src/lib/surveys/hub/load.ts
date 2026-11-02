import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { listForms } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { readRunEndById } from "@/lib/courses/finishing/record";
import type { SessionUser } from "@/lib/firebase/session";
import { isEventAudience, isProgrammeAudience, type SurveyDoc, type SurveyPersonDoc } from "@/lib/firestore/surveys";
import { readAudience, type AudienceRead } from "../audience";
import { checkInListView } from "../checkIns/adminView";
import { eventPeopleOf } from "../events/store";
import { questionSetRows } from "../questionSets";
import { readQuestionSets } from "../questionSetsStore";
import { canRunSurveys, listCheckIns, listSurveys, peopleOf, surveyState } from "../repo";
import { remindReach } from "../sending";
import { chooseTerm } from "../term/choose";
import { programmeLine } from "../words";
import {
  eventRows,
  programmeCards,
  programmeKey,
  type CountedSurvey,
  type FormFacts,
  type HubView,
  type ProgrammeCheckIns,
} from "./model";
import type { HubTab } from "./tabs";

/**
 * WHAT RUN NAISI › SURVEYS IS DRAWN FROM, read on the server for one tab and
 * handed to `./model.ts`, which lays it out. The records are server-only in
 * both directions, so this is the only way a browser learns any of it, and
 * it hands on counts and words, never a person's row.
 *
 * ADMINS ONLY. The `(admin-only)` layout sends everybody else away and the
 * page asks `canRunSurveys` before it calls this; it is asked again here, before
 * anything is read.
 *
 * BY PROGRAMME reads every survey but the check-ins (one `in` on `kind`,
 * `listSurveys`), each one's people rows, the check-ins (one equality on
 * `kind`), the application forms (one equality), and for each of the term's
 * programmes whose survey at the end has not gone out, its run and groups,
 * for the day of its last session (`readRunEndById`, the finishing record's
 * one rule for it). Who a survey is for is read only where Remind is offered
 * (open, sent, not the survey about leaving), and once for every survey with
 * the same people (a programme's survey before and at the end share it), so
 * "12 haven’t answered" is the number the Send tab's Remind reaches.
 *
 * EVENTS reads the surveys and each survey after an event's people rows, which
 * may hold guests (`eventPeopleOf`).
 *
 * QUESTION SETS reads the stored sets alone (`readQuestionSets`, the
 * collection whole: six documents at most), and no survey.
 *
 * Every query is one equality, one `in` or one range on one field, so none
 * needs a declared index.
 */

/** One key for one audience, so surveys with the same people share one read of it. */
function audienceKey(audience: SurveyDoc["audience"]): string {
  return isEventAudience(audience)
    ? `${audience.kind}:${audience.eventId}`
    : `${audience.kind}:${audience.roundId}:${audience.programmeId}:${audience.kind === "followUps" ? audience.consentFrom : ""}`;
}

/** How many a survey went to and how many answered, from its people rows. */
function counted(survey: SurveyDoc, people: readonly Pick<SurveyPersonDoc, "sentAt" | "answered">[], remind: number): CountedSurvey {
  return {
    survey,
    sent: people.filter((person) => person.sentAt !== null).length,
    answered: people.filter((person) => person.answered).length,
    remind,
  };
}

/** Every survey of a programme counted, with Remind's reach for each the Send tab offers Remind on. */
async function countProgrammeSurveys(db: Firestore, surveys: readonly SurveyDoc[], now: Date): Promise<CountedSurvey[]> {
  const audiences = new Map<string, Promise<AudienceRead>>();
  const audienceOf = (survey: SurveyDoc): Promise<AudienceRead> => {
    const key = audienceKey(survey.audience);
    let read = audiences.get(key);
    if (!read) {
      read = readAudience(db, survey.audience);
      audiences.set(key, read);
    }
    return read;
  };
  return Promise.all(
    surveys.map(async (survey) => {
      const people = await peopleOf(db, survey.id);
      const reminds = surveyState(survey, now) === "open" && survey.kind !== "leaving";
      return counted(survey, people, reminds ? remindReach(people, await audienceOf(survey)).length : 0);
    }),
  );
}

/** A form as the cards name it: each programme by its kind and the short name its surveys keep, and whether it names a run. */
function formFactsOf(form: ApplicationForm): FormFacts {
  return {
    roundId: form.round.id,
    label: form.round.label.trim(),
    programmes: form.programmeIds.flatMap((programmeId) => {
      const settings = own(form.programmes, programmeId);
      if (!settings) return [];
      const name = settings.shortName.trim() || settings.name.trim();
      return [{ programmeId, title: programmeLine(settings.kind, name), hasRun: Boolean(settings.runId) }];
    }),
  };
}

/** Each programme's check-ins, grouped as the check-ins' own list groups them, with the weeks they were at. */
async function readCheckIns(db: Firestore, now: Date): Promise<ProgrammeCheckIns[]> {
  const all = await listCheckIns(db);
  return checkInListView(all, now).map((group) => {
    const mine = all.filter((survey) => programmeKey(survey.audience.roundId, survey.audience.programmeId) === group.key);
    return {
      group,
      weeks: [...new Set(mine.map((survey) => survey.audience.weekNumber))],
      latest: Math.max(0, ...mine.map((survey) => survey.checkIn.startsAt?.getTime() ?? 0)),
    };
  });
}

/**
 * The day of the last session of each of the term's programmes whose survey
 * at the end has not gone out, by programme key: what "due at the last
 * session" names. A programme with no run, or a run whose sessions cannot be
 * dated, has none.
 */
async function lastDaysOf(db: Firestore, form: ApplicationForm, surveys: readonly SurveyDoc[], now: Date): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    form.programmeIds.map(async (programmeId) => {
      const runId = own(form.programmes, programmeId)?.runId ?? null;
      if (!runId) return;
      const sent = surveys.some(
        (survey) => survey.kind === "after" && isProgrammeAudience(survey.audience, form.round.id, programmeId) && survey.firstSentAt !== null,
      );
      if (sent) return;
      const end = await readRunEndById(db, runId, now);
      if (end?.lastDay) out.set(programmeKey(form.round.id, programmeId), end.lastDay);
    }),
  );
  return out;
}

/** One tab of Run NAISI › Surveys for `viewer` at `now`, or null when the viewer may not have it. */
export async function loadSurveyHub(db: Firestore, viewer: SessionUser, tab: HubTab, now: Date): Promise<HubView | null> {
  if (!canRunSurveys(viewer)) return null;
  if (tab === "question-sets") return { tab, sets: questionSetRows(await readQuestionSets(db)) };
  const surveys = await listSurveys(db);
  if (tab === "events") {
    const events = surveys.filter((survey) => isEventAudience(survey.audience));
    // A survey after an event lists its answers as a count, and its rows may hold guests.
    const rows = await Promise.all(events.map(async (survey) => counted(survey, await eventPeopleOf(db, survey.id), 0)));
    return { tab, rows: eventRows(rows, now) };
  }
  const programmes = surveys.filter((survey) => !isEventAudience(survey.audience));
  const [countedSurveys, checkIns, forms] = await Promise.all([countProgrammeSurveys(db, programmes, now), readCheckIns(db, now), listForms(db)]);
  const term = chooseTerm(forms, now);
  return {
    tab,
    cards: programmeCards({
      forms: forms.map(formFactsOf),
      termRoundId: term?.round.id ?? null,
      lastDays: term ? await lastDaysOf(db, term, programmes, now) : new Map(),
      surveys: countedSurveys,
      checkIns,
      now,
    }),
  };
}
