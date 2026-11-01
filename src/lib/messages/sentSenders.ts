import type { EmailSendKind, EmailSendSurface } from "@/lib/firestore/emailSends";

/**
 * WHICH OF THE EMAIL LOG'S SENDS SENT LISTS, AND WHAT EACH ONE IS CALLED.
 *
 * Sent (`./sent.ts`) lists every message written in Messages from its own
 * record, and beside them, for admins, what the site's other senders sent,
 * read from the email log (`emailSends`) and grouped into sends. This table
 * decides which rows of the log are such a send, by their `kind` and, for a
 * notice, their `surface`.
 *
 * A SEND IS A MESSAGE TO PEOPLE: somebody writing to a list or an audience,
 * or a job writing to one on the site's behalf. The newsletter, an event's
 * announcement, every notice (a room change, a survey, a week's email) and the
 * course mail that came before the notice lane are sends. An email that
 * answers something one person did, or is about their own application, place,
 * work or certificate, is not: it is listed in the email log on the admins'
 * Email delivery page, with the address it went to. Nor is a test, which
 * reached only the person who pressed it, or a message from Messages, which
 * Sent reads from its own record so it can say who was left out and why.
 *
 * Every kind and every surface the log can hold has an entry here, with what
 * it is called or why it is not listed (`tests/messages.test.mjs` reads both
 * unions out of `src/lib/firestore/emailSends.ts` and holds this table to
 * them both ways), so a new kind of send is decided rather than dropped.
 *
 * `byPerson`: whether the row's `actorUid` is the person who wrote or pressed
 * it, so Sent can name them. A job writes its own id there, and the register
 * reminder the reminded facilitator's, so those say the site sent them.
 *
 * Pure, with type-only imports.
 */

export type ListedSend = { label: string; byPerson: boolean };
export type SentEntry = { listed: ListedSend } | { notListed: string };

const TEST = "A test, which reached only the person who pressed it.";

export const SENT_KINDS: Record<EmailSendKind, SentEntry> = {
  newsletter: { listed: { label: "Newsletter", byPerson: true } },
  broadcast: { listed: { label: "To an event’s people", byPerson: true } },
  rsvp: { notListed: "A sign-up’s own email: its confirmation, a decision on it or a change to it, to the person who signed up." },
  task: { notListed: "A task or a worksheet’s email to one person about work they are on." },
  application: { notListed: "An application’s own email, to the person who applied." },
  "application-test": { notListed: TEST },
  "course-application": { notListed: "An application to a course run, to the person who applied." },
  "course-facilitator": {
    notListed:
      "Today the reminder to a group’s facilitator about its register, one email each about their own group. The group email wrote these rows before the notice lane, and now writes notices.",
  },
  "course-broadcast": { listed: { label: "Cohort announcement", byPerson: true } },
  "course-nudge": { listed: { label: "Weekly course email", byPerson: false } },
  "course-notice": { listed: { label: "Room notice", byPerson: true } },
  "course-enrolment": { notListed: "Somebody joining or leaving a run: their own confirmation." },
  "course-feedback": { notListed: "One email to each person saying feedback on their own week is waiting." },
  "course-certificate": { notListed: "One email to each person with their own certificates." },
  admissions: { notListed: "Somebody’s own application to a round: its receipt, a decision or an invitation." },
  notice: { listed: { label: "Notice", byPerson: true } },
  "event-announcement": { listed: { label: "Event announcement", byPerson: true } },
  message: { notListed: "A message from Messages: Sent lists it from its own record, with who was left out and why." },
  "message-test": { notListed: TEST },
  "course-test": { notListed: TEST },
  "admin-test": { notListed: TEST },
  "subscription-confirm": { notListed: "The link that confirms somebody’s own subscription." },
  "subscription-welcome": { notListed: "The welcome to somebody who has just subscribed." },
  "subscription-added": { notListed: "The note to somebody an admin added to a list." },
  unknown: { notListed: "A row whose kind was not recorded, so nothing can say what it was." },
};

/** A notice's surface: what it was, and whether the actor on the row wrote it. */
export const SENT_SURFACES: Record<EmailSendSurface, SentEntry> = {
  "event-broadcast": { listed: { label: "To an event’s people", byPerson: true } },
  "event-cancel": { listed: { label: "Event cancelled", byPerson: true } },
  "course-group": { listed: { label: "To a course group", byPerson: true } },
  "course-room": { listed: { label: "Room notice", byPerson: true } },
  "course-run": { listed: { label: "To a programme’s people", byPerson: true } },
  "course-survey": { listed: { label: "Programme survey", byPerson: true } },
  "course-follow-up": { listed: { label: "Follow-up survey", byPerson: true } },
  "event-survey": { listed: { label: "Survey after an event", byPerson: true } },
  "survey-blanks": { listed: { label: "Survey questions left blank", byPerson: true } },
  "course-check-in": { listed: { label: "Check-in after a session", byPerson: true } },
  // Pressed by a group's facilitator from the register, or sent by the job,
  // whose id is no account: Sent names whichever is an account.
  "course-week": { listed: { label: "The week’s email", byPerson: true } },
  "course-week-reminder": { listed: { label: "Reminder before a session", byPerson: false } },
  messages: { notListed: "A message from Messages that went as a notice: Sent lists it from its own record." },
};

/** What one row of the log is, as a send, or null when Sent does not list it. */
export function listedSendOf(kind: unknown, surface: unknown): ListedSend | null {
  if (typeof kind !== "string" || !Object.hasOwn(SENT_KINDS, kind)) return null;
  const entry = SENT_KINDS[kind as EmailSendKind];
  if (!("listed" in entry)) return null;
  if (kind !== "notice") return entry.listed;
  // A notice is what its surface says; one with no surface it knows is not listed.
  if (typeof surface !== "string" || !Object.hasOwn(SENT_SURFACES, surface)) return null;
  const onSurface = SENT_SURFACES[surface as EmailSendSurface];
  return "listed" in onSurface ? onSurface.listed : null;
}
