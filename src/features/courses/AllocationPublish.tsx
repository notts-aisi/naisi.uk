"use client";

import Button from "@/components/ui/Button";
import {
  NOTHING_TO_SEND,
  PUBLISH_ADMIN_ONLY,
  emptyGroupsLine,
  gaveBackLine,
  moreLine,
  noAddressLine,
  publishAudienceLine,
  publishButtonLabel,
  testLine,
} from "@/lib/courses/publishWords";
import type { PublishSummary } from "./useAllocation";
import styles from "./AllocationPublish.module.css";

/**
 * The Publish area of a run's allocation board: who a press emails, the last
 * test, "Send a test to me" and "Publish and send 37 emails".
 *
 * IT DRAWS WHAT THE SERVER WORKED OUT, and decides nothing. The number on the
 * button, the people and facilitators it reaches, what would stop it and the
 * last test all come from the board's read (`PublishSummary`), which is the
 * plan Publish itself reads, and every sentence comes from
 * `src/lib/courses/publishWords.ts`. The board's handlers do the pressing.
 *
 * PUBLISH IS LOCKED until a test of the wording in force has been sent, as
 * the server holds it, and while an email cannot be written. A press that
 * would send nothing says so instead of offering to send 0, and needs no
 * test. A run the application form fills is an admin's to publish: anybody
 * else is told so and offered no button.
 */

type Props = {
  summary: PublishSummary;
  /** ISO instant of the last publish, or null. */
  publishedAt: string | null;
  busy: boolean;
  testing: boolean;
  /** What the last test came to, when the server's own line does not say it (held, or the do-not-email list). */
  testNote: string | null;
  /** Why the last test or press did not go. */
  problem: string | null;
  /** What the last press did, a sentence each. */
  result: string[];
  onTest: () => void;
  onPublish: () => void;
};

/** "Tue 27 Oct at 5:38pm", in London, as the course pages write a moment. */
function publishedWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...options }).format(at);
  const [hour, minute] = part({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const clock = `${twelve}${minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`}${hour < 12 ? "am" : "pm"}`;
  return `${part({ weekday: "short", day: "numeric", month: "short" })} at ${clock}`;
}

function Tick() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AllocationPublish({
  summary,
  publishedAt,
  busy,
  testing,
  testNote,
  problem,
  result,
  onTest,
  onPublish,
}: Props) {
  const sends = summary.emails > 0;
  const fresh = summary.test.state === "fresh";
  const blocked = summary.refusals.length > 0 || (sends && !fresh);

  return (
    <section className={styles.publish} aria-labelledby="allocation-publish-title">
      <div className={styles.words}>
        <h3 id="allocation-publish-title" className={styles.title}>
          {publishAudienceLine(summary.people, summary.facilitators)}
        </h3>

        {summary.adminOnly ? (
          <p className={styles.line}>{PUBLISH_ADMIN_ONLY}</p>
        ) : (
          <>
            {sends ? null : <p className={styles.line}>{NOTHING_TO_SEND}</p>}
            {summary.more > 0 ? <p className={styles.line}>{moreLine(summary.more)}</p> : null}
            {summary.noAddress.length > 0 ? (
              <p className={styles.lineWarn}>{noAddressLine(summary.noAddress)}</p>
            ) : null}
            {summary.emptyGroups.length > 0 ? (
              <p className={styles.line}>{emptyGroupsLine(summary.emptyGroups)}</p>
            ) : null}
            {/* Their cards say "Gave their place back": the press leaves them
                out, and Remove frees the seat each still holds. */}
            {summary.gaveBack && summary.gaveBack > 0 ? (
              <p className={styles.lineWarn}>{gaveBackLine(summary.gaveBack)}</p>
            ) : null}
            {summary.refusals.map((sentence) => (
              <p key={sentence} className={styles.lineWarn}>
                {sentence}
              </p>
            ))}
            {sends ? (
              <p className={fresh ? styles.lineOk : summary.test.state === "stale" ? styles.lineWarn : styles.line}>
                {fresh ? <Tick /> : null}
                <span>{testLine(summary.test)}</span>
              </p>
            ) : null}
            {testNote ? (
              <p className={styles.lineWarn} role="status">
                {testNote}
              </p>
            ) : null}
            {publishedAt ? (
              <p className={styles.line}>
                Published {publishedWhen(publishedAt)}. Publishing again emails only the people and facilitators who
                have not been told.
              </p>
            ) : null}
            {result.length > 0 ? (
              <div className={styles.result} role="status">
                {result.map((line) => (
                  <p key={line} className={styles.resultLine}>
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            {problem ? (
              <p className={styles.problem} role="alert">
                {problem}
              </p>
            ) : null}
          </>
        )}
      </div>

      {summary.adminOnly ? null : (
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onTest} disabled={busy || testing || !sends}>
            {testing ? "Sending the test…" : "Send a test to me"}
          </Button>
          <Button onClick={onPublish} disabled={busy || testing || blocked}>
            {publishButtonLabel(summary.emails)}
          </Button>
        </div>
      )}
    </section>
  );
}
