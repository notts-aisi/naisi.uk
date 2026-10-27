import Link from "next/link";
import OverviewMarkReady from "@/features/applications/overview/OverviewMarkReady";
import type { ReadinessModel, ReadyItem } from "@/lib/courses/getReady/model";
import {
  NEEDED_TITLE,
  NOT_READY_CHIP,
  PUBLISHED_CHIP,
  READY_CHIP,
  READY_TITLE,
  WORTH_LINE,
  WORTH_TITLE,
} from "@/lib/courses/getReady/words";
import styles from "./PublishGroups.module.css";

/**
 * "READY?" ON PUBLISH'S OWN PAGE (board st-publish): what Publish needs, and
 * what is worth checking and does not stop it, as `buildReadiness` worked it
 * out on the server from the facts the Overview's checklist reads. It decides
 * nothing: Publish refuses on the server for what is needed, whatever this
 * card says.
 *
 * Week 1's "Mark ready" is the Overview's own control. "Move Joel…" opens
 * People in groups, where the move menu is.
 *
 * Once the groups are published, the card says when, in the Overview's
 * checklist's words, and what a later move emails; its chip reads
 * "Published" while nothing a second press needs is missing.
 */

const MARK_LABEL: Record<ReadyItem["state"], string> = {
  done: "Done",
  blocks: "Needed",
  check: "Check this",
};

/** Done is a tick; needed and not done yet is the checklist's empty "To do" ring; worth checking is a warning. */
const MARK_CLASS: Record<ReadyItem["state"], string> = {
  done: styles.markDone,
  blocks: styles.markNeeded,
  check: styles.markCheck,
};

function Mark({ state }: { state: ReadyItem["state"] }) {
  return (
    <span role="img" aria-label={MARK_LABEL[state]} className={`${styles.mark} ${MARK_CLASS[state]}`}>
      {state === "done" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : state === "check" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
      ) : null}
    </span>
  );
}

function Item({ item, roundId, programmeId }: { item: ReadyItem; roundId: string; programmeId: string }) {
  const round = encodeURIComponent(roundId);
  const programme = encodeURIComponent(programmeId);
  return (
    <li className={styles.item}>
      <Mark state={item.state} />
      <div className={styles.itemBody}>
        <p className={styles.itemTitle}>{item.title}</p>
        <div className={styles.itemDetail}>
          {item.detail ? <p className={styles.itemLine}>{item.detail}</p> : null}
          {item.markReady || item.link ? (
            <div className={styles.itemActions}>
              {item.markReady ? (
                <OverviewMarkReady runId={item.markReady.runId} weekId={item.markReady.weekId} ready={false} />
              ) : null}
              {item.link?.to === "groups" ? (
                <Link href={`/admin/admissions/forms/${round}/programmes/${programme}/groups`} className={styles.itemButton}>
                  {item.link.label}
                </Link>
              ) : item.link?.to === "week-one" ? (
                <Link href={`/admin/admissions/forms/${round}/programmes/${programme}/weeks/w01`} className={styles.itemButton}>
                  {item.link.label}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function PublishReadiness({
  model,
  roundId,
  programmeId,
}: {
  model: ReadinessModel;
  roundId: string;
  programmeId: string;
}) {
  return (
    <section className={styles.card} aria-labelledby="publish-ready-title">
      <div className={styles.cardHead}>
        <h2 id="publish-ready-title" className={styles.cardTitle}>
          {READY_TITLE}
        </h2>
        <span className={`${styles.chip} ${model.ready ? styles.chipOk : styles.chipWarn}`}>
          <span className={styles.chipDot} aria-hidden="true" />
          {!model.ready ? NOT_READY_CHIP : model.published ? PUBLISHED_CHIP : READY_CHIP}
        </span>
      </div>
      {model.published ? (
        <p className={`${styles.groupLine} ${styles.publishedLine}`}>
          {model.published.when} {model.published.later}
        </p>
      ) : null}
      <div className={styles.groupHead}>
        <h3 className={styles.eyebrow}>{NEEDED_TITLE}</h3>
      </div>
      <ul className={styles.items}>
        {model.needed.map((item) => (
          <Item key={item.key} item={item} roundId={roundId} programmeId={programmeId} />
        ))}
      </ul>
      {model.worth.length > 0 ? (
        <>
          <div className={styles.groupHead}>
            <h3 className={styles.eyebrow}>{WORTH_TITLE}</h3>
            <span className={styles.groupLine}>{WORTH_LINE}</span>
          </div>
          <ul className={styles.items}>
            {model.worth.map((item) => (
              <Item key={item.key} item={item} roundId={roundId} programmeId={programmeId} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
