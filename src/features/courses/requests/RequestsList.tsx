"use client";

import Link from "next/link";
import { useState } from "react";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import Select from "@/components/ui/Select";
import Switch from "@/components/ui/Switch";
import { useHydrated } from "@/hooks/useHydrated";
import { EMAIL_ME_ABOUT_REQUESTS, EMAIL_ME_LINE } from "@/lib/courses/excused/words";
import * as V from "@/lib/courses/visitRequest/words";
import * as T from "@/lib/courses/teamAsk/words";
import { CHANGE_GROUP_FOR_GOOD, MOVES_WHO_SEES, moveRequestTitleWords } from "@/lib/courses/moveRequest/words";
import * as R from "@/lib/courses/excused/requestWords";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import type { RequestRow, RequestsPageView } from "@/lib/courses/requests/load";
import { REQUEST_KINDS, isDone, rowsOfKind, tabCounts } from "@/lib/courses/requests/kinds";
import { REQUESTS_PATH, requestPath } from "@/lib/courses/requests/paths";
import styles from "./Requests.module.css";

/**
 * THE REQUESTS PAGE: what facilitators have asked the people running a
 * programme to do, which today is one kind, a correction of a line of a
 * finished register.
 *
 * How many are waiting with nobody on them, being handled and done this
 * week, as three views; for an admin every programme's, with a filter by
 * programme, and for a lead their own programme's (the loader decides which,
 * `loadRequestsPage`). Each row says who asked, about what (the group, the
 * week, the person, from what to what), when, and who has it, and opens the
 * request's own page. Nothing here sends an email.
 *
 * REQUESTS TO BE EXCUSED are an admin's alone (the loader sends a lead
 * none): their own card, each row with the person, the group and the weeks
 * and where each stands, never the reason. Nobody "has" one: there is no
 * Take it for them, so a row says nothing of handling.
 *
 * ONE SECTION PER KIND, each with its own row builder, in the order the
 * page draws them: "Moves and visits" first (requests to go to another
 * session, an admin's alone: who, "One week at another session", from which
 * group to which and the day, when, who has it), then register corrections,
 * then requests to be excused. A later kind adds its own section. The tabs'
 * counts are worked out over every row. Requests to change group for good
 * share "Moves and visits" (an admin's alone: who, "Change group for good",
 * from which group to which, when, who has it), each row its own kind's.
 *
 * MESSAGES TO THE TEAM are an admin's alone too, in their own section after
 * requests to be excused ("Something’s wrong, something else"): who, the
 * topic, the start of what they wrote, when, who has it or who replied. An
 * admin also has a second switch, "Email me about messages to the team",
 * off unless they switch it on.
 *
 * ACCESS NEEDS are an admin's alone, in their own section before messages,
 * tagged "Admins only": who, "Access needs", when, who has it or who
 * replied. A row NEVER carries what was written (the loader's row has no
 * field for it); the ask's own page opens it, and records the opening.
 *
 * NARROWED TO ONE PROGRAMME (`?run=`, from a programme's Overview): the
 * loader has already kept only that run's rows and counted them
 * (`view.filter`), so the page names the programme at the top, with "All
 * requests" beside it to clear the filter, and draws no Programme picker.
 */

type Tab = "waiting" | "handling" | "done";

const TONE: Record<RequestRow["state"], ChipTone> = {
  waiting: "warning",
  handling: "accent",
  approved: "success",
  declined: "neutral",
  withdrawn: "neutral",
  replied: "success",
};

function programmeKey(row: RequestRow): string {
  return `${row.programme.roundId ?? ""} ${row.programme.programmeId ?? ""} ${row.runId}`;
}

export default function RequestsList({
  view,
  emailMe = null,
  emailMeTeam = null,
}: {
  view: RequestsPageView;
  emailMe?: boolean | null;
  /** An admin's own switch for the email about messages to the team; null draws none. */
  emailMeTeam?: boolean | null;
}) {
  const [tab, setTab] = useState<Tab>(view.counts.waiting > 0 || view.counts.handling === 0 ? "waiting" : "handling");
  const hydrated = useHydrated();
  // An admin's own switch for the email about new requests to be excused; null draws none.
  const [emails, setEmails] = useState<boolean | null>(emailMe);
  const [emailsBusy, setEmailsBusy] = useState(false);
  const [emailsProblem, setEmailsProblem] = useState<string | null>(null);

  async function switchEmails(next: boolean) {
    setEmailsBusy(true);
    setEmailsProblem(null);
    try {
      const res = await fetch("/api/courses/requests/emails", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: next }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; on?: boolean; error?: string } | null;
      if (!res.ok || body?.ok !== true) setEmailsProblem(body?.error ?? "That didn’t save. Try again.");
      else setEmails(body.on === true);
    } catch {
      setEmailsProblem("That didn’t save. Try again.");
    } finally {
      setEmailsBusy(false);
    }
  }
  const [teamEmails, setTeamEmails] = useState<boolean | null>(emailMeTeam);
  const [teamEmailsBusy, setTeamEmailsBusy] = useState(false);
  const [teamEmailsProblem, setTeamEmailsProblem] = useState<string | null>(null);

  async function switchTeamEmails(next: boolean) {
    setTeamEmailsBusy(true);
    setTeamEmailsProblem(null);
    try {
      const res = await fetch("/api/courses/requests/emails", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: next, which: "team" }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; on?: boolean; error?: string } | null;
      if (!res.ok || body?.ok !== true) setTeamEmailsProblem(body?.error ?? "That didn’t save. Try again.");
      else setTeamEmails(body.on === true);
    } catch {
      setTeamEmailsProblem("That didn’t save. Try again.");
    } finally {
      setTeamEmailsBusy(false);
    }
  }
  const [programme, setProgramme] = useState<string>("all");

  const programmes = new Map<string, string>();
  // A message to the team belongs to no programme: it adds nothing to the
  // filter, and a programme chosen there shows none (it is in "All" only).
  for (const row of view.rows) if (row.runId !== "") programmes.set(programmeKey(row), row.programme.name || "A programme");
  const inProgramme = view.rows.filter((row) => programme === "all" || programmeKey(row) === programme);
  const inTab = inProgramme.filter((row) => (tab === "waiting" ? row.state === "waiting" : tab === "handling" ? row.state === "handling" : isDone(row.state)));
  // Each section takes its own kind's rows and no other (`rowsOfKind`).
  const shown = rowsOfKind(inTab, REQUEST_KINDS.corrections);
  const excusedShown = rowsOfKind(inTab, REQUEST_KINDS.excused);
  const anyExcused = view.viewer === "admin" && rowsOfKind(view.rows, REQUEST_KINDS.excused).length > 0;
  const visitsShown = rowsOfKind(inTab, REQUEST_KINDS.visits);
  const movesShown = rowsOfKind(inTab, REQUEST_KINDS.moves);
  // "Moves and visits" holds both kinds, each row its own kind's.
  const anyVisits = view.viewer === "admin" && (rowsOfKind(view.rows, REQUEST_KINDS.visits).length > 0 || rowsOfKind(view.rows, REQUEST_KINDS.moves).length > 0);
  const accessShown = rowsOfKind(inTab, REQUEST_KINDS.access);
  const anyAccess = view.viewer === "admin" && rowsOfKind(view.rows, REQUEST_KINDS.access).length > 0;
  const messagesShown = rowsOfKind(inTab, REQUEST_KINDS.messages);
  const anyMessages = view.viewer === "admin" && rowsOfKind(view.rows, REQUEST_KINDS.messages).length > 0;
  // Over every row of the programme chosen, whatever its kind.
  const counts = tabCounts(inProgramme);
  const nothing = view.counts.waiting === 0 && view.counts.handling === 0;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "waiting", label: "Waiting", count: counts.waiting },
    { id: "handling", label: "Being handled", count: counts.handling },
    { id: "done", label: "Done this week", count: counts.done },
  ];

  return (
    <div className={styles.page}>
      <PageHead
        title={P.REQUESTS_TITLE}
        description={P.requestsLede(view.viewer)}
        badges={
          nothing ? (
            <Chip tone="neutral">{P.NOTHING_WAITING}</Chip>
          ) : (
            <Chip tone="warning">{P.waitingChip(view.counts.waiting + view.counts.handling)}</Chip>
          )
        }
      />

      <div className={styles.controls}>
        <div className={styles.tabs} role="tablist" aria-label="Requests">
          {tabs.map((each) => (
            <button
              key={each.id}
              type="button"
              role="tab"
              id={`requests-tab-${each.id}`}
              aria-selected={tab === each.id}
              aria-controls="requests-panel"
              className={tab === each.id ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              onClick={() => setTab(each.id)}
            >
              {each.label} <span className={styles.tabCount}>{each.count}</span>
            </button>
          ))}
        </div>
        {view.filter ? (
          <p className={styles.filterOn} data-testid="requests-filter">
            <span className={styles.filterLabel}>{P.FILTER_PROGRAMME_LABEL}</span>{" "}
            <strong>{view.filter.name || P.A_PROGRAMME}</strong>{" "}
            <Link href={REQUESTS_PATH} className={styles.filterClear}>
              {P.ALL_REQUESTS}
            </Link>
          </p>
        ) : null}
        {!view.filter && view.viewer === "admin" && programmes.size > 0 && (
          <label className={styles.filter}>
            <span className={styles.filterLabel}>Programme</span>
            <Select value={programme} onChange={(event) => setProgramme(event.target.value)}>
              <option value="all">{P.ALL_PROGRAMMES}</option>
              {[...programmes.entries()].map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      {anyVisits && (
        <section className={styles.card} aria-labelledby="requests-visits">
          <h2 id="requests-visits" className={styles.cardTitle}>
            {V.MOVES_AND_VISITS}
          </h2>
          {visitsShown.length === 0 && movesShown.length === 0 ? (
            <p className={styles.line}>{P.NOTHING_IN_THIS_VIEW}</p>
          ) : (
            <ul className={styles.rows} role="list">
              {movesShown.map((row) => (
                <MoveRowItem key={row.id} row={row} />
              ))}
              {visitsShown.map((row) => (
                <VisitRowItem key={row.id} row={row} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section id="requests-panel" role="tabpanel" aria-labelledby={`requests-tab-${tab}`} className={styles.card}>
        <h2 className={styles.cardTitle}>Register corrections</h2>
        {shown.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{tab === "waiting" && nothing ? "No requests waiting" : P.NOTHING_IN_THIS_VIEW}</p>
            <p className={styles.line}>{P.NOTHING_WAITING_LINE}</p>
          </div>
        ) : (
          <ul className={styles.rows} role="list">
            {shown.map((row) => (
              <li key={row.id} className={styles.row} data-testid="request-row">
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>
                    <strong>{row.askedBy.name}</strong> · {P.REGISTER_CORRECTION}
                  </p>
                  <p className={styles.line}>
                    {[
                      view.viewer === "admin" && row.programme.name ? row.programme.name : "",
                      P.requestAbout(row),
                      P.dayAndClock(row.askedAt),
                      row.state === "approved" || row.state === "declined"
                        ? P.decidedWords(row.state, row.decidedBy, row.decidedAt)
                        : P.handlingWords(row.handling, row.mine),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className={styles.rowEnd}>
                  <Chip tone={TONE[row.state]}>{P.stateChip(row.state)}</Chip>
                  <Link href={requestPath(row.id)} className={styles.open} aria-label={`${P.OPEN}: ${row.askedBy.name}’s ${P.REGISTER_CORRECTION.toLowerCase()} about ${row.subject.name}`}>
                    {P.OPEN}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {anyExcused && (
        <section className={styles.card} aria-labelledby="requests-excused" data-testid="requests-excused">
          <h2 id="requests-excused" className={styles.cardTitle}>
            {R.EXCUSED_LIST_TITLE}
          </h2>
          {excusedShown.length === 0 ? (
            <p className={styles.line}>{P.NOTHING_IN_THIS_VIEW}</p>
          ) : (
            <ul className={styles.rows} role="list">
              {excusedShown.map((row) => {
                const weeks = row.weeks ?? [{ sessionKey: "", weekNumber: row.weekNumber, occurrence: row.occurrence, dateKey: row.dateKey, state: row.status }];
                return (
                  <li key={row.id} className={styles.row} data-testid="request-row" data-kind="excused">
                    <div className={styles.rowBody}>
                      <p className={styles.rowTitle}>
                        <strong>{row.subject.name}</strong> · {R.excusedRowKindWords(weeks)}
                      </p>
                      <p className={styles.line}>
                        {[
                          row.programme.name,
                          R.excusedRowAboutWords(row.group.name, weeks),
                          P.dayAndClock(row.askedAt),
                          R.excusedRowWeeksWords(weeks),
                          row.state === "approved" || row.state === "declined" ? P.decidedWords(row.state, row.decidedBy, row.decidedAt) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className={styles.rowEnd}>
                      <Chip tone={TONE[row.state]}>{P.stateChip(row.state)}</Chip>
                      <Link href={requestPath(row.id)} className={styles.open} aria-label={`${P.OPEN}: ${R.requestTitleWords(row.subject.name, weeks)}`}>
                        {P.OPEN}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {anyAccess && (
        <section className={styles.card} aria-labelledby="requests-access">
          <h2 id="requests-access" className={styles.cardTitle}>
            {T.ACCESS_SECTION} <Chip tone="neutral">{T.ADMINS_ONLY}</Chip>
          </h2>
          {accessShown.length === 0 ? (
            <p className={styles.line}>{P.NOTHING_IN_THIS_VIEW}</p>
          ) : (
            <ul className={styles.rows} role="list">
              {accessShown.map((row) => (
                <AccessRowItem key={row.id} row={row} />
              ))}
            </ul>
          )}
        </section>
      )}

      {anyMessages && (
        <section className={styles.card} aria-labelledby="requests-messages">
          <h2 id="requests-messages" className={styles.cardTitle}>
            {T.MESSAGES_SECTION}
          </h2>
          {messagesShown.length === 0 ? (
            <p className={styles.line}>{P.NOTHING_IN_THIS_VIEW}</p>
          ) : (
            <ul className={styles.rows} role="list">
              {messagesShown.map((row) => (
                <MessageRowItem key={row.id} row={row} />
              ))}
            </ul>
          )}
        </section>
      )}

      {emails !== null && (
        <section className={styles.card} aria-label={EMAIL_ME_ABOUT_REQUESTS} data-testid="requests-email-me">
          <Switch
            checked={emails}
            onChange={(next) => void switchEmails(next)}
            disabled={!hydrated || emailsBusy}
            label={EMAIL_ME_ABOUT_REQUESTS}
            description={EMAIL_ME_LINE}
          />
          {emailsProblem && (
            <p className={styles.problem} role="status">
              {emailsProblem}
            </p>
          )}
        </section>
      )}

      {teamEmails !== null && (
        <section className={styles.card} aria-label={T.EMAIL_ME_ABOUT_MESSAGES}>
          <Switch
            checked={teamEmails}
            onChange={(next) => void switchTeamEmails(next)}
            disabled={!hydrated || teamEmailsBusy}
            label={T.EMAIL_ME_ABOUT_MESSAGES}
            description={T.EMAIL_ME_ABOUT_MESSAGES_LINE}
          />
          {teamEmailsProblem && (
            <p className={styles.problem} role="status">
              {teamEmailsProblem}
            </p>
          )}
        </section>
      )}

      <aside className={styles.aside}>
        <h2 className={styles.cardTitle}>Who sees what</h2>
        <p className={styles.line}>
          The lead of a programme sees the corrections asked about their own programme. Admins see every programme’s. Nobody is emailed
          about a correction, and nobody is emailed when one is decided: the facilitator who asked reads the answer on the register.
        </p>
        {view.viewer === "admin" && <p className={styles.line}>{R.EXCUSED_WHO_SEES}</p>}
        {view.viewer === "admin" && <p className={styles.line}>{V.VISITS_WHO_SEES}</p>}
        {view.viewer === "admin" && <p className={styles.line}>{MOVES_WHO_SEES}</p>}
        {view.viewer === "admin" && <p className={styles.line}>{T.MESSAGES_WHO_SEES}</p>}
      </aside>
    </div>
  );
}

/** One request to go to another session, as its row: who, the kind, from which group to which and the day, when, who has it or who decided it. */
function VisitRowItem({ row }: { row: RequestRow }) {
  return (
    <li className={styles.row} data-testid="request-row" data-kind="visit">
      <div className={styles.rowBody}>
        <p className={styles.rowTitle}>
          <strong>{row.subject.name}</strong> · {V.ONE_WEEK_AT_ANOTHER_SESSION}
        </p>
        <p className={styles.line}>
          {[
            [row.programme.name, row.about ?? ""].filter(Boolean).join(", "),
            P.dayAndClock(row.askedAt),
            row.state === "approved" || row.state === "declined"
              ? V.decidedRowWords(row.state, row.decidedBy?.name ?? "", P.dayAndClock(row.decidedAt))
              : P.handlingWords(row.handling, row.mine),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className={styles.rowEnd}>
        <Chip tone={TONE[row.state]}>{P.stateChip(row.state)}</Chip>
        <Link href={requestPath(row.id)} className={styles.open} aria-label={`${P.OPEN}: ${V.requestTitleWords(row.subject.name)}`}>
          {P.OPEN}
        </Link>
      </div>
    </li>
  );
}

/** One message to the team, as its row: who, the topic, the start of what they wrote, when, who has it or who replied. */
function MessageRowItem({ row }: { row: RequestRow }) {
  const topic = row.topic ?? "else";
  return (
    <li className={styles.row} data-testid="request-row" data-kind="team-message">
      <div className={styles.rowBody}>
        <p className={styles.rowTitle}>
          <strong>{row.subject.name}</strong> · {T.TOPIC_SHORT[topic]}
        </p>
        <p className={styles.line}>
          {[
            row.about ? P.quoted(row.about) : "",
            P.dayOf(row.askedAt),
            row.state === "replied" ? T.repliedRowWords(row.decidedBy?.name ?? "") : P.handlingWords(row.handling, row.mine),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className={styles.rowEnd}>
        <Chip tone={TONE[row.state]}>{P.stateChip(row.state)}</Chip>
        <Link href={requestPath(row.id)} className={styles.open} aria-label={`${P.OPEN}: ${T.messageTitleWords(row.subject.name, topic)}`}>
          {P.OPEN}
        </Link>
      </div>
    </li>
  );
}

/** One request to change group for good, as its row: who, the kind, from which group to which, when, who has it or who decided it. */
function MoveRowItem({ row }: { row: RequestRow }) {
  return (
    <li className={styles.row} data-testid="request-row" data-kind="move">
      <div className={styles.rowBody}>
        <p className={styles.rowTitle}>
          <strong>{row.subject.name}</strong> · {CHANGE_GROUP_FOR_GOOD}
        </p>
        <p className={styles.line}>
          {[
            [row.programme.name, row.about ?? ""].filter(Boolean).join(", "),
            P.dayAndClock(row.askedAt),
            row.state === "approved" || row.state === "declined"
              ? V.decidedRowWords(row.state, row.decidedBy?.name ?? "", P.dayAndClock(row.decidedAt))
              : P.handlingWords(row.handling, row.mine),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className={styles.rowEnd}>
        <Chip tone={TONE[row.state]}>{P.stateChip(row.state)}</Chip>
        <Link href={requestPath(row.id)} className={styles.open} aria-label={`${P.OPEN}: ${moveRequestTitleWords(row.subject.name)}`}>
          {P.OPEN}
        </Link>
      </div>
    </li>
  );
}

/** One access ask, as its row: who, "Access needs", when, who has it or who replied. Never what they wrote. */
function AccessRowItem({ row }: { row: RequestRow }) {
  return (
    <li className={styles.row} data-testid="request-row" data-kind="access-needs">
      <div className={styles.rowBody}>
        <p className={styles.rowTitle}>
          <strong>{row.subject.name}</strong> · {T.ACCESS_SECTION}
        </p>
        <p className={styles.line}>
          {[P.dayOf(row.askedAt), row.state === "replied" ? T.repliedRowWords(row.decidedBy?.name ?? "") : P.handlingWords(row.handling, row.mine)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className={styles.rowEnd}>
        <Chip tone={TONE[row.state]}>{P.stateChip(row.state)}</Chip>
        <Link href={requestPath(row.id)} className={styles.open} aria-label={`${P.OPEN}: ${T.accessTitleWords(row.subject.name)}`}>
          {P.OPEN}
        </Link>
      </div>
    </li>
  );
}
