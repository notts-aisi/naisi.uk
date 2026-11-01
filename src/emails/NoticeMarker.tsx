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
 * line in {@link NOTICE_REASON} and inherits the rest.
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
const NOTICE_REASON: Record<EmailSendSurface, string> = {
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
  // "Week N is open": everybody holding a place in the group.
  "course-week": "you are in this course group",
  // A reminder goes only to somebody whose week is not done, and says so.
  "course-week-reminder": "our records show this week’s work isn’t finished",
  // Messages goes as a notice only to people its writer runs a programme for:
  // somebody holding a place on it, in one of its groups, or helping to run it.
  messages: "you hold a place on a programme or help run one",
};

type Props = {
  surface: EmailSendSurface;
};

export default function NoticeMarker({ surface }: Props) {
  const reason = NOTICE_REASON[surface] ?? "you signed up for the thing it is about";
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
