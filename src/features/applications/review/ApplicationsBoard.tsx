"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import Select from "@/components/ui/Select";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import type {
  ApplicationRow,
  BulkDecisionResult,
  ProgrammeBoard,
} from "@/lib/applications/review/types";
import { PROGRAMME_STANDING_LABEL, ordinal } from "@/lib/applications/words";
import {
  DEFAULT_QUERY,
  PAGE_SIZE,
  SORT_LABEL,
  SORT_WORDS,
  filterRows,
  isOrAre,
  type ListQuery,
  type SortKey,
  type StatusFilter,
} from "./listModel";
import { changedMark } from "./changesWords";
import { Avatar, Chip, Icon, ScoreBox, StandingChip } from "./parts";
import styles from "./ApplicationsBoard.module.css";
import parts from "./parts.module.css";

/**
 * One programme's applications, as its lead works through them.
 *
 * Everything on screen comes from the payload the server built for this
 * caller: the rows, the counts and the recommendations are already limited to
 * what they may see, so nothing here decides who sees what. The list filters,
 * searches and sorts those rows in the browser (`listModel.ts`).
 *
 * A decision made from here goes through the route and the page is then read
 * again from the server, so two numbers on it can never disagree with what is
 * stored. Nothing on this screen tells an applicant anything.
 */

type Props = {
  board: ProgrammeBoard;
  /** The address of this list, which each application's own page hangs off. */
  listPath: string;
  /** The route this list reads from and posts decisions to. */
  apiPath: string;
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default function ApplicationsBoard({ board, listPath, apiPath }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [query, setQuery] = useState<ListQuery>(DEFAULT_QUERY);
  /** Which recommendation the list is narrowed to, so its button reads as pressed. */
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const { programme, progress, counts, viewer, round } = board;
  const canAct = viewer.canDecide && !round.decisionsSent;

  const matching = useMemo(() => filterRows(board.rows, query), [board.rows, query]);
  const visible = matching.slice(0, shown);
  const picked = matching.filter((row) => selected.has(row.uid));

  const update = (change: Partial<ListQuery>) => {
    setQuery((current) => ({ ...current, ...change }));
    setShown(PAGE_SIZE);
  };

  const showGroup = (key: string, uids: readonly string[]) => {
    if (groupKey === key) {
      setGroupKey(null);
      update({ group: null });
      return;
    }
    setGroupKey(key);
    // A group is picked from everybody, whatever else the list was narrowed to.
    setQuery({ ...DEFAULT_QUERY, sort: query.sort, group: uids });
    setShown(PAGE_SIZE);
  };

  const clearFilters = () => {
    setGroupKey(null);
    setQuery({ ...DEFAULT_QUERY, sort: query.sort });
    setShown(PAGE_SIZE);
  };

  const toggle = (uid: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // Somebody who has withdrawn cannot be decided from the list, and nobody
  // decides for somebody who joined by invitation, so the header box neither
  // picks them nor waits for them.
  const choosable = visible.filter((row) => !row.withdrawn && !row.byInvitation);
  const allVisiblePicked = choosable.length > 0 && choosable.every((row) => selected.has(row.uid));
  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of choosable) {
        if (allVisiblePicked) next.delete(row.uid);
        else next.add(row.uid);
      }
      return next;
    });
  };

  async function decide(decision: "accept" | "pool") {
    if (busy || picked.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, uids: picked.map((row) => row.uid) }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        result?: BulkDecisionResult;
      };
      if (!res.ok || !body.result) {
        setNotice({ tone: "error", text: body.error ?? "That did not save. Try again." });
        return;
      }
      setNotice(bulkNotice(body.result));
      setSelected(new Set());
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "That did not save. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const nextUid = board.queue[0] ?? null;
  const filtered =
    query.status !== "all" ||
    query.search.trim() !== "" ||
    query.firstChoiceOnly ||
    query.facilitatingOnly ||
    query.group !== null;

  return (
    <div className={`${parts.scope} ${styles.board}`}>
      {/* ---- Where the programme is up to ---- */}
      <section className={styles.card} aria-label="Progress">
        <ol className={styles.steps} aria-label={`Where ${programme.shortName} is up to`}>
          <Step label="Applied" count={progress.applications} />
          <StepArrow />
          <Step label="Decided" count={progress.decided} current={!round.decisionsSent} />
          <StepArrow />
          <Step
            label="Emailed"
            count={progress.emailed}
            current={round.decisionsSent}
            muted={!round.decisionsSent}
          />
        </ol>
        <hr className={styles.rule} />
        <div className={styles.meters}>
          <Meter
            figure={`${progress.decided} of ${progress.applications}`}
            label="decided"
            value={progress.applications === 0 ? 0 : progress.decided / progress.applications}
            note={
              `${progress.toReview} still to review` +
              (progress.placedElsewhere > 0
                ? ` · ${progress.placedElsewhere} ${
                    progress.placedElsewhere === 1 ? "has" : "have"
                  } a place on a higher choice`
                : "")
            }
          />
          {programme.places === null ? (
            <Meter
              figure={String(progress.placed)}
              label="accepted"
              value={0}
              note="Places not set yet"
            />
          ) : (
            <Meter
              figure={`${progress.placed} of ${programme.places}`}
              label="places accepted"
              value={programme.places === 0 ? 0 : progress.placed / programme.places}
              note={
                plural(progress.placesLeft ?? 0, "place left", "places left") +
                (progress.invited > 0
                  ? ` · ${progress.invited} held for ${
                      progress.invited === 1 ? "an invitation" : "invitations"
                    }`
                  : "")
              }
            />
          )}
        </div>
        <hr className={styles.rule} />
        <div className={styles.cardFoot}>
          <p className={styles.note}>
            <span className={styles.noteIcon}>
              <Icon name="mail" size={16} />
            </span>
            <span>
              {round.decisionsSent ? (
                <>
                  <strong>Decisions have been sent.</strong> They can’t be changed here now.
                </>
              ) : (
                <>
                  <strong>
                    Nobody hears until {round.decisionDay ?? "decision day"}.
                  </strong>{" "}
                  {viewer.canDecide
                    ? "You can change a decision until then."
                    : "A decision can change until then."}
                </>
              )}
            </span>
          </p>
          {nextUid ? (
            <Link className={`${kit.primary} ${styles.reviewNext}`} href={`${listPath}/${nextUid}`}>
              <span>Review next ({board.queue.length} left)</span>
              <Icon name="arrow-right" />
            </Link>
          ) : null}
        </div>
      </section>

      {/* ---- What the scores suggest ---- */}
      {board.recommendations ? (
        <Recommendations board={board} pressedKey={groupKey} onShow={showGroup} />
      ) : null}

      {/* ---- Filters ---- */}
      <div className={styles.filters}>
        <div className={styles.statusGroup} role="group" aria-label="Show applications by decision">
          {(
            [
              ["all", "All", counts.all],
              ["to-review", "To review", counts.toReview],
              ["accepted", "Accepted", counts.accepted],
              ["pooled", "Pooled", counts.pooled],
              ["declined", "Declined", counts.declined],
            ] as [StatusFilter, string, number][]
          ).map(([status, label, count]) => (
            <button
              key={status}
              type="button"
              className={styles.statusButton}
              aria-pressed={query.status === status}
              onClick={() => update({ status })}
            >
              {label}
              <span className={styles.count}>{count}</span>
            </button>
          ))}
        </div>
        <div className={styles.searchRow}>
          <label className={styles.search}>
            <span className={styles.searchIcon}>
              <Icon name="search" />
            </span>
            <span className={styles.srOnly}>Search names or courses</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search names or courses"
              value={query.search}
              onChange={(event) => update({ search: event.target.value })}
            />
          </label>
          <button
            type="button"
            className={styles.pill}
            aria-pressed={query.firstChoiceOnly}
            onClick={() => update({ firstChoiceOnly: !query.firstChoiceOnly })}
          >
            1st choice
          </button>
          <button
            type="button"
            className={styles.pill}
            aria-pressed={query.facilitatingOnly}
            onClick={() => update({ facilitatingOnly: !query.facilitatingOnly })}
          >
            Wants to facilitate
          </button>
          <div className={styles.sort}>
            <Select
              aria-label="Sort"
              className={styles.sortSelect}
              value={query.sort}
              onChange={(event) => {
                const next = event.target.value;
                if (Object.hasOwn(SORT_LABEL, next)) update({ sort: next as SortKey });
              }}
            >
              {(Object.keys(SORT_LABEL) as SortKey[])
                .filter((key) => key !== "score" || programme.usesScores)
                .map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABEL[key]}
                  </option>
                ))}
            </Select>
          </div>
        </div>
      </div>

      {/* ---- The applications ---- */}
      <section className={`${styles.card} ${styles.tableCard}`} aria-label="Applications">
        {canAct && picked.length > 0 ? (
          <div className={styles.bulk} role="region" aria-label="Selected applications">
            <span className={styles.bulkCount}>{picked.length} selected</span>
            <button
              type="button"
              className={parts.quiet}
              disabled={busy || !hydrated}
              onClick={() => decide("accept")}
            >
              Accept
            </button>
            <button
              type="button"
              className={parts.quiet}
              disabled={busy || !hydrated}
              onClick={() => decide("pool")}
            >
              Pool
            </button>
            <span className={styles.bulkSpace} />
            <button
              type="button"
              className={parts.textAction}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
        ) : null}
        {notice ? (
          <p
            className={notice.tone === "error" ? styles.noticeError : styles.noticeOk}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}

        {matching.length === 0 ? (
          <div className={styles.empty}>
            {board.rows.length === 0 ? (
              <p>Nobody has applied to {programme.shortName} yet.</p>
            ) : (
              <>
                <p>Nobody matches that.</p>
                <button type="button" className={parts.textAction} onClick={clearFilters}>
                  Clear the filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {canAct ? (
                    <th scope="col" className={styles.checkHead}>
                      <Checkbox
                        label="Select everyone shown"
                        checked={allVisiblePicked}
                        disabled={!hydrated}
                        onChange={toggleAllVisible}
                      />
                    </th>
                  ) : null}
                  <th scope="col">Applicant</th>
                  <th scope="col">Choice</th>
                  {programme.usesScores ? (
                    <th scope="col" className={styles.wrapHead}>
                      {programme.shortName} score
                    </th>
                  ) : null}
                  <th scope="col">Facilitating</th>
                  <th scope="col">Comments</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <Row
                    key={row.uid}
                    row={row}
                    href={`${listPath}/${row.uid}`}
                    showScore={programme.usesScores}
                    selectable={canAct}
                    selected={selected.has(row.uid)}
                    disabled={!hydrated}
                    onToggle={() => toggle(row.uid)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {matching.length > 0 ? (
          <div className={styles.tableFoot}>
            <span className={styles.footText}>
              Showing {visible.length} of {matching.length}, {SORT_WORDS[query.sort]}
              {filtered ? (
                <>
                  {" · "}
                  <button type="button" className={styles.inlineLink} onClick={clearFilters}>
                    Clear the filters
                  </button>
                </>
              ) : null}
            </span>
            {visible.length < matching.length ? (
              <button
                type="button"
                className={parts.quiet}
                onClick={() => setShown((count) => count + PAGE_SIZE)}
              >
                Show more
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function bulkNotice(result: BulkDecisionResult): { tone: "ok" | "error"; text: string } {
  const done = result.decision === "accept" ? "Accepted" : "Pooled";
  const already = result.decision === "accept" ? "accepted" : "pooled";
  const sentences = [`${done} ${result.changed}.`];
  if (result.unchanged > 0) {
    sentences.push(`${result.unchanged} ${result.unchanged === 1 ? "was" : "were"} already ${already}.`);
  }
  if (result.refused.length > 0) {
    const who = result.refused
      .map((entry) => `${entry.name || "One application"}: ${entry.reason}`)
      .join(" ");
    sentences.push(`${result.refused.length} not changed. ${who}`);
  }
  return { tone: result.refused.length > 0 ? "error" : "ok", text: sentences.join(" ") };
}

function Step({
  label,
  count,
  current = false,
  muted = false,
}: {
  label: string;
  count: number;
  current?: boolean;
  muted?: boolean;
}) {
  return (
    <li
      className={`${styles.step} ${current ? styles.stepCurrent : ""} ${muted ? styles.stepMuted : ""}`}
      aria-current={current ? "step" : undefined}
    >
      <span className={styles.stepLabel}>{label}</span>
      <span className={styles.stepCount}>{count}</span>
    </li>
  );
}

function StepArrow() {
  return (
    <li className={styles.stepArrow} aria-hidden="true">
      <Icon name="chevron-right" size={16} />
    </li>
  );
}

function Meter({
  figure,
  label,
  value,
  note,
}: {
  figure: string;
  label: string;
  /** How full the bar is, from 0 to 1. */
  value: number;
  note: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span className={styles.meterFigure}>{figure}</span>
        <span className={styles.meterLabel}>{label}</span>
      </div>
      <div
        className={styles.meterTrack}
        role="progressbar"
        aria-label={`${figure} ${label}`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.meterFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.meterNote}>{note}</div>
    </div>
  );
}

function Recommendations({
  board,
  pressedKey,
  onShow,
}: {
  board: ProgrammeBoard;
  pressedKey: string | null;
  onShow: (key: string, uids: readonly string[]) => void;
}) {
  const found = board.recommendations;
  if (!found) return null;
  const { programme, viewer } = board;
  const showThe = (count: number) => (count === 1 ? "Show them" : `Show the ${count}`);

  type Line = {
    key: string;
    text: ReactNode;
    action: { label: string; uids: readonly string[]; plain?: boolean } | null;
  };
  const lines: Line[] = [];

  if (programme.places === null) {
    lines.push({
      key: "top",
      text: "Set the number of places to see where the scores cut off.",
      action: null,
    });
  } else if (found.scoredCount === 0) {
    lines.push({ key: "top", text: "Nobody has a score yet.", action: null });
  } else if (found.fillsPlaces) {
    lines.push({
      key: "top",
      text: (
        <>
          The top {programme.places} scores reach down to <strong>{found.cutoff}</strong>.
        </>
      ),
      action: { label: "Show them", uids: found.top },
    });
  } else {
    lines.push({
      key: "top",
      text: (
        <>
          <strong>{found.scoredCount}</strong> {found.scoredCount === 1 ? "has" : "have"} a score
          so far, fewer than the {programme.places} places.
        </>
      ),
      action: { label: "Show them", uids: found.top },
    });
  }
  if (found.borderline.length > 0) {
    lines.push({
      key: "borderline",
      text: (
        <>
          <strong>{found.borderline.length}</strong> {isOrAre(found.borderline.length)} within{" "}
          {found.margin} of that line.
        </>
      ),
      action: { label: "Worth a second look", uids: found.borderline },
    });
  }
  if (found.rankedLower.length > 0) {
    lines.push({
      key: "ranked-lower",
      text: (
        <>
          <strong>{found.rankedLower.length}</strong> ranked {programme.shortName}{" "}
          {found.rankedLowerAllSecond
            ? "2nd, so their 1st choice decides first."
            : "2nd or lower, so a higher choice decides first."}
        </>
      ),
      action: { label: showThe(found.rankedLower.length), uids: found.rankedLower, plain: true },
    });
  }
  for (const group of found.scoredHigherElsewhere) {
    lines.push({
      key: `higher-${group.programmeId}`,
      text: (
        <>
          <strong>{group.uids.length}</strong> scored higher on the {group.shortName} questions.
        </>
      ),
      action: { label: showThe(group.uids.length), uids: group.uids },
    });
  }

  return (
    <section className={`${styles.card} ${styles.recommendations}`} aria-label="Recommendations">
      <div className={styles.recHead}>
        <div className={styles.recTitles}>
          <h2 className={styles.recTitle}>Recommendations</h2>
          <p className={styles.recSub}>From the {programme.shortName} scores so far.</p>
        </div>
        <Chip tone="accent">Scores on</Chip>
      </div>
      <ul className={styles.recList}>
        {lines.map((line) => (
          <li key={line.key} className={styles.recLine}>
            <span className={styles.recText}>{line.text}</span>
            {line.action ? (
              <button
                type="button"
                className={line.action.plain ? parts.textAction : parts.quiet}
                aria-pressed={pressedKey === line.key}
                onClick={() => onShow(line.key, line.action?.uids ?? [])}
              >
                {line.action.label}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className={`${styles.note} ${styles.recFoot}`}>
        <span className={styles.noteIcon}>
          <Icon name="info" size={16} />
        </span>
        <span>
          Scores are a guide.{" "}
          {viewer.canDecide
            ? "You make the call."
            : `${programme.leadName ?? "The lead"} makes the call.`}
        </span>
      </p>
    </section>
  );
}

function Checkbox({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        className={styles.checkInput}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className={styles.checkBox} aria-hidden="true">
        <Icon name="check" size={14} strokeWidth={3} />
      </span>
    </label>
  );
}

function Row({
  row,
  href,
  showScore,
  selectable,
  selected,
  disabled,
  onToggle,
}: {
  row: ApplicationRow;
  href: string;
  showScore: boolean;
  selectable: boolean;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const settledElsewhere = row.standing === "to-review" && !row.owesDecision;
  return (
    <tr className={selected ? styles.rowSelected : undefined}>
      {selectable ? (
        <td className={styles.checkCell}>
          {row.withdrawn || row.byInvitation ? null : (
            <Checkbox
              label={`Select ${row.name}`}
              checked={selected}
              disabled={disabled}
              onChange={onToggle}
            />
          )}
        </td>
      ) : null}
      <td className={styles.applicantCell}>
        <div className={styles.applicant}>
          <Avatar name={row.name} uid={row.uid} />
          <div className={styles.applicantText}>
            <Link className={styles.applicantName} href={href}>
              {row.name}
            </Link>
            <div className={styles.applicantDetail}>{row.detail}</div>
          </div>
        </div>
        {row.changed ? (
          // They sent it again with something different. The review screen shows what it said before.
          <div className={styles.changedMark}>{changedMark(row.changedOn)}</div>
        ) : null}
        {row.accountWaiting ? <div className={styles.flag}>Account waiting</div> : null}
      </td>
      <td data-label="Choice">
        {row.byInvitation ? (
          // They did not rank this programme: the committee invited them to it.
          <div>
            <span className={styles.lowerChoice}>Invited</span>
            {row.firstChoiceName ? (
              <div className={styles.sub}>1st: {row.firstChoiceName}</div>
            ) : null}
          </div>
        ) : row.choice === 1 ? (
          <span className={styles.nowrap}>1st</span>
        ) : (
          <div>
            <span className={styles.lowerChoice}>{ordinal(row.choice)}</span>
            {row.firstChoiceName ? (
              <div className={styles.sub}>1st: {row.firstChoiceName}</div>
            ) : null}
          </div>
        )}
      </td>
      {showScore ? (
        <td data-label="Score">
          {row.score ? (
            <ScoreBox>{row.score}</ScoreBox>
          ) : (
            <span className={styles.mutedText}>Not scored yet</span>
          )}
        </td>
      ) : null}
      <td data-label="Facilitating">
        {row.wantsToFacilitate ? <Chip>Yes</Chip> : <span className={styles.mutedText}>No</span>}
      </td>
      <td data-label="Comments">
        <span className={row.comments === 0 ? styles.mutedText : undefined}>{row.comments}</span>
      </td>
      <td data-label="Status" className={styles.statusCell}>
        {row.withdrawn ? (
          // They left after applying. The row says so in place of what the
          // programme decided, with that decision kept as a line under it.
          <div>
            <Chip dot>Withdrawn</Chip>
            {row.byInvitation ? (
              <div className={styles.sub}>Had accepted an invitation</div>
            ) : row.standing === "to-review" ? null : (
              <div className={styles.sub}>Was {PROGRAMME_STANDING_LABEL[row.standing].toLowerCase()}</div>
            )}
          </div>
        ) : row.byInvitation ? (
          // In the programme by an invitation they accepted. Nothing to decide.
          <div>
            <StandingChip standing="accepted" />
            <div className={styles.sub}>Accepted an invitation</div>
          </div>
        ) : settledElsewhere ? (
          <div>
            <Chip dot>Has a place</Chip>
            {row.placedOn ? <div className={styles.sub}>On {row.placedOn}</div> : null}
          </div>
        ) : (
          <StandingChip standing={row.standing} />
        )}
      </td>
    </tr>
  );
}
