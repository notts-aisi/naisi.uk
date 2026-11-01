import type { ReactNode } from "react";
import { Button, Section, Text } from "@react-email/components";
import EmailChrome, { emailLinkStyle } from "./EmailChrome";
import type { WeekEmailWords } from "@/lib/courses/weekEmails/words";

type Props = {
  /** Every word, from `weekOpenEmailWords` or `weekReminderEmailWords`. */
  words: WeekEmailWords;
  /** The notice lane's marker, built by `sendNotice`. */
  notice: ReactNode;
};

/**
 * THE WEEK'S EMAILS: "Week N is open", 6 days before a group's session, and
 * the reminders 3 days and 1 day before it to the people whose week is not
 * done. One layout for the three: the notice line, the words, a list for
 * each week (what it asks for, or what is left of it), a button to the week's
 * page and the lines under it.
 *
 * Fixed words, written in `src/lib/courses/weekEmails/words.ts`. Every value
 * is a React child or an `href`, never markup, so nothing a person typed (a
 * week's title, a room, the reason a session is off) can become a tag. Sent
 * as a notice, so there is no unsubscribe footer: nothing here can be
 * switched off, and offering to would be untrue. Never a meeting link: an
 * online session says "online".
 */
export default function WeekEmail({ words, notice }: Props) {
  return (
    <EmailChrome subject={words.subject} preheader={words.preheader} greeting={words.greeting || undefined}>
      {notice}
      <Section>
        {words.paragraphs.map((paragraph, index) => (
          <Text key={`p${index}`} style={para}>
            {paragraph}
          </Text>
        ))}
        {words.lists.map((list, index) => (
          <Section key={`l${index}`}>
            {list.lead ? <Text style={lead}>{list.lead}</Text> : null}
            <ul style={ul}>
              {list.items.map((item, at) => (
                <li key={at} style={li}>
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        ))}
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
        {words.feedback ? (
          <Text style={afterStyle}>
            <a href={words.feedback.url} style={emailLinkStyle}>
              {words.feedback.words}
            </a>
          </Text>
        ) : null}
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

const lead: React.CSSProperties = {
  fontSize: "15px",
  color: "#27272a",
  margin: "4px 0 6px",
  lineHeight: 1.6,
  fontWeight: 600,
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
