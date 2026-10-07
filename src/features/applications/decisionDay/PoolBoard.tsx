"use client";

import Link from "next/link";
import { useState } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import Select from "@/components/ui/Select";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import {
  invitationsPickedLine,
  placesTakenLine,
  poolTotalsLine,
} from "@/lib/applications/decisionDay/boardWords";
import type {
  PoolBoard as Board,
  PoolProgramme,
  PoolRow,
} from "@/lib/applications/decisionDay/views";
import shared from "./decisionDay.module.css";
import Icon from "./Icon";
import { Page, Pill } from "./parts";
import styles from "./PoolBoard.module.css";

/**
 * Pooled applicants: the people no programme could take this term, and the
 * outcome an admin picks for each before decision day.
 *
 * ## Every pick saves itself
 *
 * Choosing an outcome sends it straight away and redraws the whole page from
 * what the server stored, so the free places and every other person's options
 * are right after each change. The select shows what is stored and nothing
 * else: a pick that was refused falls back to the stored one, with the reason
 * in a sentence underneath.
 *
 * ## Nothing here tells an applicant anything
 *
 * This page only records what each person will hear. They hear it on decision
 * day, from the send.
 *
 * ## Nobody disappears
 *
 * Somebody pooled who gives a place or an invitation back after decision day
 * leaves the list above and every number on the page. They are kept in a
 * second list underneath, marked Withdrawn, with the button they pressed and
 * the reason they gave, because the reason is often something that can be put
 * right.
 */

type Saving = "saved" | "saving" | "failed";

const NO_OFFER = "no-offer";
const invite = (programmeId: string) => `invite:${programmeId}`;

/** The stored outcome as the select's value. Empty while nothing is picked. */
function valueOf(row: PoolRow): string {
  if (!row.outcome) return "";
  return row.outcome.kind === "invite" ? invite(row.outcome.programmeId) : NO_OFFER;
}

function Place({ programme }: { programme: PoolProgramme }) {
  const picked = invitationsPickedLine(programme.open, programme.invited);
  return (
    <div className={`${shared.card} ${styles.place}`}>
      <span className={styles.placeName}>{programme.shortName}</span>
      {programme.open !== null ? (
        <div className={styles.placeNumberRow}>
          <span className={styles.placeNumber}>{programme.open}</span>
          <span className={styles.placeUnit}>
            {programme.open === 1 ? "free place" : "free places"}
          </span>
        </div>
      ) : null}
      <p className={styles.placeText}>
        {placesTakenLine(programme.places, programme.placed)}
        {picked ? (
          <>
            <br />
            {picked}
          </>
        ) : null}
      </p>
    </div>
  );
}

export default function PoolBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [filter, setFilter] = useState<string>("all");
  const [saving, setSaving] = useState<Saving>("saved");
  const [problem, setProblem] = useState<string | null>(null);
  // A select is live only once the page's script is running: before that a
  // change would be lost without a word.
  const hydrated = useHydrated();

  const sent = board.sentOn !== null;
  const told = board.rows.filter((row) => row.told).length;
  const busy = saving === "saving";
  const shown =
    filter === "all" ? board.rows : board.rows.filter((row) => row.ranked[0]?.programmeId === filter);
  const waiting = board.counts.needsOutcome;

  async function save(body: Record<string, unknown>) {
    setSaving("saving");
    setProblem(null);
    try {
      const response = await fetch(`/api/admissions/forms/${encodeURIComponent(board.roundId)}/pool`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = (await response.json().catch(() => null)) as
        | { board?: Board; error?: string }
        | null;
      if (!response.ok || !answer?.board) {
        setProblem(answer?.error ?? "Could not save that outcome. Try again.");
        setSaving("failed");
        return;
      }
      setBoard(answer.board);
      setSaving("saved");
    } catch {
      setProblem("Could not reach the site to save that. Check your connection and try again.");
      setSaving("failed");
    }
  }

  function pick(row: PoolRow, value: string) {
    if (!value || value === valueOf(row)) return;
    const outcome =
      value === NO_OFFER
        ? { kind: "no-offer" }
        : { kind: "invite", programmeId: value.slice("invite:".length) };
    void save({ uid: row.uid, outcome });
  }

  let notice: string;
  if (sent) {
    notice = `Everyone here was told on ${board.sentOn}, with every other decision. Their outcomes can’t change now.`;
  } else if (told > 0) {
    notice = `${told} of these people ${told === 1 ? "has" : "have"} been told already. The rest hear when the send is finished.`;
  } else {
    notice = `Nobody here has been told anything yet. Everyone hears on ${board.hearOn ?? "decision day"}, with every other decision.`;
  }

  return (
    <Page
      roundId={board.roundId}
      title="Pooled applicants"
      chips={
        <>
          <Pill>
            {board.counts.pooled} {board.counts.pooled === 1 ? "person" : "people"}
          </Pill>
          <Pill tone="live">{board.today}</Pill>
        </>
      }
      lede="People no programme could take this term. Pick what each of them hears."
    >
      <div className={styles.notice} role="status">
        <Icon name="info" className={styles.noticeIcon} />
        <span>{notice}</span>
      </div>

      <div className={`${kit.mono} ${shared.eyebrow} ${styles.sectionLabel}`}>Free places</div>
      <div className={styles.places}>
        {board.programmes.map((programme) => (
          <Place key={programme.id} programme={programme} />
        ))}
      </div>

      <div className={`${shared.card} ${styles.people}`}>
        <div className={styles.toolbar}>
          <div className={styles.filters} role="group" aria-label="Show pooled applicants by 1st choice">
            <button
              type="button"
              className={filter === "all" ? `${styles.filter} ${styles.filterOn}` : styles.filter}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All
              <span className={styles.filterCount}>{board.rows.length}</span>
            </button>
            {board.programmes.map((programme) => (
              <button
                key={programme.id}
                type="button"
                className={
                  filter === programme.id ? `${styles.filter} ${styles.filterOn}` : styles.filter
                }
                aria-pressed={filter === programme.id}
                onClick={() => setFilter(programme.id)}
              >
                {programme.shortName}
                <span className={styles.filterCount}>{programme.firstChoice}</span>
              </button>
            ))}
          </div>
          <span className={styles.toolbarNote}>Invitations only go to programmes with free places.</span>
        </div>

        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={kit.mono}>
                  Person
                </th>
                <th scope="col" className={kit.mono}>
                  Ranked
                </th>
                <th scope="col" className={kit.mono}>
                  Why
                </th>
                <th scope="col" className={kit.mono}>
                  Could suit
                </th>
                <th scope="col" className={kit.mono}>
                  Reviewer’s comment
                </th>
                <th scope="col" className={kit.mono}>
                  Outcome
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    {board.rows.length === 0
                      ? "Nobody is pooled yet. People appear here once no programme they ranked has taken them."
                      : "Nobody pooled ranked this programme first."}
                  </td>
                </tr>
              ) : null}
              {shown.map((row) => {
                const value = valueOf(row);
                const options = row.inviteOptions.map((option) => ({
                  value: invite(option.programmeId),
                  label: `Invite to ${option.shortName}`,
                }));
                // What is stored is always offered, even when nothing else can
                // be invited there any more.
                if (row.outcome?.kind === "invite" && !options.some((option) => option.value === value)) {
                  const name =
                    board.programmes.find((programme) => programme.id === value.slice("invite:".length))
                      ?.shortName ?? "that programme";
                  options.unshift({ value, label: `Invite to ${name}` });
                }
                return (
                  <tr key={row.uid}>
                    <td>
                      <div className={styles.person}>
                        <span className={styles.personDisc}>
                          <InitialsChip name={row.name} uid={row.uid} />
                        </span>
                        <div className={styles.personText}>
                          <div className={styles.personName}>{row.name}</div>
                          <div className={styles.personSub}>
                            {row.degree}
                            {row.degree && row.detail ? <br /> : null}
                            {row.detail}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <ol className={styles.ranked}>
                        {row.ranked.map((choice) => (
                          <li key={choice.programmeId} className={styles.rankedItem}>
                            <span className={styles.rank}>{choice.rank}</span>
                            <span>{choice.shortName}</span>
                          </li>
                        ))}
                      </ol>
                    </td>
                    <td>
                      {row.reasons.length > 0 ? (
                        row.reasons.map((reason) => (
                          <div key={reason} className={styles.why}>
                            {reason}
                          </div>
                        ))
                      ) : (
                        <span className={styles.whyNone}>Not given</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.suits}>
                        {row.couldSuit.length > 0 ? (
                          row.couldSuit.map((programme) => (
                            <Pill key={programme} tone="accent">
                              {programme}
                            </Pill>
                          ))
                        ) : (
                          <Pill tone="accent">Next term</Pill>
                        )}
                      </div>
                    </td>
                    <td>
                      {row.comments.map((comment, at) => (
                        <div key={at} className={styles.comment}>
                          {comment.text}
                          {comment.by ? <div className={styles.commentBy}>{comment.by}</div> : null}
                        </div>
                      ))}
                    </td>
                    <td>
                      <div className={styles.outcome}>
                        <Select
                          aria-label={`Outcome for ${row.name}`}
                          value={value}
                          disabled={!hydrated || busy || sent || row.told}
                          onChange={(event) => pick(row, event.target.value)}
                        >
                          {value === "" ? (
                            <option value="" disabled>
                              Pick an outcome
                            </option>
                          ) : null}
                          {options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          <option value={NO_OFFER}>No offer this time</option>
                        </Select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {problem ? (
          <div className={styles.problem}>
            <p className={shared.problem} role="alert">
              {problem}
            </p>
          </div>
        ) : null}

        <div className={styles.footer}>
          <div className={styles.totals}>
            <div className={styles.totalsLine}>{poolTotalsLine(board.counts)}</div>
            <p className={styles.totalsNote}>
              Showing {shown.length} of {board.rows.length}. Anyone without an invitation gets “No
              offer this time”.
            </p>
            {waiting > 0 && !sent ? (
              <button
                type="button"
                className={`${shared.quiet} ${styles.everyone}`}
                disabled={!hydrated || busy}
                onClick={() =>
                  void save({ everyoneWithoutOne: true, outcome: { kind: "no-offer" } })
                }
              >
                Set “No offer this time” for the {waiting} {waiting === 1 ? "person" : "people"} with
                nothing picked
              </button>
            ) : null}
          </div>
          <div className={styles.footerActions}>
            <span className={styles.saved} role="status">
              {saving === "saved" ? (
                <>
                  <Icon name="check" size={16} weight={2.6} className={styles.savedTick} />
                  Saved
                </>
              ) : null}
              {saving === "saving" ? "Saving…" : null}
              {saving === "failed" ? <span className={styles.savedFailed}>Not saved</span> : null}
            </span>
            <Link
              className={shared.secondary}
              href={`/admin/admissions/forms/${encodeURIComponent(board.roundId)}/send`}
            >
              <Icon name="mail" />
              <span>Preview the emails</span>
            </Link>
          </div>
        </div>
      </div>

      {board.left.length > 0 ? (
        <section className={styles.leftSection} aria-labelledby="pool-left-title">
          <h2
            id="pool-left-title"
            className={`${kit.mono} ${shared.eyebrow} ${styles.sectionLabel} ${styles.leftTitle}`}
          >
            Withdrawn since decision day
          </h2>
          <div className={`${shared.card} ${styles.left}`}>
            <p className={styles.leftNote}>
              {board.left.length === 1 ? "This person was" : "These people were"} told on decision day and
              {board.left.length === 1 ? " has" : " have"} since given a place or an invitation back. They
              are in none of the numbers above.
            </p>
            <ul className={styles.leftList}>
              {board.left.map((row) => (
                <li key={row.uid} className={styles.leftRow}>
                  <div className={styles.person}>
                    <span className={styles.personDisc}>
                      <InitialsChip name={row.name} uid={row.uid} />
                    </span>
                    <div className={styles.personText}>
                      <div className={styles.personName}>{row.name}</div>
                      <div className={styles.leftSub}>
                        {[row.degree, row.detail].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <div className={styles.leftWhy}>
                    <div className={styles.leftSaid}>
                      <Pill tone="warn" dot>
                        Withdrawn
                      </Pill>
                      <span>
                        Said “{row.said}”{row.programme ? ` to ${row.programme}` : ""}
                      </span>
                    </div>
                    <p className={styles.leftReason}>{row.reason ?? "No reason given"}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </Page>
  );
}
