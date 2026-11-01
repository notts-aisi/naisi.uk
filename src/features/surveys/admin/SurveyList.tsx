import Link from "next/link";
import Chip from "@/components/ui/Chip";
import SectionTabs from "@/components/ui/SectionTabs";
import type { CheckInListRow } from "@/lib/surveys/checkIns/adminView";
import { CHECK_IN_ADMIN_WORDS } from "@/lib/surveys/checkIns/words";
import type { HubLink, HubRow, HubView, ProgrammeCard } from "@/lib/surveys/hub/model";
import { hubTabHref } from "@/lib/surveys/hub/tabs";
import { HUB_WORDS } from "@/lib/surveys/hub/words";
import { LIST_WORDS, peopleWords } from "@/lib/surveys/words";
import styles from "./surveyHub.module.css";

/**
 * Run NAISI › Surveys, for admins: every survey by what it is for. Two tabs,
 * By programme and Events, each a link to the page's own address, and under
 * them what "confidential" means. By programme draws a card per programme, a
 * row for each stage it has (and for the term's programmes, each stage it
 * will have); Events draws each survey after an event. Every row says what
 * it is, how far it has got and the way in, and every way in is a target of
 * at least 44px. Drawn on the server from the view; nothing here reads.
 */

function RowChip({ row }: { row: HubRow }) {
  if (!row.chip) return null;
  return (
    <Chip tone={row.chip.tone} size="sm" dot={row.chip.dot}>
      {row.chip.word}
    </Chip>
  );
}

/** A row's name, its line and its chip: the same three cells whether the row is a link or opens in place. */
function RowText({ row }: { row: HubRow }) {
  return (
    <>
      <span className={styles.name}>{row.name}</span>
      <span className={styles.line}>{row.line}</span>
      <span className={styles.chip}>
        <RowChip row={row} />
      </span>
    </>
  );
}

function CheckIns({ rows, chart }: { rows: readonly CheckInListRow[]; chart: HubLink | null }) {
  return (
    <div className={styles.checkIns}>
      <p className={styles.muted}>{CHECK_IN_ADMIN_WORDS.listLede}</p>
      {chart && (
        <Link href={chart.href} className={styles.checkInLink} aria-label={chart.aria}>
          {chart.label}
        </Link>
      )}
      <ul className={styles.checkInRows}>
        {rows.map((row) => (
          <li key={row.id} className={styles.checkInRow}>
            <Link href={`/admin/surveys/${encodeURIComponent(row.id)}/results`} className={styles.checkInLink}>
              {row.label}
            </Link>
            {row.open && (
              <Chip tone="success" size="sm" dot>
                {LIST_WORDS.open}
              </Chip>
            )}
            <span className={styles.muted}>{[row.closes, peopleWords(row.reached)].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ row }: { row: HubRow }) {
  // The check-ins open in place: the row is the disclosure's whole summary,
  // so the target is the full row, and it holds no link of its own.
  if (row.checkIns) {
    return (
      <li className={styles.item}>
        <details className={styles.more}>
          <summary className={`${styles.row} ${styles.summary}`}>
            <RowText row={row} />
            <span className={styles.actions}>
              <span className={styles.seeThem} aria-hidden="true">
                {HUB_WORDS.seeThem}
              </span>
            </span>
          </summary>
          <CheckIns rows={row.checkIns} chart={row.chart} />
        </details>
      </li>
    );
  }
  return (
    <li className={styles.item}>
      <div className={styles.row}>
        <RowText row={row} />
        <span className={styles.actions}>
          {row.remind && (
            <span className={styles.remind}>
              <Link href={row.remind.href} className={styles.remindButton} aria-label={row.remind.aria}>
                {row.remind.label}
              </Link>
              <span className={styles.remindNote}>{row.remind.note}</span>
            </span>
          )}
          {row.link && (
            <Link href={row.link.href} className={styles.action} aria-label={row.link.aria}>
              {row.link.label}
            </Link>
          )}
        </span>
      </div>
    </li>
  );
}

function Card({ card, index }: { card: ProgrammeCard; index: number }) {
  const id = `programme-${index}`;
  return (
    <section className={styles.card} aria-labelledby={id}>
      <header className={styles.cardHead}>
        <h2 id={id} className={styles.cardTitle}>
          {card.title}
        </h2>
        {card.term && <span className={styles.cardTerm}>{card.term}</span>}
      </header>
      <ul className={styles.rows}>
        {card.rows.map((row) => (
          <Row key={row.key} row={row} />
        ))}
      </ul>
    </section>
  );
}

export default function SurveyList({ view }: { view: HubView }) {
  return (
    <div className={styles.hub}>
      <SectionTabs
        className={styles.tabs}
        ariaLabel={HUB_WORDS.tabs}
        current={view.tab}
        tabs={[
          { key: "programmes", label: HUB_WORDS.byProgramme, href: hubTabHref("programmes") },
          { key: "events", label: HUB_WORDS.events, href: hubTabHref("events") },
        ]}
      />
      <p className={styles.confidential}>
        <Chip tone="accent" size="sm">
          {LIST_WORDS.confidential}
        </Chip>
        <span>{LIST_WORDS.howConfidential}</span>
      </p>
      {view.tab === "programmes" ? (
        view.cards.length === 0 ? (
          <p className={styles.empty}>{LIST_WORDS.empty}</p>
        ) : (
          view.cards.map((card, index) => <Card key={card.key} card={card} index={index} />)
        )
      ) : (
        <section className={styles.card} aria-labelledby="events-surveys">
          <header className={styles.cardHead}>
            <h2 id="events-surveys" className={styles.cardTitle}>
              {HUB_WORDS.eventsTitle}
            </h2>
          </header>
          {view.rows.length === 0 ? (
            <p className={styles.muted}>{HUB_WORDS.noEvents}</p>
          ) : (
            <ul className={styles.rows}>
              {view.rows.map((row) => (
                <Row key={row.key} row={row} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
