import LinkedText from "@/features/applications/kit/LinkedText";
import type { QuestionSetDoc } from "@/lib/applications/model";
import styles from "./form.module.css";

/**
 * The line a set's author wrote for applicants, under the set's heading and
 * before its first question.
 *
 * It is the author's text with its links (`LinkedText`): an address that
 * begins `https://` and `[words](https://address)` are drawn as links, and
 * everything else as the text it is. A set with no line draws nothing.
 *
 * THE RULE: this reads `applicantLine` and nothing else of the set. A set's
 * other line is its note for admins, which an applicant is never sent, and
 * which is not this line's to fall back on.
 */
export default function SetLine({ set }: { set: Pick<QuestionSetDoc, "applicantLine"> | null }) {
  const line = set?.applicantLine.trim() ?? "";
  if (!line) return null;
  return (
    <p className={styles.lede}>
      <LinkedText text={line} linkClassName={styles.inlineLink} />
    </p>
  );
}
