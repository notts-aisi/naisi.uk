"use client";

import { useId, useState } from "react";
import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import type { ReviewPageModel, ReviewPerson } from "@/lib/courses/writtenAnswers/reviewPage";
import { FEEDBACK_HINT, YOUR_FEEDBACK } from "@/lib/courses/feedback/words";
import {
  GROUP,
  LATE,
  NOBODY_HERE,
  NOBODY_SENT_YET,
  NOT_SENT_YET,
  NO_WRITTEN_ANSWER_THIS_WEEK,
  PREVIOUS,
  SHOW_ALL_OF_IT,
  TO_GIVE_FEEDBACK_ON,
  WITH_FEEDBACK,
  WRITTEN_ANSWERS,
  answerHeadWords,
  byWords,
  listLockedWords,
  listSentWords,
  nextWords,
  positionWords,
  reviewEyebrowWords,
  reviewTitleWords,
  reviewWeekLineWords,
  theQuestionWords,
  wordCountWords,
} from "@/lib/courses/writtenAnswerWords";
import {
  BEFORE_THEY_JOINED,
  NOT_STARTED,
  REOPENED_NOT_SUBMITTED,
  STARTED,
} from "@/lib/courses/weekWork/words";
import { pangramChipWords } from "@/lib/courses/workRatings/words";
import FeedbackWriter from "../feedback/FeedbackWriter";
import StaffFeedbackCards from "../feedback/StaffFeedbackCards";
import Prose from "../weekBlocks/Prose";
import RatingForTheTeam from "./RatingForTheTeam";
import ReopenWeekButton from "./ReopenWeekButton";
import SessionReportLines from "./SessionReportLines";
import weekly from "../weekly/weekly.module.css";
import styles from "./written.module.css";

/**
 * THE REVIEW PAGE (boards wk-review at 1440, wk-review-phone at 390): one
 * answer at a time with Previous and Next, the group's written answers for
 * the week as the board groups them ("To give feedback on", "With
 * feedback", "Not submitted yet"), the question with its range, the answer
 * with its count, when its week was submitted or locked and "Reopen week 3
 * for Amara", "Your feedback" (a signed comment, saved to the person's week
 * page straight away and emailed later in an admin's batch), and every other
 * piece of feedback on their week. "Late" beside an answer is shown here, to
 * staff, and nowhere its writer reads. No rubric level is given here: the
 * rubric stays on Start here, as guidance for writing.
 *
 * For an admin or the programme's lead alone, "Rating for the team" and
 * "What the team said" sit under the feedback (`RatingForTheTeam`, privacy
 * v15: never shown to the person), and an admin alone sees Pangram's last
 * reading of the answer beside when it was sent. The model carries neither
 * for anybody else.
 *
 * Between the feedback and the ratings, what the week's session reports say
 * about the person (`SessionReportLines`, privacy v15's "Session reports"):
 * their lines alone, every report's for an admin or the lead, the reader's
 * own report's for a facilitator. Read only, and never shown to the person.
 *
 * Drawn from `loadWrittenReview` on the server, after the page's gate; every
 * person here is somebody the reader may review by the one gate, and an
 * answer is opened here only once its readers may read it (privacy v15: its
 * week submitted or locked). Until then the list says only that it is
 * started. Opening an answer locks nothing: the week locks.
 *
 * NOT DRAWN, though the board draws it: the person's reflections this week,
 * folded under the answer. The reflections half of the review is the
 * facilitator's week's, a later piece; this page leaves room for it there.
 */

type Props = {
  model: ReviewPageModel;
  /** This page's own address, with no query: the list and Previous and Next add theirs. */
  basePath: string;
  /** The group, for a page that names it in its query (the lead's): kept on every link. */
  groupParam?: string;
  /**
   * The run's groups to choose between, on the lead's page, which reviews any
   * of them: each its own page, the one shown marked. Absent on a
   * facilitator's page, which is one group's own.
   */
  groups?: ReviewGroupLink[];
  /** The way back: "Group B" to the group's page, or the lead's tab. */
  back: { href: string; label: string };
};

/** One group to choose on the lead's page: "A" in its pill, "Group A" for a screen reader, and its page. */
export type ReviewGroupLink = { id: string; name: string; tag: string; href: string };

/** The page's own address with its query begun: `?group=…&` on the lead's page, `?` otherwise. */
function linkBaseOf(basePath: string, groupParam: string | undefined): string {
  return groupParam ? `${basePath}?group=${encodeURIComponent(groupParam)}&` : `${basePath}?`;
}

function hrefFor(linkBase: string, weekNumber: number, uid: string): string {
  return `${linkBase}week=${weekNumber}&person=${encodeURIComponent(uid)}`;
}

/** The answer's words as paragraphs: one per line written, blank lines dropped. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function WrittenReview({ model, basePath, groupParam, groups, back }: Props) {
  const linkBase = linkBaseOf(basePath, groupParam);
  const selected = model.selected;
  const person = selected?.person ?? null;
  const ordered = [...model.toGive, ...model.feedbackSent];
  const at = person ? ordered.findIndex((candidate) => candidate.uid === person.uid) : -1;
  const previous = at > 0 ? ordered[at - 1] : null;
  const next = at >= 0 && at < ordered.length - 1 ? ordered[at + 1] : null;
  const waitingAt = person ? model.toGive.findIndex((candidate) => candidate.uid === person.uid) : -1;

  const title = person && model.answer ? reviewTitleWords(person.name, model.answer.answerName) : WRITTEN_ANSWERS;

  const nav = (
    <div className={styles.navButtons}>
      {previous ? (
        <Link href={hrefFor(linkBase, model.weekNumber, previous.uid)} className={styles.navButton}>
          <Chevron left />
          {PREVIOUS}
        </Link>
      ) : (
        <button type="button" className={styles.navButton} disabled>
          <Chevron left />
          {PREVIOUS}
        </button>
      )}
      {next && (
        <Link href={hrefFor(linkBase, model.weekNumber, next.uid)} className={styles.navButton}>
          {nextWords(next.firstName)}
          <Chevron />
        </Link>
      )}
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={`${weekly.bar} ${styles.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={back.href} className={weekly.back}>
            <Chevron left />
            <span>{back.label}</span>
          </Link>
        </div>
        <div className={weekly.barTitle}>{WRITTEN_ANSWERS}</div>
        <div className={weekly.barEnd} />
      </div>

      {person && (
        <div className={styles.phonePosition}>
          {previous ? (
            <Link href={hrefFor(linkBase, model.weekNumber, previous.uid)} className={styles.roundButton} aria-label={PREVIOUS}>
              <Chevron left />
            </Link>
          ) : (
            <button type="button" className={styles.roundButton} disabled aria-label={PREVIOUS}>
              <Chevron left />
            </button>
          )}
          <p className={styles.positionText}>
            {waitingAt >= 0 ? positionWords(waitingAt + 1, model.toGive.length) : WITH_FEEDBACK}
          </p>
          {next ? (
            <Link href={hrefFor(linkBase, model.weekNumber, next.uid)} className={styles.roundButton} aria-label={nextWords(next.firstName)}>
              <Chevron />
            </Link>
          ) : (
            <button type="button" className={styles.roundButton} disabled aria-label="Next">
              <Chevron />
            </button>
          )}
        </div>
      )}

      <header className={styles.head}>
        <div className={styles.headMain}>
          <Link href={back.href} className={styles.crumb}>
            <Chevron left />
            {back.label}
          </Link>
          <p className={styles.eyebrow}>{reviewEyebrowWords(model.group.name, model.weekNumber)}</p>
          <h1 className={styles.title}>{title}</h1>
          {groups && groups.length > 1 && <GroupLinks groups={groups} current={model.group.id} />}
        </div>
        {person && <div className={styles.headNav}>{nav}</div>}
      </header>

      <div className={styles.columns}>
        <AnswerList model={model} linkBase={linkBase} />
        <div className={styles.middle}>
          {!model.answer ? (
            <p className={styles.quiet}>{NO_WRITTEN_ANSWER_THIS_WEEK}</p>
          ) : !selected || !person ? (
            <>
              <Question model={model} />
              <p className={styles.quiet}>{ordered.length === 0 && model.notSent.length === 0 ? NOBODY_HERE : NOBODY_SENT_YET}</p>
            </>
          ) : (
            <Review key={`${person.uid} ${model.weekNumber}`} model={model} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The lead's choice of group (A10): the Attendance tab's own control, a round
 * pill a group with its tag and its name for a screen reader, each a link to
 * that group's page here, which opens on the group's own week. The group
 * shown is marked.
 */
function GroupLinks({ groups, current }: { groups: ReviewGroupLink[]; current: string }) {
  const labelId = useId();
  return (
    <nav className={styles.groupLinks} aria-labelledby={labelId}>
      <span id={labelId} className={styles.groupLinksLabel}>
        {GROUP}
      </span>
      {groups.map((group) => {
        const here = group.id === current;
        return (
          <Link
            key={group.id}
            href={group.href}
            className={here ? `${styles.groupLink} ${styles.groupLinkCurrent}` : styles.groupLink}
            aria-label={group.name}
            aria-current={here ? "page" : undefined}
          >
            {group.tag}
          </Link>
        );
      })}
    </nav>
  );
}

function Chevron({ left = false }: { left?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={left ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

function AnswerList({ model, linkBase }: { model: ReviewPageModel; linkBase: string }) {
  const current = model.selected?.person.uid ?? null;
  const group = (label: string, people: ReviewPerson[], line: (person: ReviewPerson) => string, link: boolean) => (
    <div className={styles.listGroup}>
      <p className={styles.listHead}>
        <span>{label}</span>
        <span>{people.length}</span>
      </p>
      <ul className={styles.listRows} role="list">
        {people.map((person) => {
          const inner = (
            <>
              <InitialsChip name={person.name} uid={person.uid} size="md" />
              <span className={styles.listText}>
                <span className={styles.listName}>{person.name}</span>
                <span className={styles.listMeta}>
                  {line(person)}
                  {person.late && <span className={styles.lateChip}>{LATE}</span>}
                </span>
              </span>
            </>
          );
          return (
            <li key={person.uid}>
              {link ? (
                <Link
                  href={hrefFor(linkBase, model.weekNumber, person.uid)}
                  className={person.uid === current ? styles.listRowCurrent : styles.listRow}
                  aria-current={person.uid === current ? "page" : undefined}
                >
                  {inner}
                </Link>
              ) : (
                <div className={styles.listRowPlain}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
  const viewer = model.viewer.uid;
  return (
    <section className={styles.list} aria-label={WRITTEN_ANSWERS}>
      <p className={styles.listTitle}>
        <span>{WRITTEN_ANSWERS}</span>
        <span className={styles.listWeek}>Week {model.weekNumber}</span>
      </p>
      {group(
        TO_GIVE_FEEDBACK_ON,
        model.toGive,
        (person) =>
          person.firstSentAt
            ? listSentWords(new Date(person.firstSentAt))
            : person.week.state === "locked" && person.week.at
              ? listLockedWords(new Date(person.week.at))
              : "",
        true,
      )}
      {group(
        WITH_FEEDBACK,
        model.feedbackSent,
        (person) => byWords(person.feedbackByUids.map((uid, index) => (uid === viewer ? "you" : person.feedbackByNames[index] ?? ""))),
        true,
      )}
      {group(NOT_SENT_YET, model.notSent, notSubmittedLine, false)}
    </section>
  );
}

/** Where an answer not to be read yet stands: started, or not, never what it says or how long it is. */
function notSubmittedLine(person: ReviewPerson): string {
  if (person.week.state === "reopened") return REOPENED_NOT_SUBMITTED;
  const started = person.state !== "not-started";
  if (!started && person.week.joinedLate) return BEFORE_THEY_JOINED;
  return started ? STARTED : NOT_STARTED;
}

// ---------------------------------------------------------------------------
// The question
// ---------------------------------------------------------------------------

function Question({ model }: { model: ReviewPageModel }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!model.answer) return null;
  return (
    <section className={styles.question} aria-labelledby={`${id}-q`}>
      <p id={`${id}-q`} className={styles.mono}>
        {theQuestionWords(model.answer.words)}
      </p>
      <div id={`${id}-body`} className={open ? styles.questionBody : styles.questionClamp}>
        <Prose prose={model.answer.prompt} className={styles.questionProse} />
      </div>
      {!open && (
        <button type="button" className={styles.textButton} aria-expanded={false} aria-controls={`${id}-body`} onClick={() => setOpen(true)}>
          {SHOW_ALL_OF_IT}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// One answer, and the feedback on it
// ---------------------------------------------------------------------------

function Review({ model }: { model: ReviewPageModel }) {
  const selected = model.selected!;
  const person = selected.person;
  const answer = model.answer!;
  const weekShut = person.week.state === "submitted" || person.week.state === "locked";

  return (
    <div className={styles.reviewGrid}>
      <div className={styles.answerColumn}>
        <Question model={model} />
        <div className={styles.answerHead}>
          <h2 className={styles.answerTitle}>{answerHeadWords(person.firstName)}</h2>
          <p className={styles.answerCount}>{wordCountWords(person.words, answer.words)}</p>
        </div>
        {(person.firstSentAt || selected.pangram) && (
          <p className={styles.sentLine}>
            {person.firstSentAt && <span>{listSentWords(new Date(person.firstSentAt))}</span>}
            {person.late && <span className={styles.lateChip}>{LATE}</span>}
            {selected.pangram && (
              <span className={selected.pangram.worthALook && !selected.pangram.outOfDate ? styles.pangramChipFlag : styles.pangramChip}>
                {pangramChipWords(selected.pangram)}
              </span>
            )}
          </p>
        )}
        <div className={styles.answerBody}>
          {selected.boxes && answer.boxes.length > 0
            ? answer.boxes.map((box) => (
                <div key={box.id} className={styles.answerBox}>
                  <p className={styles.answerBoxLabel}>{box.label}</p>
                  {paragraphs(selected.boxes?.[box.id] ?? "").map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              ))
            : paragraphs(selected.text).map((line, index) => <p key={index}>{line}</p>)}
        </div>
        <div className={styles.openedRow}>
          <p className={styles.openedLine}>{reviewWeekLineWords(person.week, person.firstName)}</p>
          {weekShut && selected.role.mayReview && (
            <ReopenWeekButton runId={model.runId} weekNumber={model.weekNumber} uid={person.uid} firstName={person.firstName} quiet />
          )}
        </div>
      </div>

      <div className={styles.sideColumn}>
        <FeedbackWriter
          runId={model.runId}
          uid={person.uid}
          firstName={person.firstName}
          weekNumber={model.weekNumber}
          on={{ kind: "writtenAnswer", itemId: answer.id }}
          own={selected.own}
          viewerName={model.viewer.firstName}
          title={YOUR_FEEDBACK}
          hint={FEEDBACK_HINT}
          mayWrite={selected.role.mayReview}
        />
        <StaffFeedbackCards
          cards={selected.cards}
          runId={model.runId}
          firstName={person.firstName}
          weekNumber={model.weekNumber}
          programme={model.programme}
        />
        {selected.reportLines && <SessionReportLines view={selected.reportLines} firstName={person.firstName} />}
        {selected.team && (
          <RatingForTheTeam runId={model.runId} uid={person.uid} firstName={person.firstName} weekNumber={model.weekNumber} team={selected.team} />
        )}
      </div>
    </div>
  );
}
