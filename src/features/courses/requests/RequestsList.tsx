"use client";

import Link from "next/link";
import { useState } from "react";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import Select from "@/components/ui/Select";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import type { RequestRow, RequestsPageView } from "@/lib/courses/requests/load";
import { requestPath } from "@/lib/courses/requests/paths";
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
 */

type Tab = "waiting" | "handling" | "done";

const TONE: Record<RequestRow["state"], ChipTone> = {
  waiting: "warning",
  handling: "accent",
  approved: "success",
  declined: "neutral",
  withdrawn: "neutral",
};

function programmeKey(row: RequestRow): string {
  return `${row.programme.roundId ?? ""} ${row.programme.programmeId ?? ""} ${row.runId}`;
}

export default function RequestsList({ view }: { view: RequestsPageView }) {
  const [tab, setTab] = useState<Tab>(view.counts.waiting > 0 || view.counts.handling === 0 ? "waiting" : "handling");
  const [programme, setProgramme] = useState<string>("all");

  const programmes = new Map<string, string>();
  for (const row of view.rows) programmes.set(programmeKey(row), row.programme.name || "A programme");
  const inProgramme = view.rows.filter((row) => programme === "all" || programmeKey(row) === programme);
  const shown = inProgramme.filter((row) =>
    tab === "waiting" ? row.state === "waiting" : tab === "handling" ? row.state === "handling" : row.state === "approved" || row.state === "declined",
  );
  const counts = {
    waiting: inProgramme.filter((row) => row.state === "waiting").length,
    handling: inProgramme.filter((row) => row.state === "handling").length,
    done: inProgramme.filter((row) => row.state === "approved" || row.state === "declined").length,
  };
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
        {view.viewer === "admin" && programmes.size > 1 && (
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

      <aside className={styles.aside}>
        <h2 className={styles.cardTitle}>Who sees what</h2>
        <p className={styles.line}>
          The lead of a programme sees the requests about their own programme. Admins see every programme’s. Nobody is emailed about a
          request, and nobody is emailed when one is decided: the facilitator who asked reads the answer on the register.
        </p>
      </aside>
    </div>
  );
}
