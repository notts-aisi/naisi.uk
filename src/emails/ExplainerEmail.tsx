import { Button, Section, Text } from "@react-email/components";
import EmailChrome from "./EmailChrome";
import type { ExplainerEmailWords } from "@/lib/courses/explainers/words";

type Props = {
  /** Every word, from `explainerEmailWords`. */
  words: ExplainerEmailWords;
};

/**
 * THE ONE EMAIL TO WHOEVER GIVES AN EXPLAINER, as an admin schedules it from
 * a week's review: who asked, the topic and how long, each session it opens
 * (the group, the week, the day and time, and the room), and the way to My
 * work, where there is a task for each session. Sent on the tasks row of
 * their notification choices, beside the tasks, so one email covers every
 * session rather than one a task.
 *
 * Fixed words, written in `src/lib/courses/explainers/words.ts`. Every value
 * is a React child or an `href`, never markup, so nothing a person typed (the
 * topic, a group's name, a room) can become a tag. Never a meeting link: an
 * online session says "online", and the line under it says to ask its
 * facilitators for the link.
 */
export default function ExplainerEmail({ words }: Props) {
  return (
    <EmailChrome subject={words.subject} preheader={words.preheader} greeting={words.greeting || undefined}>
      <Section>
        <Text style={para}>{words.lead}</Text>
        <ul style={ul}>
          {words.sessions.map((session, at) => (
            <li key={at} style={li}>
              {session}
            </li>
          ))}
        </ul>
        {words.link ? (
          <Button href={words.link} style={cta}>
            {words.button}
          </Button>
        ) : null}
        {words.after.map((line, index) => (
          <Text key={`a${index}`} style={afterStyle}>
            {line}
          </Text>
        ))}
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

const ul: React.CSSProperties = {
  margin: "0 0 16px",
  paddingLeft: "20px",
};

const li: React.CSSProperties = {
  fontSize: "15px",
  color: "#27272a",
  margin: "0 0 4px",
  lineHeight: 1.6,
};

const cta: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  background: "#09090b",
  color: "#fafafa",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 600,
  marginTop: "4px",
};

const afterStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#52525b",
  margin: "16px 0 0",
  lineHeight: 1.6,
};
