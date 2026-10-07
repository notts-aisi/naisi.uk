"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import MemberText from "@/components/ui/MemberText";
import Select from "@/components/ui/Select";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import type { PoolReason, ProgrammeDecisionKind } from "@/lib/applications/model";
import type { ReviewPayload } from "@/lib/applications/review/types";
import { own } from "@/lib/applications/keys";
import { formatScore, reviewerScore } from "@/lib/applications/scoring";
import { POOL_REASON_LABEL, choiceLabel, ordinal } from "@/lib/applications/words";
import { AboutCard, AvailabilityCard, SectionCard, type AnswerActions } from "./ReviewSections";
import { Avatar, Chip, Icon, Key, ScoreBox, StandingChip } from "./parts";
import parts from "./parts.module.css";
import styles from "./ReviewScreen.module.css";

/**
 * One application, for the person reviewing it.
 *
 * The screen holds the payload the server built for this caller and replaces
 * it whole with what each save answers, so what is on screen is always what
 * the server last said this person may see. That matters on a first review:
 * other people's scores arrive with the answer to the save that finishes it,
 * and not before.
 *
 * A score and a decision are sent the moment they are chosen and are shown at
 * once; if the save is refused the choice is taken back and the reason is
 * said. Saves go out one at a time, in the order they were made.
 *
 * Keys: 1 to 5 score the answer in focus, A accepts, P pools, J and K move to
 * the next and previous application. They are ignored while somebody is
 * typing in a box.
 */

/**
 * What this screen is sent, as it reads it.
 *
 * `told` is true once decision day has told this person their result. From
 * then on the decision is a record, not a choice: it is drawn as it stands,
 * with no Accept, Pool, Decline or Revoke to press, because the route that
 * would take the press refuses it. A reply that does not carry the flag
 * leaves the screen exactly as it was, so the flag is optional here.
 */
type Review = ReviewPayload & { told?: boolean };

type Props = {
  initial: Review;
  /** The address of the programme's list, which this page hangs off. */
  listPath: string;
  /** `/api/admissions/forms/<round>`: where the saves go. */
  apiBase: string;
};

type Saved = { review?: Review; error?: string };

const DECIDED_WORD: Record<ProgrammeDecisionKind, string> = {
  accept: "Accepted",
  pool: "Pooled",
  decline: "Declined",
};

function firstUnscored(review: Review, scores: Readonly<Record<string, number>>): string | null {
  const keys = review.review.scorableKeys;
  return keys.find((key) => own(scores, key) === undefined) ?? keys[0] ?? null;
}

export default function ReviewScreen({ initial, listPath, apiBase }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [review, setReview] = useState<Review>(initial);
  /** Scores chosen and not yet answered by the server. Null is a score taken back. */
  const [pendingScores, setPendingScores] = useState<Record<string, number | null>>({});
  const [pendingDecision, setPendingDecision] = useState<ProgrammeDecisionKind | null>(null);
  const [working, setWorking] = useState(0);
  const [savedOnce, setSavedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(() =>
    firstUnscored(initial, initial.review.scores),
  );
  const [tab, setTab] = useState<string>(
    () => initial.sections.find((section) => section.mode === "focus")?.id ?? "about",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const latestScore = useRef<Record<string, number>>({});
  const overallBox = useRef<HTMLTextAreaElement>(null);
  const revokeBox = useRef<HTMLTextAreaElement>(null);

  const { applicant, programme, viewer, round, decision, queue } = review;
  const uid = encodeURIComponent(applicant.uid);
  /** This person has their result. Only ever true when the server says so. */
  const told = review.told === true;
  const canAct = viewer.canDecide && !round.decisionsSent && !told;
  const decisionDay = round.decisionDay ?? "decision day";

  // ---------------------------------------------------------------------
  // Talking to the server, one save at a time
  // ---------------------------------------------------------------------

  const send = useCallback(
    (method: string, path: string, body: unknown, then?: (next: Review) => void) => {
      setWorking((count) => count + 1);
      setError(null);
      const run = async (): Promise<boolean> => {
        try {
          const res = await fetch(`${apiBase}${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = (await res.json().catch(() => ({}))) as Saved;
          if (!res.ok || !data.review) {
            setError(data.error ?? "That did not save. Try again.");
            return false;
          }
          setReview(data.review);
          setSavedOnce(true);
          then?.(data.review);
          return true;
        } catch {
          setError("That did not save. Check your connection and try again.");
          return false;
        } finally {
          setWorking((count) => count - 1);
        }
      };
      const next = chain.current.then(run, run);
      chain.current = next;
      return next;
    },
    [apiBase],
  );

  // ---------------------------------------------------------------------
  // Scores
  // ---------------------------------------------------------------------

  const scores: Record<string, number> = { ...review.review.scores };
  for (const [key, value] of Object.entries(pendingScores)) {
    if (value === null) delete scores[key];
    else scores[key] = value;
  }
  const scorable = review.review.scorableKeys;
  const scoredCount = scorable.filter((key) => own(scores, key) !== undefined).length;
  const ownMean = reviewerScore({ scores }, scorable);

  const score = (key: string, value: number) => {
    if (!scorable.includes(key)) return;
    // Pressing the score that is already there takes it back.
    const next = own(scores, key) === value ? null : value;
    const ticket = (own(latestScore.current, key) ?? 0) + 1;
    latestScore.current[key] = ticket;
    setPendingScores((current) => ({ ...current, [key]: next }));
    const after = { ...scores };
    if (next === null) delete after[key];
    else after[key] = next;
    setActiveKey(firstUnscored(review, after) ?? key);
    void send("PUT", `/applications/${uid}/review`, {
      programmeId: programme.id,
      scores: { [key]: next },
    }).then(() => {
      // Only the newest press for an answer hands the answer back to the server's word.
      if (own(latestScore.current, key) !== ticket) return;
      setPendingScores((current) => {
        const rest = { ...current };
        delete rest[key];
        return rest;
      });
    });
  };

  // ---------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------

  const addComment = (key: string, text: string) => {
    const known = new Set(review.review.comments.map((comment) => comment.id));
    return send(
      "PUT",
      `/applications/${uid}/review`,
      { programmeId: programme.id, comments: [{ op: "add", key, text }] },
      (next) => {
        const added = next.review.comments.filter((comment) => comment.mine && !known.has(comment.id));
        if (added.length === 0) return;
        setFresh((current) => new Set([...current, ...added.map((comment) => comment.id)]));
      },
    );
  };

  const removeComment = (id: string) => {
    void send("PUT", `/applications/${uid}/review`, {
      programmeId: programme.id,
      comments: [{ op: "remove", id }],
    });
  };

  const saveOverall = () => {
    const text = overallBox.current?.value.trim() ?? "";
    if (text === review.review.overallComment) return;
    void send("PUT", `/applications/${uid}/review`, {
      programmeId: programme.id,
      overallComment: text,
    });
  };

  // ---------------------------------------------------------------------
  // The decision
  // ---------------------------------------------------------------------

  const kind = pendingDecision ?? decision.kind;

  const decide = (
    next: ProgrammeDecisionKind,
    extra: { poolReason?: PoolReason | null; couldSuitProgrammeId?: string | null } = {},
  ) => {
    if (!canAct) return;
    setMenuOpen(false);
    setPendingDecision(next);
    void send("PUT", `/applications/${uid}/decision`, {
      programmeId: programme.id,
      decision: next,
      poolReason: next === "pool" ? (extra.poolReason ?? null) : null,
      couldSuitProgrammeId: next === "pool" ? (extra.couldSuitProgrammeId ?? null) : null,
    }).then(() => setPendingDecision(null));
  };

  const revoke = () => {
    const reason = revokeBox.current?.value.trim() ?? "";
    if (!reason) {
      setRevokeError("Say why you are revoking it.");
      revokeBox.current?.focus();
      return;
    }
    setRevokeError(null);
    void send("DELETE", `/applications/${uid}/decision`, { programmeId: programme.id, reason });
  };

  const setReveal = (value: boolean) => {
    setWorking((count) => count + 1);
    setError(null);
    const run = async () => {
      try {
        const res = await fetch(`${apiBase}/review-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revealOtherReviews: value }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as Saved;
          setError(data.error ?? "That did not save. Try again.");
          return;
        }
        // The switch changes what this person may see, so the application is
        // read again rather than patched.
        const again = await fetch(
          `${apiBase}/applications/${uid}?programme=${encodeURIComponent(programme.id)}`,
        );
        const data = (await again.json().catch(() => ({}))) as Saved;
        if (again.ok && data.review) setReview(data.review);
      } catch {
        setError("That did not save. Check your connection and try again.");
      } finally {
        setWorking((count) => count - 1);
      }
    };
    chain.current = chain.current.then(run, run);
  };

  // ---------------------------------------------------------------------
  // Keys, and the More menu closing itself
  // ---------------------------------------------------------------------

  const go = (target: string | null) => {
    if (target) router.push(`${listPath}/${encodeURIComponent(target)}`);
  };

  const keys = useRef({ score, decide, go, activeKey, canAct, queue });
  useEffect(() => {
    keys.current = { score, decide, go, activeKey, canAct, queue };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      const now = keys.current;
      const pressed = event.key.toLowerCase();
      if (/^[1-5]$/.test(pressed)) {
        if (now.activeKey) now.score(now.activeKey, Number(pressed));
      } else if (pressed === "a") {
        if (now.canAct) now.decide("accept");
      } else if (pressed === "p") {
        if (now.canAct) now.decide("pool");
      } else if (pressed === "j") now.go(now.queue.nextUid);
      else if (pressed === "k") now.go(now.queue.previousUid);
      else if (pressed === "escape") setMenuOpen(false);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-decision-menu]")) setMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  // ---------------------------------------------------------------------
  // What the answers are handed
  // ---------------------------------------------------------------------

  const actions: AnswerActions = {
    ready: hydrated,
    scores,
    activeKey,
    comments: review.review.comments,
    fresh,
    onScore: score,
    onFocusAnswer: setActiveKey,
    onAddComment: addComment,
    onRemoveComment: removeComment,
  };

  const tabs = [
    { id: "about", label: "About you" },
    ...review.sections.map((section) => ({ id: section.id, label: section.tab })),
    { id: "availability", label: "Availability" },
  ];

  const nextHref = queue.nextUid ? `${listPath}/${encodeURIComponent(queue.nextUid)}` : listPath;
  const nextLabel = queue.nextUid ? "Next application" : "Back to applications";
  const decidedLine = decision.kind
    ? `${DECIDED_WORD[decision.kind]} by ${decision.decidedByName ?? "someone"}` +
      (decision.decidedOn ? ` · ${decision.decidedOn}` : "")
    : null;

  const menu = menuOpen ? (
    <div className={styles.menu} role="menu">
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={() => decide("decline")}
      >
        Decline: spam or not eligible
      </button>
    </div>
  ) : null;

  return (
    <div className={`${parts.scope} ${styles.screen}`}>
      {/* ---- Where you are in the queue ---- */}
      <header className={styles.top}>
        <div className={`${kit.mono} ${styles.eyebrow}`}>{programme.name}</div>
        <div className={styles.topRow}>
          <Link className={`${parts.textAction} ${styles.back}`} href={listPath}>
            <Icon name="chevron-left" />
            <span>Applications</span>
          </Link>
          <span className={styles.counter}>
            {queue.position ? (
              <>
                <strong>{queue.position}</strong> of {queue.total}
              </>
            ) : (
              <strong>{queue.total}</strong>
            )}
            <span className={queue.position ? styles.wideOnly : undefined}> to review</span>
          </span>
          <span className={styles.stepper}>
            {queue.previousUid ? (
              <Link
                className={parts.quiet}
                href={`${listPath}/${encodeURIComponent(queue.previousUid)}`}
              >
                <Icon name="chevron-left" />
                <span>Previous</span>
              </Link>
            ) : (
              <button type="button" className={parts.quiet} disabled>
                <Icon name="chevron-left" />
                <span>Previous</span>
              </button>
            )}
            {queue.nextUid ? (
              <Link
                className={parts.quiet}
                href={`${listPath}/${encodeURIComponent(queue.nextUid)}`}
              >
                <span>Next</span>
                <Icon name="chevron-right" />
              </Link>
            ) : (
              <button type="button" className={parts.quiet} disabled>
                <span>Next</span>
                <Icon name="chevron-right" />
              </button>
            )}
          </span>
        </div>
        <div className={styles.keys}>
          <span>Keys</span>
          {scorable.length > 0 ? (
            <span className={styles.keyGroup}>
              <Key>1</Key>
              <span>to</span>
              <Key>5</Key>
              <span>score an answer</span>
            </span>
          ) : null}
          {canAct ? (
            <>
              <span className={styles.keyGroup}>
                <Key>A</Key>
                <span>accept</span>
              </span>
              <span className={styles.keyGroup}>
                <Key>P</Key>
                <span>pool</span>
              </span>
            </>
          ) : null}
          <span className={styles.keyGroup}>
            <Key>J</Key>
            <span>/</span>
            <Key>K</Key>
            <span>next / previous</span>
          </span>
        </div>
      </header>

      <div className={styles.columns}>
        {/* ---- What they sent ---- */}
        <div className={styles.main}>
          <div className={styles.person}>
            <div className={styles.personRow}>
              <span className={styles.personAvatarWide}>
                <Avatar name={applicant.name} uid={applicant.uid} size="xl" />
              </span>
              <span className={styles.personAvatarNarrow}>
                <Avatar name={applicant.name} uid={applicant.uid} size="lg" />
              </span>
              <div className={styles.personText}>
                <h1 className={styles.name}>{applicant.name}</h1>
                <p className={styles.personDetail}>
                  {applicant.detail}
                  {applicant.appliedOn ? (
                    <span className={styles.wideOnly}> · Applied {applicant.appliedOn}</span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className={styles.personChips}>
              {applicant.ranked.map((entry) => (
                <Chip key={entry.programmeId} tone={entry.focus ? "accent" : "neutral"}>
                  {entry.shortName} ·{" "}
                  {entry.focus ? (
                    choiceLabel(entry.choice)
                  ) : (
                    <>
                      {ordinal(entry.choice)}
                      <span className={styles.wideOnly}> choice</span>
                    </>
                  )}
                </Chip>
              ))}
              {applicant.wantsToFacilitate ? <Chip>Wants to facilitate</Chip> : null}
              {applicant.accountWaiting ? <span className={styles.flag}>Account waiting</span> : null}
              {applicant.withdrawn ? <span className={styles.flag}>Withdrawn</span> : null}
            </div>
          </div>

          <nav className={styles.tabs} aria-label="Sections">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={styles.tab}
                aria-current={tab === entry.id ? "true" : undefined}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <AboutCard applicant={applicant} shown={tab === "about"} actions={actions} />
          {review.sections.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              shown={tab === section.id}
              actions={actions}
            />
          ))}
          <AvailabilityCard availability={review.availability} shown={tab === "availability"} />
        </div>

        {/* ---- Your review ---- */}
        <aside className={styles.side}>
          <section className={styles.panel} aria-label="Your review">
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Your review</h2>
              <span className={styles.saveState} role="status">
                {working > 0 ? "Saving" : savedOnce && !error ? "Saved" : ""}
              </span>
            </div>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}

            {scorable.length > 0 ? (
              <div className={styles.ownScore}>
                <div className={kit.mono}>{programme.shortName} score</div>
                {ownMean === null ? (
                  <div className={styles.ownScoreEmpty}>Not scored yet</div>
                ) : (
                  <div className={styles.ownScoreFigure}>
                    <span className={styles.ownScoreNumber}>{formatScore(ownMean)}</span>
                    <span className={styles.ownScoreOutOf}>out of 5</span>
                  </div>
                )}
                <div className={styles.ownScoreNote}>
                  {scoredCount === 0
                    ? scorable.length === 1
                      ? "It has 1 scored answer."
                      : `It has ${scorable.length} scored answers.`
                    : scorable.length === 1
                      ? "From your score on its only scored answer."
                      : scoredCount === scorable.length
                        ? `From your scores on its ${scorable.length} scored answers.`
                        : `From your scores on ${scoredCount} of its ${scorable.length} scored answers.`}
                </div>
              </div>
            ) : null}

            <div className={styles.overall}>
              <label className={styles.fieldLabel} htmlFor="overall-comment">
                Overall comment{" "}
                <span className={styles.fieldHint}>
                  (private<span className={styles.wideOnly}>, this round</span>)
                </span>
              </label>
              <textarea
                id="overall-comment"
                ref={overallBox}
                className={styles.textarea}
                rows={3}
                maxLength={4000}
                placeholder={`What stood out about ${applicant.firstName}?`}
                defaultValue={review.review.overallComment}
                onBlur={saveOverall}
              />
            </div>
            <p className={styles.privacy}>
              <span className={styles.noteIcon}>
                <Icon name="eye-off" size={16} />
              </span>
              <span>Only you, admins and SU-recognised committee can see comments and scores.</span>
            </p>

            <hr className={`${styles.panelRule} ${styles.wideOnlyBlock}`} />

            {told ? (
              // A record, with nothing to press: what was decided, and where
              // it has gone. On a phone it is the only place the decision is
              // drawn once the bar at the foot has gone, so it is kept there.
              <div className={`${styles.decision} ${styles.decisionTold}`}>
                <div className={styles.fieldLabel}>Decision</div>
                {decision.standing !== "to-review" || decidedLine ? (
                  <div className={styles.readDecision}>
                    {decision.standing !== "to-review" ? <StandingChip standing={decision.standing} /> : null}
                    {decidedLine ? <span className={styles.decided}>{decidedLine}</span> : null}
                  </div>
                ) : null}
                {decision.placedOn ? (
                  <p className={styles.decided}>
                    {decision.placedOn}, a higher choice of theirs, accepted them.
                  </p>
                ) : null}
                <p className={styles.decided}>
                  {applicant.firstName} has been told their result. It’s on their own application
                  page now, so this decision can’t be changed.
                </p>
              </div>
            ) : viewer.canDecide ? (
              <div className={styles.decision}>
                <fieldset className={styles.options} disabled={!canAct || !hydrated}>
                  <legend className={styles.fieldLabel}>Decision</legend>
                  {decidedLine ? <p className={styles.decided}>{decidedLine}</p> : null}
                  {decision.placedOn ? (
                    <p className={styles.decided}>
                      {decision.placedOn}, a higher choice of theirs, has accepted them. A decision
                      here only counts if that changes.
                    </p>
                  ) : null}
                  {decision.lastRevocation ? (
                    <div className={styles.revoked}>
                      <strong>
                        {decision.lastRevocation.byName} revoked an acceptance here
                        {decision.lastRevocation.on ? ` on ${decision.lastRevocation.on}` : ""}.
                      </strong>
                      {decision.lastRevocation.reason ? (
                        <MemberText
                          text={decision.lastRevocation.reason}
                          className={styles.revokedReason}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <label className={styles.option} data-checked={kind === "accept"}>
                    <input
                      type="radio"
                      name="decision"
                      className={styles.optionInput}
                      checked={kind === "accept"}
                      onChange={() => decide("accept")}
                    />
                    <span className={styles.radio} aria-hidden="true" />
                    <span className={styles.optionText}>
                      <span className={styles.optionTitle}>Accept for {programme.shortName}</span>
                      <span
                        className={`${styles.optionSub} ${
                          programme.placesLeft === 0 ? styles.optionWarn : ""
                        }`}
                      >
                        {programme.places === null || programme.placesLeft === null
                          ? "Places aren’t set yet."
                          : programme.placesLeft === 0
                            ? `No places left of ${programme.places}.`
                            : `${programme.placesLeft} of ${programme.places} places left.`}
                      </span>
                    </span>
                    <span className={styles.optionKey}>
                      <Key>A</Key>
                    </span>
                  </label>
                  <label className={styles.option} data-checked={kind === "pool"}>
                    <input
                      type="radio"
                      name="decision"
                      className={styles.optionInput}
                      checked={kind === "pool"}
                      onChange={() => decide("pool")}
                    />
                    <span className={styles.radio} aria-hidden="true" />
                    <span className={styles.optionText}>
                      <span className={styles.optionTitle}>Pool</span>
                      <span className={styles.optionSub}>
                        The committee picks another option for them, or a kind no, before{" "}
                        {decisionDay}.
                      </span>
                    </span>
                    <span className={styles.optionKey}>
                      <Key>P</Key>
                    </span>
                  </label>
                  {kind === "pool" ? (
                    <div className={styles.poolWhy}>
                      <span className={styles.poolWhyLabel}>Why? (optional)</span>
                      <div className={styles.poolReasons}>
                        {(["capacity", "better-fit"] as PoolReason[]).map((reason) => (
                          <button
                            key={reason}
                            type="button"
                            className={styles.reason}
                            aria-pressed={decision.poolReason === reason}
                            onClick={() =>
                              decide("pool", {
                                poolReason: decision.poolReason === reason ? null : reason,
                                couldSuitProgrammeId:
                                  reason === "better-fit" && decision.poolReason !== reason
                                    ? decision.couldSuitProgrammeId
                                    : null,
                              })
                            }
                          >
                            {POOL_REASON_LABEL[reason]}
                          </button>
                        ))}
                      </div>
                      {decision.poolReason === "better-fit" &&
                      decision.couldSuitOptions.length > 0 ? (
                        <div className={styles.couldSuit}>
                          <label className={styles.poolWhyLabel} htmlFor="could-suit">
                            Could suit
                          </label>
                          <Select
                            id="could-suit"
                            value={decision.couldSuitProgrammeId ?? ""}
                            onChange={(event) =>
                              decide("pool", {
                                poolReason: "better-fit",
                                couldSuitProgrammeId: event.target.value || null,
                              })
                            }
                          >
                            <option value="">Not picked</option>
                            {decision.couldSuitOptions.map((option) => (
                              <option key={option.programmeId} value={option.programmeId}>
                                {option.shortName}
                              </option>
                            ))}
                          </Select>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </fieldset>
                <div data-decision-menu>
                  <button
                    type="button"
                    className={styles.more}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    disabled={!canAct || !hydrated}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    <Icon name="dots" />
                    <span>More</span>
                  </button>
                  {menu}
                </div>
              </div>
            ) : (
              <div className={styles.decision}>
                <div className={styles.fieldLabel}>Decision</div>
                <div className={styles.readDecision}>
                  <StandingChip standing={decision.standing} />
                  {decidedLine ? <span className={styles.decided}>{decidedLine}</span> : null}
                </div>
                <p className={styles.decided}>
                  {programme.leadName ?? "The lead"} decides for {programme.shortName}. You can score
                  and comment.
                </p>
              </div>
            )}

            <Link className={`${kit.primary} ${styles.next}`} href={nextHref}>
              <span>{nextLabel}</span>
              {queue.nextUid ? <Icon name="arrow-right" /> : null}
            </Link>
            {/* Somebody who has been told is past all three of these lines: the card above says so. */}
            {told ? null : (
              <p className={styles.fine}>
                {round.decisionsSent
                  ? "Decisions for this term have been sent, so they can’t be changed here."
                  : viewer.canDecide
                    ? `Accepting records it now. Nobody’s emailed until ${decisionDay}.`
                    : `Nobody’s emailed until ${decisionDay}.`}
              </p>
            )}

            <hr className={`${styles.panelRule} ${styles.wideOnlyBlock}`} />

            <div className={styles.others}>
              <div className={styles.othersHead}>
                <span className={styles.othersIcon}>
                  <Icon name="eye-off" size={16} />
                </span>
                <h3 className={styles.othersTitle}>
                  Other reviews
                  <span className={styles.narrowOnly}> · {review.review.others.count}</span>
                </h3>
                <span className={`${styles.othersCount} ${styles.wideOnly}`}>
                  {review.review.others.count}
                </span>
              </div>
              {review.review.others.count === 0 ? (
                <p className={styles.othersNote}>Nobody else has reviewed this yet.</p>
              ) : null}
              {review.review.others.hidden > 0 ? (
                <p className={styles.othersHidden}>
                  <span className={`${styles.noteIcon} ${styles.wideOnly}`}>
                    <Icon name="eye-off" size={16} />
                  </span>
                  <span>
                    <span className={styles.wideOnly}>
                      Hidden on a first review. An admin can turn them on.
                    </span>
                    <span className={styles.narrowOnly}>Hidden. An admin can turn them on.</span>
                  </span>
                </p>
              ) : null}
              {review.review.others.visible.length > 0 ? (
                <ul className={styles.otherList}>
                  {review.review.others.visible.map((other) => (
                    <li key={other.reviewerUid} className={styles.other}>
                      <div className={styles.otherHead}>
                        <Avatar name={other.name} uid={other.reviewerUid} size="sm" />
                        <strong>{other.name}</strong>
                        {other.score ? (
                          <ScoreBox>{other.score}</ScoreBox>
                        ) : (
                          <span className={styles.decided}>No score</span>
                        )}
                      </div>
                      {other.overallComment ? (
                        <MemberText text={other.overallComment} className={styles.otherComment} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          {review.admin ? (
            <section className={styles.admin} aria-label="What an admin sees">
              <div className={styles.adminHead}>
                <div className={kit.mono}>What an admin sees</div>
                <span className={styles.adminLine} aria-hidden="true" />
              </div>
              <div className={styles.adminBox}>
                <label className={styles.switchRow}>
                  <span className={styles.switchLabel}>Show other reviewers’ scores</span>
                  <input
                    type="checkbox"
                    role="switch"
                    className={styles.switchInput}
                    checked={review.admin.revealOtherReviews}
                    disabled={!hydrated}
                    onChange={(event) => setReveal(event.target.checked)}
                  />
                  <span className={styles.switchTrack} aria-hidden="true">
                    <span className={styles.switchKnob} />
                  </span>
                </label>

                <div className={styles.adminTitle}>Scores by section</div>
                {review.admin.sections.length === 0 ? (
                  <p className={styles.decided}>Nothing they ranked uses scores.</p>
                ) : (
                  <div className={styles.sectionScores}>
                    {review.admin.sections.map((section) => (
                      <div key={section.programmeId} className={styles.sectionScore}>
                        <div className={styles.sectionScoreText}>
                          <div className={styles.sectionScoreName}>{section.shortName}</div>
                          <div className={styles.sectionScoreLine}>
                            {section.line ??
                              (section.hidden > 0
                                ? `${section.hidden} hidden until you score these or turn this on`
                                : "Nobody has scored these yet")}
                          </div>
                        </div>
                        {section.score ? <ScoreBox>{section.score}</ScoreBox> : null}
                      </div>
                    ))}
                  </div>
                )}

                {decision.standing === "accepted" && !told ? (
                  <>
                    <hr className={styles.adminRule} />
                    <div className={styles.adminTitle}>On an accepted application</div>
                    <div className={styles.acceptedRow}>
                      <div className={styles.acceptedWho}>
                        <Avatar name={applicant.name} uid={applicant.uid} />
                        <div className={styles.acceptedText}>
                          <div className={styles.acceptedName}>{applicant.name}</div>
                          <div className={styles.sectionScoreLine}>{decidedLine}</div>
                        </div>
                      </div>
                      <StandingChip standing="accepted" />
                    </div>
                    <div className={styles.careful}>
                      <h4 className={styles.carefulTitle}>Careful</h4>
                      <p className={styles.carefulNote}>
                        Revoking takes {applicant.firstName}’s place away and frees it.
                      </p>
                      <div>
                        <label className={styles.fieldLabel} htmlFor="revoke-reason">
                          Why are you revoking it?
                        </label>
                        <textarea
                          id="revoke-reason"
                          ref={revokeBox}
                          className={styles.textarea}
                          rows={2}
                          maxLength={500}
                          placeholder={`${programme.leadName ?? "The lead"} sees this.`}
                          aria-invalid={revokeError ? true : undefined}
                        />
                        {revokeError ? (
                          <p className={styles.error} role="alert">
                            {revokeError}
                          </p>
                        ) : null}
                      </div>
                      <div className={styles.carefulActions}>
                        <button
                          type="button"
                          className={parts.dangerOutline}
                          disabled={!hydrated || round.decisionsSent || working > 0}
                          onClick={revoke}
                        >
                          Revoke acceptance
                        </button>
                        <span className={styles.carefulLogged}>
                          Logged with your name and the time.
                        </span>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      {/* ---- The decision, within reach of a thumb ---- */}
      {canAct ? (
        <div className={styles.bar} role="group" aria-label="Decision" data-decision-menu>
          {menu}
          <button
            type="button"
            className={styles.barMore}
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={!hydrated}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name="dots" size={20} />
          </button>
          <button
            type="button"
            className={styles.barButton}
            aria-pressed={kind === "pool"}
            disabled={!hydrated}
            onClick={() => decide("pool")}
          >
            {kind === "pool" ? <Icon name="check" size={16} strokeWidth={2.4} /> : null}
            <span>Pool</span>
          </button>
          <button
            type="button"
            className={`${kit.primary} ${styles.barAccept}`}
            aria-pressed={kind === "accept"}
            disabled={!hydrated}
            onClick={() => decide("accept")}
          >
            {kind === "accept" ? <Icon name="check" size={16} strokeWidth={2.4} /> : null}
            <span>Accept</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
