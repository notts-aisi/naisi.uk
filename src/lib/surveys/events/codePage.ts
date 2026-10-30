import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { checkInPhase, eventTakesCheckIns } from "@/lib/events/checkIns";
import type { SessionUser } from "@/lib/firebase/session";
import type { AnswerScreen } from "../answerView";
import { closedOn, isOpen } from "../repo";
import { STATE_WORDS } from "../words";
import { mayAnswerSignedIn } from "./audience";
import { blanksScreenFor } from "../blanksView";
import { eventAnswerScreen } from "./answerView";
import { eventSurveyOf, readEventFor } from "./records";
import { readEventPerson } from "./store";
import { eventLine } from "./words";

/**
 * WHERE A SURVEY'S QR CODE LANDS (`/events/<id>/survey`), decided for one
 * visitor (Q43: confidential, never anonymous):
 *
 *  - SIGNED IN, and they signed up or came: the survey, kept with their name;
 *    once an admin has sent them the questions they left blank, only those.
 *  - SIGNED IN, and they did neither: a sentence, and the way to check in
 *    while the door is open.
 *  - SIGNED OUT: asked to sign in. A guest who signed up without an account,
 *    or a walk-in who left an email, is told to answer from their own link.
 *
 * Reading it writes nothing, and signed out it names nobody.
 */

export type CodePage =
  | { kind: "none" }
  | { kind: "message"; line: string; title: string; body: string; checkIn: string | null }
  | { kind: "sign-in"; line: string; title: string; next: string }
  | { kind: "survey"; line: string; screen: AnswerScreen };

export const CODE_PAGE_WORDS = {
  bar: "Survey",
  none: { title: "There’s no survey here", body: "This code is for a survey that isn’t on the site any more." },
  notOpen: { title: "This survey isn’t open yet", body: "It takes answers once the event’s organisers open it. Try again in a moment." },
  signIn: "Sign in to answer. Your answers are kept with your name, and only NAISI’s admins can see who said what.",
  signInButton: "Sign in",
  guest: "Signed up without an account, or left your email at the door? Answer from your own link in the email we send you.",
  notYours: {
    title: "This survey is for the people who came",
    body: "It goes to the people who came to this event or signed up for it. If you came, check in at the door first.",
  },
  checkIn: "Check in",
} as const;

export async function codePageFor(db: Firestore, eventId: string, user: SessionUser | null, now: Date): Promise<CodePage> {
  const [event, survey] = await Promise.all([readEventFor(db, eventId), eventSurveyOf(db, eventId)]);
  if (!survey) return { kind: "none" };
  const line = eventLine(survey.event.title, survey.event.startAt);
  if (!survey.firstSentAt) return { kind: "message", line, ...CODE_PAGE_WORDS.notOpen, checkIn: null };
  if (!isOpen(survey, now)) {
    const on = closedOn(survey);
    return on ? { kind: "message", line, ...STATE_WORDS.closed(on), checkIn: null } : { kind: "none" };
  }
  if (!user) return { kind: "sign-in", line, title: survey.title, next: `/events/${survey.audience.eventId}/survey` };
  if (!(await mayAnswerSignedIn(db, survey.audience.eventId, user.uid))) {
    const door = event && eventTakesCheckIns(event) && checkInPhase(event, now) === "door";
    return { kind: "message", line, ...CODE_PAGE_WORDS.notYours, checkIn: door ? `/events/${survey.audience.eventId}/check-in` : null };
  }
  const respondent = { kind: "account" as const, uid: user.uid };
  const row = await readEventPerson(db, survey.id, respondent);
  // An admin has sent them the questions they left blank: only those, until they send them.
  if (row?.answered && row.blanks && !row.blanks.spentAt) {
    const screen = await blanksScreenFor(db, { kind: "event", survey, person: row }, {
      submit: { kind: "signed-in", surveyId: survey.id },
      signedInAs: user.displayName?.trim() || null,
      now,
    });
    return { kind: "survey", line, screen };
  }
  const screen = await eventAnswerScreen(db, survey, {
    respondent,
    signedInAs: user.displayName?.trim() || null,
    answered: row?.answered === true,
    submit: { kind: "signed-in", surveyId: survey.id },
    now,
  });
  return { kind: "survey", line, screen };
}
