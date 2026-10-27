import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isValidDateKey, londonDateKey } from "@/lib/courses/weekPlan";
import { addLaterUntil } from "@/lib/events/checkIns";
import { normalizeEvent, type EventDoc } from "@/lib/firestore/events";
import { SURVEYS_COLLECTION, isEventSurvey, type EventAudience, type SurveyDoc } from "@/lib/firestore/surveys";
import { closesAtFor, type Refused } from "../create";
import { surveyQuestionsOf } from "../items";
import { REFUSAL } from "../words";
import { EVENT_TEMPLATE_MINUTES, eventTemplateItems } from "./template";
import { ensureSurveyCode } from "./code";
import { alignWalkInEmails, eventNamesOffOn, eventSurveyOf, readEventFor } from "./records";
import { EVENT_REFUSAL, eventIntro, eventSurveyName, eventSurveyTitle } from "./words";

/**
 * MAKING THE SURVEY AFTER AN EVENT (sv-new, "After a social"). An admin picks
 * a published event, who its email goes to (the people who came, or everybody
 * who signed up) and the day it closes; everything else is the template's,
 * with the event's name and day in its words. One survey per event.
 *
 * It is changed on its Questions tab until it opens (`firstSentAt`): an admin
 * opening it for the QR code at the event, or its first email, whichever
 * comes first. From then on it is fixed, as every survey is.
 *
 * The day names come off is two years after the event (Zach, 26 October
 * 2026: two years for everyone), worked out from the event's own date when
 * the survey is made, saved or tested, and fixed when it opens.
 */

type Raw = Record<string, unknown>;
const isRaw = (value: unknown): value is Raw => value !== null && typeof value === "object" && !Array.isArray(value);
const isEventId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export type EventCreateInput = { eventId: string; audience: EventAudience["kind"]; closesOn: string };

/** Who a survey after an event emails, from the words a form sends. */
export function audienceKindFrom(raw: unknown): EventAudience["kind"] | null {
  return raw === "came" ? "event-came" : raw === "signups" ? "event-signups" : null;
}

/** A request to make a survey after an event, checked before anything is read. */
export function parseEventCreate(raw: unknown, now: Date): { ok: true; input: EventCreateInput } | Refused {
  if (!isRaw(raw) || !isEventId(raw.eventId)) return { ok: false, status: 400, error: EVENT_REFUSAL.pickEvent };
  const audience = audienceKindFrom(raw.audience);
  if (!audience) return { ok: false, status: 400, error: EVENT_REFUSAL.pickAudience };
  if (typeof raw.closesOn !== "string" || !isValidDateKey(raw.closesOn)) {
    return { ok: false, status: 400, error: "Pick the day it closes." };
  }
  if (raw.closesOn < londonDateKey(now)) return { ok: false, status: 400, error: REFUSAL.closesPast };
  return { ok: true, input: { eventId: raw.eventId, audience, closesOn: raw.closesOn } };
}

/**
 * Why an event cannot have a survey made now, or "": it must be published and
 * dated, no more than a week over (after that, a walk-in's email is gone and
 * nobody can be added as having come), and without one already.
 */
function blockedFor(event: EventDoc, hasOne: boolean, now: Date): string {
  if (hasOne) return EVENT_REFUSAL.hasOne;
  if (event.status !== "published") return EVENT_REFUSAL.notPublished;
  if (!event.startAt) return EVENT_REFUSAL.undated;
  const until = addLaterUntil(event);
  if (until && until.getTime() < now.getTime()) return EVENT_REFUSAL.tooLate;
  return "";
}

/** An event New survey offers, with whether its survey can be made now. */
export type EventChoice = {
  eventId: string;
  title: string;
  startAt: Date | null;
  /** Nobody signs up for it, so its survey goes only to the people who came. */
  noSignup: boolean;
  /** Why it cannot have one, or "" when it can. */
  blocked: string;
};

/**
 * The events New survey offers: published ones that are coming up or no more
 * than a week over, soonest first. One equality on `status`, sorted in memory.
 */
export async function listEventChoices(db: Firestore, surveys: readonly SurveyDoc[], now: Date): Promise<EventChoice[]> {
  const snap = await db.collection("events").where("status", "==", "published").get();
  const made = new Set(surveys.flatMap((survey) => (isEventSurvey(survey) ? [survey.audience.eventId] : [])));
  return snap.docs
    .map((doc) => normalizeEvent(doc.id, doc.data() ?? {}))
    .filter((event) => {
      const until = addLaterUntil(event);
      return event.startAt !== null && until !== null && until.getTime() >= now.getTime();
    })
    .sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0) || a.id.localeCompare(b.id))
    .map((event) => ({
      eventId: event.id,
      title: event.title.trim() || "Untitled event",
      startAt: event.startAt,
      noSignup: event.noSignup,
      blocked: blockedFor(event, made.has(event.id), now),
    }));
}

/** Make an event's survey from the template. The route has held the caller to admin. */
export async function createEventSurvey(
  db: Firestore,
  createdByUid: string,
  input: EventCreateInput,
  now: Date,
): Promise<{ ok: true; id: string } | Refused> {
  const event = await readEventFor(db, input.eventId);
  if (!event) return { ok: false, status: 404, error: EVENT_REFUSAL.noEvent };
  const blocked = blockedFor(event, (await eventSurveyOf(db, event.id)) !== null, now);
  if (blocked) return { ok: false, status: 409, error: blocked };
  if (input.audience === "event-signups" && event.noSignup) return { ok: false, status: 409, error: EVENT_REFUSAL.noSignup };
  const namesOffOn = eventNamesOffOn(event);
  if (!namesOffOn || !event.startAt) return { ok: false, status: 409, error: EVENT_REFUSAL.undated };
  if (input.closesOn < londonDateKey(event.startAt)) return { ok: false, status: 400, error: EVENT_REFUSAL.closesBefore };

  const title = event.title.trim() || "Untitled event";
  const items = eventTemplateItems();
  const minutes = EVENT_TEMPLATE_MINUTES;
  const ref = db.collection(SURVEYS_COLLECTION).doc();
  await ref.set({
    kind: "event",
    privacy: "confidential",
    name: eventSurveyName(title),
    title: eventSurveyTitle(title),
    intro: eventIntro(event.startAt, surveyQuestionsOf(items).length, minutes),
    items,
    minutes,
    audience: { kind: input.audience, eventId: event.id },
    eventId: event.id,
    event: { title, startAt: event.startAt, endAt: event.endAt },
    runId: "",
    pairOf: null,
    strand: null,
    closesAt: closesAtFor(input.closesOn),
    closedAt: null,
    namesOffOn,
    namesOffAt: null,
    firstSentAt: null,
    presses: [],
    tests: { survey: null, reminder: null },
    testToken: null,
    createdByUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Its QR code, made with it so it can be downloaded before the event; and
  // the walk-ins' emails, which now go no later than it closes.
  await ensureSurveyCode(db, { id: event.id, title }, createdByUid);
  await alignWalkInEmails(db, ref.id, now);
  return { ok: true, id: ref.id };
}
