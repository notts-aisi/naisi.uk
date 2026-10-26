import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { eventEnds, setWalkInEmailDeadlines } from "@/lib/events/checkIns";
import { normalizeEvent, type EventDoc } from "@/lib/firestore/events";
import {
  SURVEYS_COLLECTION,
  isEventSurvey,
  normalizeSurvey,
  type EventSurveyDoc,
  type SurveyEventFacts,
} from "@/lib/firestore/surveys";
import { twoYearsAfter } from "../namesOff";

/**
 * A SURVEY AFTER AN EVENT, AND ITS EVENT: the reads every part of it shares.
 * One document by its id, or one equality on `eventId`.
 */

const isEventId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/** The day names come off a survey after `event`: two years after the day it ended, in London. */
export function eventNamesOffOn(event: Pick<EventDoc, "startAt" | "endAt"> | SurveyEventFacts): string | null {
  const ends = eventEnds(event);
  return ends ? twoYearsAfter(londonDateKey(ends)) : null;
}

/** The event, read for its survey, or null. */
export async function readEventFor(db: Firestore, eventId: string): Promise<EventDoc | null> {
  if (!isEventId(eventId)) return null;
  const snap = await db.collection("events").doc(eventId).get();
  return snap.exists ? normalizeEvent(snap.id, snap.data() ?? {}) : null;
}

/** An event's survey, or null: one equality on `eventId`, the oldest should there be two. */
export async function eventSurveyOf(db: Firestore, eventId: string): Promise<EventSurveyDoc | null> {
  if (!isEventId(eventId)) return null;
  const snap = await db.collection(SURVEYS_COLLECTION).where("eventId", "==", eventId).get();
  const surveys = snap.docs
    .map((doc) => normalizeSurvey(doc.id, doc.data() ?? {}))
    .filter((survey): survey is EventSurveyDoc => isEventSurvey(survey) && survey.audience.eventId === eventId)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
  return surveys[0] ?? null;
}

/**
 * The day names come off a survey after an event, as it stands now: from the
 * event while it is there, else from the facts the survey kept of it.
 */
export async function eventNamesOffDay(db: Firestore, survey: EventSurveyDoc): Promise<string | null> {
  const event = await readEventFor(db, survey.audience.eventId);
  return eventNamesOffOn(event ?? survey.event);
}

/** When an event's survey stops taking answers (closed by hand, else its closing time), or null when it has none. */
export function surveyClosesOf(survey: Pick<EventSurveyDoc, "closedAt" | "closesAt"> | null): Date | null {
  return survey ? (survey.closedAt ?? survey.closesAt) : null;
}

/** When the event's survey stops taking answers, or null when the event has none: check-in's deadlines follow it. */
export async function surveyClosesFor(db: Firestore, eventId: string): Promise<Date | null> {
  return surveyClosesOf(await eventSurveyOf(db, eventId));
}

/**
 * The walk-ins' emails follow the survey (Q44): they go when it closes or a
 * week after the event, whichever comes first. Asked whenever its closing day
 * is set, changed or reached by hand; an event that is gone has none to move.
 */
export async function alignWalkInEmails(db: Firestore, surveyId: string, now: Date): Promise<void> {
  const snap = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();
  if (!snap.exists) return;
  const survey = normalizeSurvey(snap.id, snap.data() ?? {});
  if (!isEventSurvey(survey)) return;
  const event = await readEventFor(db, survey.audience.eventId);
  if (!event) return;
  await setWalkInEmailDeadlines(db, event, surveyClosesOf(survey), now);
}
