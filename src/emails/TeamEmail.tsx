import { Section, Text } from "@react-email/components";
import EmailChrome from "./EmailChrome";

type Props = {
  /** "Your team: Probe transfer". The heading and the subject line. */
  subject: string;
  /** "Hi Wen,", or null for a greeting with no name. */
  greeting: string | null;
  /** The email's sentences, in order. Built by the sender, so the subject and the body cannot disagree. */
  paragraphs: string[];
  /** The programme lead's first name, who signs it, or null. */
  signOff: string | null;
};

/**
 * The email that tells somebody taking part in an incubator which team they
 * are in: the team, its project line, and the other people in it by name.
 * Sent by "Tell everyone their team" on the programme page's Teams tab, once
 * to each person whose team is new to them or has changed, and as a test to
 * whoever is about to press it.
 *
 * Every sentence comes from records and is written by `teamEmailWords` in
 * `src/lib/courses/teams/words.ts`; this file lays them out. It names no time
 * and no place, and never an address or a link to a meeting.
 *
 * No unsubscribe footer: it is about the programme the person is taking part
 * in, and it comes when their team does.
 */
export default function TeamEmail({ subject, greeting, paragraphs, signOff }: Props) {
  return (
    <EmailChrome subject={subject} preheader={paragraphs[0]} greeting={greeting ?? undefined}>
      <Section>
        {paragraphs.map((paragraph) => (
          <Text key={paragraph} style={para}>
            {paragraph}
          </Text>
        ))}
        {signOff ? <Text style={para}>{signOff}</Text> : null}
      </Section>
    </EmailChrome>
  );
}

const para: React.CSSProperties = {
  fontSize: "15px",
  color: "#27272a",
  margin: "0 0 12px",
  lineHeight: 1.6,
};
