import { Section, Text } from "@react-email/components";
import type { EmailSendSurface } from "@/lib/firestore/emailSends";

/**
 * THE VISIBLE HALF OF THE NOTICE LANE.
 *
 * A notice ignores the recipient's notification grid on purpose: the organiser
 * of an event they are attending, or the facilitator of the group they are in,
 * is telling them something about that thing. The person on the other end did
 * not ask for that exception and cannot see it from the message, so the message
 * says it, above the body, in the recipient's own terms: why it reached them,
 * that their settings did not stop it, and that it is not marketing.
 *
 * ONE DOOR BUILDS IT. `sendNotice` in `src/lib/email/notice.ts` constructs this
 * element from the surface it was given and hands it to the template as a slot;
 * a template decides WHERE it sits (directly under the greeting in every one of
 * them today) and never what it says. That split is why the copy cannot drift
 * per surface while the class stays the same: a new notice surface writes one
 * line in {@link NOTICE_REASON} and inherits the rest. A surface whose reason
 * names the week it is about is handed the week's number, a fact and never
 * words: the words stay here.
 *
 * It is deliberately NOT an unsubscribe affordance and must never grow into
 * one. There is nothing here to switch off, which is the whole claim the line
 * is making, and offering a link that appears to switch it off would be the
 * one dishonest thing this email could do. The lane carries no unsubscribe
 * footer and no `List-Unsubscribe` header for the same reason, matching every
 * other bypass path in the estate.
 */

/**
 * Why this particular surface reached this particular person, as the second
 * half of one sentence. Written from the RECIPIENT'S side: "you have a place at
 * this event", never "you are on the attendee list".
 */
const NOTICE_REASON: Record<EmailSendSurface, string | ((facts: NoticeFacts) => string)> = {
  "event-broadcast": "you have a place at this event",
  // Past tense: by the time this lands the event is off, and "you have a place"
  // would be contradicted by the message it sits above.
  "event-cancel": "you had a place at this event",
  "course-group": "you are in this course group",
  "course-room": "you are in this course group",
  "course-run": "you are on this course",
  "course-survey": "you hold a place on this programme",
  // Months on, the person may hold no place: what reached them is their yes.
  "course-follow-up": "you said we could send you follow-ups about this programme",
  // Whichever of the two the survey's audience is, the person is one of them.
  "event-survey": "you came to this event or signed up for it",
  // Whichever survey it was, the person sent it, and these are its questions they left blank.
  "survey-blanks": "you sent this survey with some of its questions left blank",
  // The register marks the person at the session the check-in is about.
  "course-check-in": "you were at this session of your course group",
  // Its reminder goes only to somebody it reached who has not sent it, and says so.
  "course-check-in-reminder": "you were at this session of your course group and haven’t sent its check-in",
  // "Week N is open": everybody holding a place in the group.
  "course-week": "you are in this course group",
  // The reminders before a session (`courses-week-reminders`): the reminder
  // of the session, to everybody due at it, says its own reason
  // (`sessionReminderReason`); the reminder about what is left, to somebody
  // who will not be at the session, says this week's work isn't finished.
  "course-week-reminder": ({ sessionProgramme }) =>
    typeof sessionProgramme === "string" ? sessionReminderReason(sessionProgramme) : "our records show this week’s work isn’t finished",
  // Remind, by hand: pressed about any week, before its session or after it,
  // only for somebody whose week that is and who hasn't done it. It names the
  // week, which need not be this one.
  "course-week-remind-by-hand": ({ weekNumber }) =>
    weekNumber ? `our records show week ${weekNumber} isn’t done` : "our records show a week of your programme isn’t done",
  // Messages goes as a notice only to people its writer runs a programme for:
  // somebody holding a place on it, in one of its groups, or helping to run it.
  messages: "you hold a place on a programme or help run one",
  // Only the people holding a place on the programme get it as a notice.
  "event-invitation": "you are on the programme this event is part of",
};

/**
 * WHY THE REMINDER OF A SESSION REACHED SOMEBODY: they are due at a session
 * of their programme, which it names. The one place these words live.
 */
export function sessionReminderReason(programmeName: string): string {
  const name = programmeName.replace(/\s+/g, " ").trim();
  return name ? `you have a session coming up on ${name}` : "you have a session coming up";
}

/** The facts a surface's reason may name. */
export type NoticeFacts = {
  /** The week a reminder by hand is about. */
  weekNumber?: number | null;
  /**
   * The reminder of a session: the name of the programme the session is of.
   * Given, the reminders' surface says `sessionReminderReason`; not given, it
   * says what it always has.
   */
  sessionProgramme?: string | null;
};

type Props = {
  surface: EmailSendSurface;
} & NoticeFacts;

export default function NoticeMarker({ surface, weekNumber = null, sessionProgramme = null }: Props) {
  const said = NOTICE_REASON[surface];
  const reason = typeof said === "function" ? said({ weekNumber, sessionProgramme }) : (said ?? "you signed up for the thing it is about");
  return (
    <Section style={style.wrap}>
      <Text style={style.eyebrow}>Sent as an important notice</Text>
      <Text style={style.line}>
        You are getting this because {reason}, so it reaches you whatever your
        notification settings say, and it is never marketing.
      </Text>
    </Section>
  );
}

const style = {
  wrap: {
    backgroundColor: "#fafafa",
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid #e4e4e7",
    margin: "0 0 18px",
  } as React.CSSProperties,
  eyebrow: {
    color: "#3f3f46",
    fontSize: "12px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    fontWeight: 700,
    margin: "0 0 4px",
  } as React.CSSProperties,
  line: {
    color: "#52525b",
    fontSize: "13px",
    lineHeight: 1.6,
    margin: 0,
  } as React.CSSProperties,
};
