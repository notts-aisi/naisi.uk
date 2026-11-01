"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import InitialsChip from "@/components/ui/InitialsChip";
import { useHydrated } from "@/hooks/useHydrated";
import type { WrittenReviewResult } from "@/app/api/courses/runs/[runId]/written-answers/[answerId]/review/route";
import { SOCIETY_ADDRESS } from "@/lib/courses/leavingWords";
import { countWords } from "@/lib/courses/writtenAnswers/model";
import type { ReviewPageModel, ReviewPerson } from "@/lib/courses/writtenAnswers/reviewPage";
import {
  A_SHORT_COMMENT,
  COMMENT_HINT,
  FEEDBACK_NOT_SENT,
  FEEDBACK_SENT,
  GROUP,
  LATE,
  NOBODY_HERE,
  NOBODY_SENT_YET,
  NOT_SENT_YET,
  NO_RUBRIC_LINE,
  NO_WRITTEN_ANSWER_THIS_WEEK,
  PREVIOUS,
  READ_YOUR_FEEDBACK,
  SHOW_ALL_OF_IT,
  THE_RUBRIC,
  TO_GIVE_FEEDBACK_ON,
  WRITTEN_ANSWERS,
  answerHeadWords,
  byWords,
  commentCountWords,
  emailTheyGetWords,
  emailsLineWords,
  feedbackEmailLead,
  feedbackEmailSubject,
  feedbackSentLineWords,
  feedbackSentResultWords,
  listLockedWords,
  listSentWords,
  nextWords,
  positionWords,
  reviewEyebrowWords,
  reviewTitleWords,
  seesLevelsWords,
  reviewWeekLineWords,
  sendFeedbackWords,
  theQuestionWords,
  wordCountWords,
} from "@/lib/courses/writtenAnswerWords";
import {
  BEFORE_THEY_JOINED,
  NOT_STARTED,
  REOPENED_NOT_SUBMITTED,
  STARTED,
} from "@/lib/courses/weekWork/words";
import Prose from "../weekBlocks/Prose";
import ReopenWeekButton from "./ReopenWeekButton";
import weekly from "../weekly/weekly.module.css";
import styles from "./written.module.css";

/**
 * THE REVIEW PAGE (boards wk-review at 1440, wk-review-phone at 390): one
 * answer at a time with Previous and Next, the group's written answers for
 * the week as the board groups them ("To give feedback on", "Feedback sent",
 * "Not submitted yet"), the question with its range, the answer with its
 * count, when its week was submitted or locked and "Reopen week 3 for
 * Amara", the rubric (a level for each row, the level's descriptor under
 * it), "A short comment" with its count, Send feedback, and the email the
 * person gets. "Late" beside an answer is shown here, to staff, and nowhere
 * its writer reads.
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

type Local = {
  feedback: { levels: Array<{ row: string; level: string; descriptor: string }>; comment: string; sentAt: string | null; byName: string } | null;
};

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

async function post(model: ReviewPageModel, uid: string, body: Record<string, unknown>): Promise<WrittenReviewResult> {
  if (!model.answer) throw new Error(NO_WRITTEN_ANSWER_THIS_WEEK);
  const res = await fetch(
    `/api/courses/runs/${encodeURIComponent(model.runId)}/written-answers/${encodeURIComponent(model.answer.id)}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId: model.weekId, uid, ...body }),
    },
  );
  const out = (await res.json().catch(() => null)) as (WrittenReviewResult & { error?: string }) | null;
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? FEEDBACK_NOT_SENT);
  return out;
}

export default function WrittenReview({ model, basePath, groupParam, groups, back }: Props) {
  const router = useRouter();
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
            {waitingAt >= 0 ? positionWords(waitingAt + 1, model.toGive.length) : FEEDBACK_SENT}
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
            <Review key={`${person.uid} ${model.weekNumber}`} model={model} onDone={() => router.refresh()} />
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
      {group(FEEDBACK_SENT, model.feedbackSent, (person) => byWords(person.feedbackByUid === viewer ? "you" : (person.feedbackByName ?? "")), true)}
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
// One answer, its rubric and the comment
// ---------------------------------------------------------------------------

function Review({ model, onDone }: { model: ReviewPageModel; onDone: () => void }) {
  const selected = model.selected!;
  const person = selected.person;
  const answer = model.answer!;
  const rubric = model.rubric;
  const viewer = model.viewer;
  const [local, setLocal] = useState<Local>({
    feedback: selected.feedback ? { ...selected.feedback, byName: person.feedbackByUid === viewer.uid ? "you" : (person.feedbackByName ?? "") } : null,
  });
  const [levels, setLevels] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const commentId = useId();
  // The page is drawn on the server: nothing here takes a press or a word
  // until React has it, so nothing typed before then is lost.
  const hydrated = useHydrated();

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await post(model, person.uid, {
        action: "feedback",
        levels: rubric ? rubric.rows.map((row) => ({ row: row.name, level: levels[row.name] ?? "" })) : [],
        comment,
      });
      if (out.state.feedback) setLocal({ feedback: { ...out.state.feedback, byName: "you" } });
      setResult(feedbackSentResultWords(person.firstName, out.emailed === true));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : FEEDBACK_NOT_SENT);
    } finally {
      setBusy(false);
    }
  };

  const weekShut = person.week.state === "submitted" || person.week.state === "locked";
  const allChosen = !rubric || rubric.rows.every((row) => Boolean(levels[row.name]));
  const commentWords = countWords(comment);
  const canSend = hydrated && !local.feedback && selected.role.mayReview && allChosen && (rubric ? true : commentWords > 0) && !busy;

  return (
    <div className={styles.reviewGrid}>
      <div className={styles.answerColumn}>
        <Question model={model} />
        <div className={styles.answerHead}>
          <h2 className={styles.answerTitle}>{answerHeadWords(person.firstName)}</h2>
          <p className={styles.answerCount}>{wordCountWords(person.words, answer.words)}</p>
        </div>
        {person.firstSentAt && (
          <p className={styles.sentLine}>
            {listSentWords(new Date(person.firstSentAt))}
            {person.late && <span className={styles.lateChip}>{LATE}</span>}
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
        <section className={styles.rubricCard} aria-labelledby={`${commentId}-rubric`}>
          <h2 id={`${commentId}-rubric`} className={styles.cardTitle}>
            {THE_RUBRIC}
          </h2>
          {!rubric && <p className={styles.quiet}>{NO_RUBRIC_LINE}</p>}
          {rubric?.rows.map((row) => {
            const given = local.feedback?.levels.find((entry) => entry.row === row.name) ?? null;
            const chosen = given?.level ?? levels[row.name] ?? null;
            const index = chosen ? rubric.levels.indexOf(chosen) : -1;
            const descriptor = given?.descriptor ?? (index >= 0 ? row.descriptors[index] : null);
            return (
              <div key={row.name} className={styles.rubricRow} role="group" aria-label={row.name}>
                <p className={styles.rubricName}>{row.name}</p>
                <div className={styles.levels}>
                  {rubric.levels.map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={chosen === level ? styles.levelOn : styles.level}
                      aria-pressed={chosen === level}
                      disabled={!hydrated || Boolean(local.feedback) || !selected.role.mayReview}
                      onClick={() => setLevels((prev) => ({ ...prev, [row.name]: level }))}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                {chosen && descriptor && (
                  <p className={styles.descriptor}>
                    <strong>{chosen}:</strong> {descriptor}
                  </p>
                )}
              </div>
            );
          })}

          {local.feedback ? (
            <>
              {local.feedback.comment && (
                <div className={styles.sentComment}>
                  <p className={styles.commentLabel}>{A_SHORT_COMMENT}</p>
                  <p className={styles.commentText}>{local.feedback.comment}</p>
                </div>
              )}
              <p className={styles.quiet}>
                {feedbackSentLineWords(local.feedback.byName, local.feedback.sentAt ? new Date(local.feedback.sentAt) : null)}
              </p>
            </>
          ) : (
            <>
              <div className={styles.commentField}>
                <label htmlFor={commentId} className={styles.commentLabel}>
                  {A_SHORT_COMMENT}
                </label>
                <textarea
                  id={commentId}
                  className={styles.comment}
                  rows={5}
                  value={comment}
                  onChange={(event) => setComment(event.currentTarget.value)}
                  disabled={!hydrated || !selected.role.mayReview}
                />
                <div className={styles.commentFoot}>
                  <span>{COMMENT_HINT}</span>
                  <span className={styles.commentCount}>{commentCountWords(commentWords)}</span>
                </div>
              </div>
              <button type="button" className={styles.sendButton} onClick={() => void send()} disabled={!canSend}>
                {sendFeedbackWords(person.firstName)}
              </button>
              <p className={styles.sendLine}>{emailsLineWords(person.firstName)}</p>
              <p className={styles.quiet}>{seesLevelsWords(person.firstName, rubric?.rows.length ?? 0)}</p>
            </>
          )}
          {result && (
            <p className={styles.result} role="status">
              {result}
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </section>

        <section className={styles.emailPreview} aria-label={emailTheyGetWords(person.firstName)}>
          <p className={styles.mono}>{emailTheyGetWords(person.firstName)}</p>
          <div className={styles.emailCard}>
            <div className={styles.emailHead}>
              <p className={styles.emailSubject}>{feedbackEmailSubject(model.weekNumber)}</p>
              <dl className={styles.emailMeta}>
                <dt>From</dt>
                <dd>NAISI</dd>
                <dt>Reply to</dt>
                <dd>{SOCIETY_ADDRESS}</dd>
                <dt>To</dt>
                <dd>{person.name}</dd>
              </dl>
            </div>
            <div className={styles.emailBody}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/naisi-lockup-email.png" alt="Nottingham AI Safety Initiative" className={styles.emailLogo} />
              <p>{feedbackEmailLead(viewer.firstName || "Your facilitator", answer.answerName)}</p>
              <span className={styles.emailButton}>{READ_YOUR_FEEDBACK}</span>
            </div>
            <p className={styles.emailFoot}>Nottingham AI Safety Initiative · University of Nottingham · {SOCIETY_ADDRESS}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
