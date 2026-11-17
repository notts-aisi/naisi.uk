import { Text } from "@react-email/components";
import EmailChrome from "./EmailChrome";

/**
 * To the accounts that run the AI at Nottingham survey, when it has sent as
 * many codes in an hour as its ceiling allows and has started telling people
 * it is busy (src/lib/aiSurvey/adminAlert.ts). At most one an hour.
 *
 * It says nothing about anybody: a count, what people are being told, and
 * where to look.
 */
type Props = { subject: string; ceiling: number; busyWords: string };

export default function AiSurveyCeilingEmail({ subject, ceiling, busyWords }: Props) {
  return (
    <EmailChrome subject={subject} preheader={`It has sent ${ceiling} codes in an hour and is asking people to wait.`}>
      <Text style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 16px" }}>
        The AI at Nottingham survey has sent {ceiling} codes in the last hour, which is its ceiling. Anybody who asks
        for a code now is told: “{busyWords}”
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 16px" }}>
        It lifts by itself as the hour moves on. If a room is answering at once, this is that. If not, somebody may be
        asking for codes to addresses that are not theirs: the survey’s admin page shows the count.
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 1.5, color: "#5b6785", margin: 0 }}>
        You will not get this email again for an hour.
      </Text>
    </EmailChrome>
  );
}
