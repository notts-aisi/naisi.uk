import type { ReactNode } from "react";
import Link from "next/link";
import type { DrawCardModel } from "@/lib/courses/drawCard/model";
import {
  COPY_IN_THE_SLIPS,
  DRAW_CARD_TITLE,
  GIVE_OUT_LINE,
  NOTHING_STILL_TO_COME,
  NOTHING_TO_GIVE_OUT,
  OTHER_WEEKS,
  WHAT_WAS_GIVEN_OUT,
  cardWeekWords,
  casesNotSetWords,
  copyInWeekWords,
  everybodyHasWords,
  finishedWords,
  giveOutWords,
  handOutAtWords,
  handOutUndatedWords,
  notGivenWords,
  pickedWords,
  waitingWords,
  weekThingsWords,
  weeksListWords,
} from "@/lib/courses/drawCard/words";
import {
  changeDrawWords,
  drawTitleWords,
  handOutCalledOffWords,
  joinNames,
  nothingGivenOutWords,
  noSessionBeforeWords,
} from "@/lib/courses/packsAndCases/words";
import styles from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";

/**
 * THE PATHWAYS AND CASES CARD on a facilitator's group page, in every state
 * its model has (`src/lib/courses/drawCard/model.ts`): before the session
 * that hands the slips out; pinned from the start of that session until
 * everybody has theirs, with who has what by the name they go by and who has
 * not; everybody has one, with the other weeks a tap away; the next week
 * gives nothing out; a course that gives nothing out, and why; after the last
 * session. Every way on leads to the pathways and cases page
 * (`/learn/draw/[groupId]`), on the card's week, or with no week named, where
 * the page opens on the week the slips are for and its Week picker has the
 * others.
 *
 * Drawn on the server for the people the group page lets in. Names only.
 */

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.drawLinkChevron}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function LinkRow({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} className={styles.drawLinkRow}>
      <span className={styles.drawLinkText}>
        <span className={styles.drawLinkTitle}>{title}</span>
        <span className={styles.drawLinkSub}>{sub}</span>
      </span>
      <Chevron />
    </Link>
  );
}

export default function DrawCard({
  model,
  groupId,
  groupName,
  leadFirstName,
  todayKey,
}: {
  model: DrawCardModel;
  groupId: string;
  groupName: string;
  leadFirstName: string | null;
  /** Today in London, "YYYY-MM-DD", for naming the hand-out session by its weekday. */
  todayKey: string;
}) {
  const headingId = "group-spread";
  // The page with no week named opens on the week the slips are for, with its Week picker.
  const page = `/learn/draw/${encodeURIComponent(groupId)}`;
  const weekHref = (weekNumber: number) => `/learn/draw/${encodeURIComponent(groupId)}?week=${weekNumber}`;
  const pinned = model.kind === "week" && model.pinned;
  const title =
    model.kind === "week" ? (model.phase === "giveOut" ? giveOutWords(model.weekNumber, model.draw) : drawTitleWords(model.draw)) : DRAW_CARD_TITLE;

  const given = (weeks: readonly number[]) => (weeks.length > 0 ? <LinkRow href={page} title={WHAT_WAS_GIVEN_OUT} sub={weeksListWords(weeks)} /> : null);

  let body: ReactNode = null;
  if (model.kind === "finished") {
    body = (
      <>
        <p className={`${styles.drawCardLine} ${styles.drawCardSaid}`}>{finishedWords(groupName)}</p>
        {given(model.givenWeeks)}
      </>
    );
  } else if (model.kind === "nothingNext") {
    body = (
      <>
        <p className={`${styles.drawCardLine} ${styles.drawCardSaid}`}>
          {model.nextWeek !== null ? nothingGivenOutWords(model.nextWeek) : NOTHING_STILL_TO_COME}
        </p>
        {given(model.givenWeeks)}
      </>
    );
  } else if (model.kind === "notGivenOut") {
    const said =
      model.reason === "casesNotSet" && model.weekNumber !== null
        ? casesNotSetWords(model.weekNumber, leadFirstName)
        : model.reason === "picked" && model.weekNumber !== null
          ? pickedWords(model.weekNumber, model.chooseOneTitle, leadFirstName)
          : NOTHING_TO_GIVE_OUT;
    body = <p className={styles.drawCardLine}>{said}</p>;
  } else {
    const { weekNumber, draw, facts, phase } = model;
    const before = (() => {
      if (facts.calledOff) return handOutCalledOffWords(weekNumber, facts.calledOff.weekNumber, facts.handOut?.session.weekNumber ?? null);
      if (facts.handOut) return handOutAtWords({ dateKey: facts.handOut.session.dateKey, startsAt: facts.handOut.startsAt }, todayKey);
      if (facts.startsAt) return noSessionBeforeWords(weekNumber);
      return handOutUndatedWords(weekNumber);
    })();
    body = (
      <>
        {phase !== "giveOut" && <p className={styles.drawCardMeta}>{cardWeekWords(weekNumber, model.have, model.total)}</p>}
        {phase === "before" && (
          <>
            <p className={styles.drawCardLine}>{before}</p>
            <Link href={weekHref(weekNumber)} className={`${styles.buttonGhost} ${styles.drawCardButton}`}>
              {copyInWeekWords(weekNumber)}
            </Link>
            {model.earlier && (
              <LinkRow
                href={weekHref(model.earlier.weekNumber)}
                title={weekThingsWords(model.earlier.weekNumber, model.earlier.draw)}
                sub={everybodyHasWords(model.earlier.draw)}
              />
            )}
          </>
        )}
        {phase === "giveOut" && (
          <>
            <p className={styles.drawCardLine}>{GIVE_OUT_LINE}</p>
            <Link href={weekHref(weekNumber)} className={`${styles.buttonPrimary} ${styles.drawCardButton}`}>
              {COPY_IN_THE_SLIPS}
            </Link>
          </>
        )}
        {phase === "some" && (
          <>
            {model.tiles.length > 0 && (
              <ul className={styles.drawRows} role="list">
                {model.tiles.map((tile) => (
                  <li key={tile.id} className={styles.drawRow}>
                    <span className={styles.drawRowName}>{tile.name}</span>
                    <span className={styles.drawRowPeople}>{joinNames(tile.names)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className={`${styles.drawCardLine} ${styles.drawCardSaid}`}>{notGivenWords(model.notGiven.names, model.notGiven.unnamed)}</p>
            <p className={styles.drawCardLine}>{waitingWords(model.notGiven.names, model.notGiven.unnamed)}</p>
            <Link href={weekHref(weekNumber)} className={`${styles.buttonPrimary} ${styles.drawCardButton}`}>
              {COPY_IN_THE_SLIPS}
            </Link>
          </>
        )}
        {phase === "all" && (
          <>
            <p className={`${styles.drawCardLine} ${styles.drawCardSaid}`}>{everybodyHasWords(draw)}</p>
            <Link href={weekHref(weekNumber)} className={`${styles.buttonGhost} ${styles.drawCardButton}`}>
              {changeDrawWords(draw)}
            </Link>
            {model.otherWeeks.length > 0 && <LinkRow href={page} title={OTHER_WEEKS} sub={weeksListWords(model.otherWeeks)} />}
          </>
        )}
      </>
    );
  }

  return (
    <section
      className={`${weekly.card} ${styles.drawCard}${pinned ? ` ${styles.drawCardPinned}` : ""}`}
      aria-labelledby={headingId}
      data-testid="draw-card"
      data-pinned={pinned ? "true" : undefined}
    >
      <h2 id={headingId} className={weekly.cardTitle}>
        {title}
      </h2>
      {body}
    </section>
  );
}

