"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import InitialsChip from "@/components/ui/InitialsChip";
import { clockWords, dayWords } from "@/features/events/manageWords";
import { useHydrated } from "@/hooks/useHydrated";
import { isSameSiteDay } from "@/lib/datetime/siteTime";
import {
  NO_NAMES_OFF,
  byWords,
  cameUntickedWords,
  doorCounts,
  howWords,
  notListedWords,
  type DoorRow,
  type NamesOff,
} from "@/lib/events/checkInView";
import WalkInDialog from "./WalkInDialog";
import styles from "./CheckInTab.module.css";

type Props = {
  eventId: string;
  /** Every sign-up the door list shows, and every walk-in. */
  initialRows: DoorRow[];
  /** The people whose names have come off, as counts: counted with who came, never listed. */
  namesOff?: NamesOff;
  /** People who came can be added now: the door is open, or it is within a week after. */
  canAdd: boolean;
  /** The last day somebody can be added: "Sun 8 Nov". */
  addUntil: string | null;
  /** The door has closed: the confirmed who have not come did not come. */
  doorClosed: boolean;
  /** A walk-in's email is still kept (until a week after the event), so the rows say so. */
  emailsKept: boolean;
  /** The event's start, to say a check-in's day only when it is another one. */
  startsAt: string | null;
  /** For the walk-in dialog. */
  eventLine: string;
  emailGoesOn: string;
  /** People can be added, and a walk-in's email is kept, until the event's survey closes, which is sooner than a week. */
  untilSurvey?: boolean;
};

/**
 * Who came (ev-manage), for the people who run check-in: everybody checked
 * in, how and when, with a walk-in's email noted by the day it goes; then the
 * confirmed sign-ups who did not come, behind a disclosure, each with "They
 * came" while people can still be added. Not coming is recorded nowhere and
 * held against nobody.
 *
 * Its numbers are the tab's (`doorCounts`): somebody whose name has come off
 * is counted with who came and listed nowhere, and the confirmed sign-ups
 * with no tick say when some of them came that way.
 *
 * Four columns: Name, How (each way in as itself: "Door list", "Walk-in",
 * "Added later", "Scanned the door code", "From their email", "On the
 * check-in page", or "Checked themselves in" for a record from before the
 * ways were told apart), Checked in by ("Themselves", or who did it) and When.
 * A walk-in who checked themselves in (an account with no sign-up) reads the
 * way they came, as a sign-up who did reads, and nothing under their name:
 * the event's survey reaches the account, so there is no email to keep or to
 * say is missing.
 */
export default function WhoCame({
  eventId,
  initialRows,
  namesOff = NO_NAMES_OFF,
  canAdd,
  addUntil,
  doorClosed,
  emailsKept,
  startsAt,
  eventLine,
  emailGoesOn,
  untilSurvey = false,
}: Props) {
  const hydrated = useHydrated();
  const [rows, setRows] = useState<DoorRow[]>(initialRows);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const here = rows
    .filter((row) => row.checkIn)
    .sort((a, b) => (a.checkIn?.at ?? "").localeCompare(b.checkIn?.at ?? ""));
  const notHere = rows.filter((row) => row.standing === "signed-up" && !row.checkIn);
  const counts = doorCounts(rows, namesOff);
  const start = startsAt ? new Date(startsAt) : null;

  const when = (iso: string) => {
    const at = new Date(iso);
    return start && isSameSiteDay(at, start) ? clockWords(at) : `${dayWords(at)}, ${clockWords(at)}`;
  };

  async function theyCame(row: DoorRow) {
    if (!row.rsvpId) return;
    setPending(row.key);
    setProblem(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-ins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvpId: row.rsvpId, from: "page" }),
      });
      const data = (await res.json().catch(() => ({}))) as { row?: DoorRow; error?: string };
      if (!res.ok || !data.row) throw new Error(data.error ?? "That didn’t save. Try again.");
      const saved = data.row;
      setRows((current) => current.map((r) => (r.key === row.key ? saved : r)));
    } catch (err) {
      setProblem(
        err instanceof TypeError
          ? `${row.name} isn’t added: there’s no connection. Try again.`
          : `${row.name} isn’t added: ${err instanceof Error ? err.message : "it didn’t save."}`,
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.whoCame}>
      <section aria-labelledby="who-came-heading">
        <div className={styles.sectionHead}>
          <h2 id="who-came-heading" className={styles.sectionHeading}>
            Who came <span className={styles.pill}>{counts.here}</span>
          </h2>
          {canAdd && (
            <div className={styles.sectionTools}>
              {addUntil && (
                <span className={styles.until}>
                  {untilSurvey ? `Until the survey closes on ${addUntil}` : `Until ${addUntil}, a week after the event`}
                </span>
              )}
              <Button
                variant="secondary"
                leading={<PlusMark />}
                disabled={!hydrated}
                onClick={() => setAdding(true)}
              >
                Add someone who came
              </Button>
            </div>
          )}
        </div>

        {problem && (
          <p className={styles.problem} role="alert">
            {problem}
          </p>
        )}

        {here.length === 0 ? (
          counts.notListed === 0 && <p className={styles.quiet}>Nobody is checked in yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>Who came, in the order they were checked in</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">How</th>
                  <th scope="col">Checked in by</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {here.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <div className={styles.personCell}>
                        <InitialsChip name={row.name} uid={row.key} size="sm" />
                        <div className={styles.personText}>
                          <span className={styles.personName}>{row.name}</span>
                          {row.standing === "walk-in" && emailsKept && row.checkIn && (row.checkIn.emailGoesAt || row.checkIn.noEmail) && (
                            <span className={styles.personSub}>
                              {row.checkIn.emailGoesAt
                                ? `Email kept for the survey until ${dayWords(new Date(row.checkIn.emailGoesAt))}`
                                : "No email"}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-label="How">{howWords(row)}</td>
                    <td data-label="Checked in by">{row.checkIn ? byWords(row.checkIn) : ""}</td>
                    <td data-label="When">{row.checkIn ? when(row.checkIn.at) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {counts.notListed > 0 && <p className={styles.notListed}>{notListedWords(counts.notListed, here.length > 0)}</p>}
      </section>

      {counts.toCome > 0 && (
        <details className={styles.notHere}>
          <summary className={styles.notHereSummary}>
            {doorClosed ? "Didn’t come" : "Still to come"} <span className={styles.count}>{counts.toCome}</span>
          </summary>
          {counts.cameUnticked > 0 && <p className={styles.notHereNote}>{cameUntickedWords(counts.cameUnticked)}</p>}
          <ul className={styles.notHereList}>
            {notHere.map((row) => (
              <li key={row.key} className={styles.notHereRow}>
                <InitialsChip name={row.name} uid={row.key} size="sm" />
                <span className={styles.personName}>{row.name}</span>
                {canAdd && (
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`${row.name} came`}
                    disabled={!hydrated || pending === row.key}
                    onClick={() => void theyCame(row)}
                  >
                    {pending === row.key ? "Adding…" : "They came"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <WalkInDialog
        open={adding}
        eventId={eventId}
        eventLine={eventLine}
        emailGoesOn={emailGoesOn}
        untilSurvey={untilSurvey}
        from="page"
        onAdded={(row) => {
          setRows((current) => [...current, row]);
          setAdding(false);
        }}
        onCancel={() => setAdding(false)}
      />
    </div>
  );
}

function PlusMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
