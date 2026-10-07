"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import MemberText from "@/components/ui/MemberText";
import kit from "@/features/applications/kit/kit.module.css";
import { own } from "@/lib/applications/keys";
import type {
  AnswerBody as AnswerBodyView,
  AnswerView,
  AvailabilityView,
  CommentView,
  EarlierAvailability,
  ReviewPayload,
  ReviewSection,
} from "@/lib/applications/review/types";
import { WHAT_IT_SAID_BEFORE } from "./changesWords";
import { Avatar, Chip, Icon } from "./parts";
import parts from "./parts.module.css";
import styles from "./ReviewScreen.module.css";

/**
 * What the applicant sent, as a reviewer reads it: About you, each question
 * set with its answers, and when they are free.
 *
 * Everything an applicant typed is rendered as a text node through
 * `MemberText` and nothing else: no markdown, no links made out of what they
 * wrote. Scores and comments are handed up to the screen that owns the
 * review; nothing here talks to the server.
 *
 * Where somebody sent again with something different, the part that changed
 * carries what it said before, closed until it is asked for (`Earlier`). The
 * answer as it stands is what is being reviewed. What they wrote before is
 * drawn by the same components as what they wrote last, so it is a text node
 * too.
 */

/** What the 1 to 5 buttons are called. Only the ends and the middle carry a word. */
const SCORE_WORDS: Record<number, string> = { 1: "Weak", 3: "Good", 5: "Excellent" };
const SCORES = [1, 2, 3, 4, 5];

/**
 * The id of a card on the page, so the line that says what changed can take
 * somebody to it. `part` is "about", a question set's id, or "availability".
 */
export function cardId(part: string): string {
  return `review-card-${part}`;
}

export type AnswerActions = {
  /** Null while the page is not live yet: nothing can be saved. */
  ready: boolean;
  /** The caller's scores, with anything not yet saved laid over the top. */
  scores: Readonly<Record<string, number>>;
  /** The answer the number keys score. */
  activeKey: string | null;
  comments: readonly CommentView[];
  /** Comments added on this visit, which read "just now". */
  fresh: ReadonlySet<string>;
  onScore: (key: string, score: number) => void;
  onFocusAnswer: (key: string) => void;
  onAddComment: (key: string, text: string) => Promise<boolean>;
  onRemoveComment: (id: string) => void;
};

export function ScoreRow({
  answerKey,
  actions,
}: {
  answerKey: string;
  actions: AnswerActions;
}) {
  const current = own(actions.scores, answerKey) ?? null;
  return (
    <div
      className={`${styles.scoreCard} ${actions.activeKey === answerKey ? styles.scoreCardActive : ""}`}
    >
      <div className={styles.scoreGroup} role="group" aria-label="Your score for this answer">
        <div className={styles.scoreTitle}>Your score for this answer</div>
        <div className={styles.scoreButtons}>
          {SCORES.map((score) => (
            <button
              key={score}
              type="button"
              className={styles.scoreButton}
              aria-pressed={current === score}
              aria-label={SCORE_WORDS[score] ? `Score ${score}, ${SCORE_WORDS[score]}` : `Score ${score}`}
              disabled={!actions.ready}
              onFocus={() => actions.onFocusAnswer(answerKey)}
              onClick={() => actions.onScore(answerKey, score)}
            >
              {score}
            </button>
          ))}
        </div>
        <div className={styles.scoreWords} aria-hidden="true">
          {SCORES.map((score) => (
            <span key={score}>{SCORE_WORDS[score] ?? ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CommentList({
  comments,
  actions,
}: {
  comments: readonly CommentView[];
  actions: AnswerActions;
}) {
  if (comments.length === 0) return null;
  return (
    <ul className={styles.comments}>
      {comments.map((comment) => (
        <li key={comment.id} className={styles.comment}>
          <Avatar name={comment.authorName} uid={comment.authorName} size="sm" />
          <div className={styles.commentBody}>
            <div className={styles.commentHead}>
              <strong>{comment.authorName}</strong>
              <span className={styles.commentWhen}>
                {actions.fresh.has(comment.id) ? "just now" : (comment.when ?? "")}
              </span>
              <Chip>Internal</Chip>
              {comment.mine ? (
                <button
                  type="button"
                  className={styles.commentRemove}
                  disabled={!actions.ready}
                  onClick={() => actions.onRemoveComment(comment.id)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <MemberText text={comment.text} className={styles.commentText} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CommentComposer({
  answerKey,
  question,
  hasComments,
  actions,
}: {
  answerKey: string;
  question: string;
  hasComments: boolean;
  actions: AnswerActions;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // The box opens because somebody asked to write in it.
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <div>
        <button
          type="button"
          className={`${parts.textAction} ${styles.commentAction}`}
          aria-label={`Comment on: ${question}`}
          disabled={!actions.ready}
          onClick={() => setOpen(true)}
        >
          {hasComments ? "Add a comment" : "Comment"}
        </button>
      </div>
    );
  }
  return (
    <form
      className={styles.composer}
      onSubmit={async (event) => {
        event.preventDefault();
        const text = box.current?.value.trim() ?? "";
        if (!text || busy) return;
        setBusy(true);
        const saved = await actions.onAddComment(answerKey, text);
        setBusy(false);
        if (saved) setOpen(false);
      }}
    >
      <label className={styles.srOnly} htmlFor={`comment-${answerKey}`}>
        Comment on: {question}
      </label>
      <textarea
        id={`comment-${answerKey}`}
        ref={box}
        className={styles.textarea}
        rows={2}
        maxLength={1000}
        placeholder="Only reviewers see this."
      />
      <div className={styles.composerActions}>
        <button type="submit" className={parts.quiet} disabled={busy}>
          Save comment
        </button>
        <button type="button" className={parts.textAction} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** A comment action and the comments already on one answer. */
export function AnswerComments({
  answerKey,
  question,
  quietLabel,
  actions,
}: {
  answerKey: string;
  question: string;
  /** True where the action reads "Comment" until a comment exists. */
  quietLabel: boolean;
  actions: AnswerActions;
}) {
  const mine = actions.comments.filter((comment) => comment.key === answerKey);
  return (
    <div className={styles.commentBlock}>
      <CommentList comments={mine} actions={actions} />
      <CommentComposer
        answerKey={answerKey}
        question={question}
        hasComments={mine.length > 0 || !quietLabel}
        actions={actions}
      />
    </div>
  );
}

/**
 * What a part of the application said in the versions sent before, behind a
 * quiet control. A native disclosure, so it opens before the page is live and
 * needs no state of its own. Renders nothing when there is nothing earlier.
 */
export function Earlier({
  count,
  label = WHAT_IT_SAID_BEFORE,
  children,
}: {
  /** How many earlier entries there are. */
  count: number;
  label?: string;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details className={styles.earlier}>
      <summary className={styles.earlierToggle}>
        <span>{label}</span>
        <span className={styles.earlierChevron}>
          <Icon name="chevron-down" size={16} />
        </span>
      </summary>
      <ol className={styles.earlierList}>{children}</ol>
    </details>
  );
}

/** One earlier version of a part: the day it was sent, then what it said. */
export function EarlierEntry({ sentOn, children }: { sentOn: string | null; children: ReactNode }) {
  return (
    <li className={styles.earlierEntry}>
      <div className={`${kit.mono} ${styles.earlierWhen}`}>
        {sentOn ? `Sent ${sentOn}` : "An earlier version"}
      </div>
      {children}
    </li>
  );
}

function AnswerBody({ answer }: { answer: AnswerBodyView }) {
  if (!answer.answered) return <p className={styles.noAnswer}>No answer.</p>;
  if (answer.items) {
    return (
      <ul className={styles.picked}>
        {answer.items.map((item) => (
          <li key={item}>
            <Chip>{item}</Chip>
          </li>
        ))}
      </ul>
    );
  }
  if (answer.scale) {
    const { options, index } = answer.scale;
    return (
      <>
        <MemberText text={options[index] ?? ""} className={styles.answer} />
        <p className={styles.scaleNote}>
          Point {index + 1} of {options.length}: {options.join(" · ")}
        </p>
      </>
    );
  }
  return <MemberText text={answer.text ?? ""} className={styles.answer} />;
}

function Answer({ answer, actions }: { answer: AnswerView; actions: AnswerActions }) {
  return (
    <div className={styles.answerBlock}>
      <h3 className={styles.question}>
        {answer.question}
        {answer.optional ? <span className={styles.optional}> (optional)</span> : null}
      </h3>
      <AnswerBody answer={answer} />
      {answer.changedSinceScored ? (
        <p className={styles.changedNote}>{answer.changedSinceScored}</p>
      ) : null}
      <Earlier count={answer.earlier.length}>
        {answer.earlier.map((entry, at) => (
          <EarlierEntry key={at} sentOn={entry.sentOn}>
            {entry.asked ? (
              <AnswerBody answer={entry} />
            ) : (
              <p className={styles.noAnswer}>They weren’t asked this then.</p>
            )}
          </EarlierEntry>
        ))}
      </Earlier>
      {answer.scorable ? <ScoreRow answerKey={answer.key} actions={actions} /> : null}
      <AnswerComments
        answerKey={answer.key}
        question={answer.question}
        quietLabel={!answer.scorable}
        actions={actions}
      />
    </div>
  );
}

function CardHead({
  title,
  shortTitle,
  chips,
  aside,
}: {
  title: string;
  /** What a phone calls the section, where its tab has already said the rest. */
  shortTitle?: string;
  chips?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={styles.cardHead}>
      <div className={styles.cardTitles}>
        <h2 className={styles.cardTitle}>
          {shortTitle && shortTitle !== title ? (
            <>
              <span className={styles.wideOnly}>{title}</span>
              <span className={styles.narrowOnly}>{shortTitle}</span>
            </>
          ) : (
            title
          )}
        </h2>
        {chips}
      </div>
      {aside}
    </div>
  );
}

export function AboutCard({
  applicant,
  shown,
  actions,
}: {
  applicant: ReviewPayload["applicant"];
  /** Whether this is the section a phone is showing. */
  shown: boolean;
  actions: AnswerActions;
}) {
  const { about } = applicant;
  const earlierFacts = about.earlierFacts.flatMap((fact) =>
    fact.earlier.map((entry) => ({ label: fact.label, ...entry })),
  );
  const changed = earlierFacts.length > 0 || about.earlierMotivation.length > 0;
  return (
    <section
      id={cardId("about")}
      className={styles.card}
      data-shown={shown}
      aria-label="About you"
    >
      <CardHead
        title="About you"
        chips={
          <>
            <Chip>Same as joining</Chip>
            {changed ? <Chip>Changed</Chip> : null}
          </>
        }
      />
      <dl className={styles.facts}>
        {about.status ? (
          <div>
            <dt>At UoN</dt>
            <dd>{about.status}</dd>
          </div>
        ) : null}
        <div>
          <dt>{about.subjectLabel}</dt>
          <dd>{about.subject || "Not given"}</dd>
        </div>
        {about.graduating ? (
          <div>
            <dt>Graduating</dt>
            <dd>{about.graduating}</dd>
          </div>
        ) : null}
        {about.interests ? (
          <div>
            <dt>Interests</dt>
            <dd>{about.interests}</dd>
          </div>
        ) : null}
        {applicant.email !== undefined ? (
          <div>
            <dt>Account email</dt>
            <dd>{applicant.email ?? "Not given"}</dd>
          </div>
        ) : null}
        {applicant.universityEmail !== undefined ? (
          <div>
            <dt>University email</dt>
            <dd>{applicant.universityEmail ?? "Not given"}</dd>
          </div>
        ) : null}
      </dl>
      <Earlier count={earlierFacts.length}>
        {earlierFacts.map((entry, at) => (
          <EarlierEntry key={at} sentOn={entry.sentOn}>
            <div className={styles.earlierFact}>
              <span className={styles.earlierFactLabel}>{entry.label}</span>
              {entry.value ? <MemberText text={entry.value} /> : <span>Not given</span>}
            </div>
          </EarlierEntry>
        ))}
      </Earlier>
      <hr className={styles.rule} />
      <div className={styles.answerBlock}>
        <h3 className={styles.question}>Why are you interested in AI safety?</h3>
        {about.motivation ? (
          <MemberText text={about.motivation} className={styles.answer} />
        ) : (
          <p className={styles.noAnswer}>No answer.</p>
        )}
        <Earlier count={about.earlierMotivation.length}>
          {about.earlierMotivation.map((entry, at) => (
            <EarlierEntry key={at} sentOn={entry.sentOn}>
              {entry.text ? (
                <MemberText text={entry.text} className={styles.answer} />
              ) : (
                <p className={styles.noAnswer}>No answer.</p>
              )}
            </EarlierEntry>
          ))}
        </Earlier>
        <AnswerComments
          answerKey={about.motivationKey}
          question="Why are you interested in AI safety?"
          quietLabel
          actions={actions}
        />
      </div>
    </section>
  );
}

export function SectionCard({
  section,
  shown,
  actions,
}: {
  section: ReviewSection;
  shown: boolean;
  actions: AnswerActions;
}) {
  const collapsible = section.mode === "collapsed";
  const [open, setOpen] = useState(!collapsible);
  const count = section.answers.length;
  return (
    <section
      id={cardId(section.id)}
      className={`${styles.card} ${section.mode === "focus" ? styles.cardFocus : ""} ${
        collapsible && !open ? styles.cardClosed : ""
      }`}
      data-shown={shown}
      aria-label={section.title}
    >
      <CardHead
        title={section.title}
        shortTitle={section.tab}
        chips={section.chips.map((chip) => (
          <Chip key={chip.text} tone={chip.tone}>
            {chip.text}
          </Chip>
        ))}
        aside={
          collapsible ? (
            <div className={styles.cardAside}>
              {section.note ? <span className={styles.asideNote}>{section.note}</span> : null}
              <button
                type="button"
                className={styles.disclose}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? "Hide" : "Show"} {count} {count === 1 ? "answer" : "answers"}
                <span className={open ? styles.chevronOpen : undefined}>
                  <Icon name="chevron-down" size={16} />
                </span>
              </button>
            </div>
          ) : null
        }
      />
      <div className={styles.cardBody} data-open={open}>
        {section.answers.map((answer, at) => (
          <div key={answer.key}>
            {at > 0 ? <hr className={styles.rule} /> : null}
            <Answer answer={answer} actions={actions} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function AvailabilityCard({
  availability,
  earlier,
  shown,
}: {
  availability: AvailabilityView;
  /** When they were free in the versions sent before, newest first. */
  earlier: readonly EarlierAvailability[];
  shown: boolean;
}) {
  return (
    <section
      id={cardId("availability")}
      className={styles.card}
      data-shown={shown}
      aria-label="When they’re free"
    >
      <CardHead
        title="When they’re free"
        chips={earlier.length > 0 ? <Chip>Changed</Chip> : null}
      />
      {availability.empty ? (
        <p className={styles.noAnswer}>They haven’t said when they’re free.</p>
      ) : (
        <>
          {/* The picture is for the eye. The same times are written out below it. */}
          <div className={styles.week} aria-hidden="true">
            <div />
            <div className={styles.axis}>
              {availability.axis.map((tick) => (
                <span
                  key={tick.label}
                  className={styles.tick}
                  data-edge={tick.at === 0 ? "start" : tick.at === 100 ? "end" : undefined}
                  style={{ left: `${tick.at}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
            {availability.days.map((day) => (
              <Fragment key={day.label}>
                <div className={styles.dayLabel}>{day.label}</div>
                <div
                  className={styles.dayTrack}
                  style={{ "--hour": `${availability.hourWidth}%` } as CSSProperties}
                >
                  {day.blocks.map((block) => (
                    <span
                      key={block.left}
                      className={styles.block}
                      style={{ left: `${block.left}%`, width: `${block.width}%` }}
                    />
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
          <div className={styles.legend} aria-hidden="true">
            <span className={styles.legendSwatch} />
            Free
          </div>
          <hr className={styles.rule} />
          <div className={styles.times}>
            {availability.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
            {availability.total ? <div className={styles.timesTotal}>{availability.total}</div> : null}
          </div>
        </>
      )}
      <Earlier count={earlier.length}>
        {earlier.map((entry, at) => (
          <EarlierEntry key={at} sentOn={entry.sentOn}>
            {entry.empty ? (
              <p className={styles.noAnswer}>They hadn’t said when they were free.</p>
            ) : (
              <div className={`${styles.times} ${styles.earlierTimes}`}>
                {entry.lines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
                {entry.total ? <div className={styles.timesTotal}>{entry.total}</div> : null}
              </div>
            )}
          </EarlierEntry>
        ))}
      </Earlier>
    </section>
  );
}
