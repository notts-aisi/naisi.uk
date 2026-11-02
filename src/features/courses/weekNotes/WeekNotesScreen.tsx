import Link from "next/link";
import SectionTabs from "@/components/ui/SectionTabs";
import type { SavedCard, WeekNotesAdminView, WeekNotesLeadView } from "@/lib/courses/weekNotes/view";
import { WEEK_NOTES_WORDS } from "@/lib/courses/weekNotes/words";
import { weekNotesPath, weeksPath } from "@/lib/courses/weeksTab/paths";
import { WEEK_TABS_LABEL, weekTabs } from "@/lib/courses/weeksTab/tabs";
import { NOTE_SUGGESTIONS } from "@/lib/memberNotes/model";
import { NOTES_WORDS } from "@/lib/memberNotes/words";
import BuiltFrom from "./BuiltFrom";
import DraftAll from "./DraftAll";
import NoteDraftCard from "./NoteDraftCard";
import styles from "./weekNotes.module.css";

/**
 * ONE WEEK'S NOTES ABOUT PEOPLE (privacy v15), beside the week's review.
 *
 * FOR AN ADMIN: what Claude may use and what it never does, the counts, the
 * press that drafts a note for each person with none (once every group has
 * met), a card for each draft (what it was built from, the box to edit,
 * "Suggest for next term" unticked, who reads it, Save and Discard) and each
 * note already saved from this week, and the foot. FOR THE PROGRAMME'S LEAD:
 * the saved notes kept for leads, read only, and never a draft or a count.
 *
 * Drawn on the server from `loadWeekNotes`; the press and the draft cards are
 * the only client parts, and they are handed ids and words.
 */

type Props = {
  roundId: string;
  programmeId: string;
  programmeName: string;
} & ({ viewer: "admin"; view: WeekNotesAdminView } | { viewer: "lead"; view: WeekNotesLeadView });

export default function WeekNotesScreen(props: Props) {
  const { roundId, programmeId, programmeName, view } = props;
  const admin = props.viewer === "admin" ? props.view : null;

  return (
    <section className={styles.page} aria-labelledby="week-notes-title">
      <header className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.crumbs}>
            <Link href={weeksPath(roundId, programmeId, view.weekId)} className={styles.crumbLink}>
              {programmeName} / {WEEK_NOTES_WORDS.eyebrow}
            </Link>
          </p>
          <div className={styles.titleRow}>
            <h2 id="week-notes-title" className={styles.title}>
              {WEEK_NOTES_WORDS.title(view.weekNumber)}
            </h2>
            <span className={styles.chip}>{WEEK_NOTES_WORDS.adminsDraft}</span>
            <span className={styles.chip}>{WEEK_NOTES_WORDS.leadsRead}</span>
          </div>
          <p className={styles.subline}>{admin ? WEEK_NOTES_WORDS.subline : WEEK_NOTES_WORDS.leadSubline}</p>
        </div>
        {admin && admin.asksForWork && admin.claude && admin.allMet && admin.plan.length > 0 && (
          <div className={styles.headActions}>
            <DraftAll roundId={roundId} programmeId={programmeId} weekId={view.weekId} plan={admin.plan} />
          </div>
        )}
      </header>

      <SectionTabs tabs={weekTabs(roundId, programmeId, view.weekId)} current="notes" ariaLabel={WEEK_TABS_LABEL} />

      {admin ? <AdminBody view={admin} roundId={roundId} programmeId={programmeId} /> : <LeadBody view={props.view as WeekNotesLeadView} />}

      <p className={styles.foot}>{WEEK_NOTES_WORDS.foot(view.weekNumber)}</p>
    </section>
  );
}

function AdminBody({ view, roundId, programmeId }: { view: WeekNotesAdminView; roundId: string; programmeId: string }) {
  const filter = (only: "drafts" | "suggestions" | null, label: string) => (
    <Link
      href={weekNotesPath(roundId, programmeId, view.weekId, only)}
      className={styles.filter}
      aria-current={view.only === only ? "true" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <>
      <section className={styles.uses} aria-labelledby="week-notes-uses">
        <h3 id="week-notes-uses" className={styles.usesTitle}>
          {WEEK_NOTES_WORDS.usesTitle}
        </h3>
        <ul className={styles.tags}>
          {WEEK_NOTES_WORDS.uses.map((words) => (
            <li key={words} className={`${styles.tag} ${styles.tagYes}`}>
              {words}
            </li>
          ))}
          {WEEK_NOTES_WORDS.neverUses.map((words) => (
            <li key={words} className={`${styles.tag} ${styles.tagNo}`}>
              {words}
            </li>
          ))}
        </ul>
        <p className={styles.line}>{WEEK_NOTES_WORDS.usesLine}</p>
      </section>

      <div className={styles.countsRow}>
        <p className={styles.counts}>{view.asksForWork ? view.counts : WEEK_NOTES_WORDS.noWork}</p>
        <nav className={styles.filters} aria-label={WEEK_NOTES_WORDS.filtersLabel}>
          {view.only ? filter(null, WEEK_NOTES_WORDS.showEveryone) : null}
          {filter("drafts", WEEK_NOTES_WORDS.onlyDrafts)}
          {filter("suggestions", WEEK_NOTES_WORDS.onlySuggestions)}
        </nav>
      </div>

      <div className={styles.notes}>
        {!view.claude && <p className={styles.line}>{WEEK_NOTES_WORDS.notSetUp}</p>}
        {view.notYet && <p className={styles.line}>{view.notYet}</p>}
        {view.notYetAgreed && <p className={styles.line}>{view.notYetAgreed}</p>}
        {view.asksForWork && view.claude && view.allMet && (
          <p className={styles.line}>{view.plan.length > 0 ? WEEK_NOTES_WORDS.pressLine(view.plan.length) : WEEK_NOTES_WORDS.nobodyToDraft}</p>
        )}
      </div>

      {view.cards.length === 0 ? (
        <p className={styles.line}>{view.total === 0 ? WEEK_NOTES_WORDS.noneYet : WEEK_NOTES_WORDS.noneShown}</p>
      ) : (
        <ul className={styles.cards}>
          {view.cards.map((card) => (
            <li key={card.kind === "draft" ? `${card.uid}:${card.version}` : card.uid} className={styles.cardItem}>
              {card.kind === "draft" ? (
                <NoteDraftCard roundId={roundId} programmeId={programmeId} weekId={view.weekId} card={card} />
              ) : (
                <SavedNote card={card} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function LeadBody({ view }: { view: WeekNotesLeadView }) {
  return (
    <>
      <p className={styles.line}>{WEEK_NOTES_WORDS.leadLine}</p>
      {view.cards.length === 0 ? (
        <p className={styles.line}>{WEEK_NOTES_WORDS.leadEmpty}</p>
      ) : (
        <ul className={styles.cards}>
          {view.cards.map((card) => (
            <li key={card.uid} className={styles.cardItem}>
              <SavedNote card={card} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A note saved from this week: what it was built from, its words, what it suggests and who reads it. Read only. */
function SavedNote({ card }: { card: SavedCard }) {
  return (
    <article className={styles.card} aria-labelledby={`note-${card.uid}`}>
      <div className={styles.cardHead}>
        <div className={styles.who}>
          <h3 id={`note-${card.uid}`} className={styles.name}>
            {card.name}
          </h3>
          {card.group && <p className={styles.group}>{card.group}</p>}
        </div>
        <span className={`${styles.state} ${styles.stateSaved}`}>{card.savedBy}</span>
      </div>
      <BuiltFrom lines={card.builtFrom} />
      {card.offered && <p className={styles.fact}>{WEEK_NOTES_WORDS.offered}</p>}
      <div className={styles.field}>
        <p className={styles.label}>{WEEK_NOTES_WORDS.note}</p>
        <p className={styles.savedText}>{card.text}</p>
      </div>
      <p className={styles.line}>{card.line}</p>
      <p className={styles.line}>
        {card.suggest.length > 0 ? NOTES_WORDS.suggested(NOTE_SUGGESTIONS.filter((key) => card.suggest.includes(key))) : WEEK_NOTES_WORDS.noSuggestion}
      </p>
      <p className={styles.line}>{WEEK_NOTES_WORDS.readBy(NOTES_WORDS.audience[card.audience])}</p>
      <Link href={card.href} className={styles.inlineLink}>
        {WEEK_NOTES_WORDS.openNotes}
      </Link>
    </article>
  );
}
