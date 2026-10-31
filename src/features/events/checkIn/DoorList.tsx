"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import Notice from "@/components/ui/Notice";
import PageHead from "@/components/ui/PageHead";
import { useHydrated } from "@/hooks/useHydrated";
import {
  NO_NAMES_OFF,
  SELF_OFF_DOOR_LIST,
  STANDING_WORDS,
  cameUntickedWords,
  checkInStamp,
  doorCounts,
  hereWords,
  notListedWords,
  type DoorRow,
  type NamesOff,
} from "@/lib/events/checkInView";
import WalkInDialog from "./WalkInDialog";
import styles from "./DoorList.module.css";

type Props = {
  eventId: string;
  eventTitle: string;
  /** Every sign-up the list shows, and every walk-in, as the server built them. */
  initialRows: DoorRow[];
  /** The people whose names have come off, as counts: counted as here, never listed. */
  namesOff?: NamesOff;
  /** Why nobody can be checked in here right now, or null while the door is open. */
  closedWords: string | null;
  /** The event lets people check themselves in. Off, the list says everyone gives their name here. */
  selfCheckIn: boolean;
  /** The door code as people type it, when the event lets people check themselves in and has one that is on. */
  doorAddress: string | null;
  /** "VR games night · Sun 1 Nov", under the walk-in dialog's heading. */
  eventLine: string;
  /** The day a walk-in's email is deleted: "Sun 8 Nov". */
  emailGoesOn: string;
  /** It goes then because the event's survey closes, before a week has passed. */
  untilSurvey?: boolean;
};

/** How many of the latest check-ins show under the people still to come. */
const JUST_CHECKED_IN = 4;

type Show = "to-come" | "here";

/**
 * The door list on the phone of whoever is on the door (ev-door-phone).
 *
 * Everything arrived with the page. A press of Check in is one small request,
 * and the row moves once the server has the record, so a press on no signal
 * says so and can be pressed again; nothing is shown as checked in that is
 * not. Undo is offered on the last check-in made here, for a wrong tap.
 *
 * Its numbers are the Check-in tab's (`doorCounts`): somebody whose name has
 * come off is counted as here and listed nowhere.
 */
export default function DoorList({
  eventId,
  eventTitle,
  initialRows,
  namesOff = NO_NAMES_OFF,
  closedWords,
  selfCheckIn,
  doorAddress,
  eventLine,
  emailGoesOn,
  untilSurvey = false,
}: Props) {
  const hydrated = useHydrated();
  const [rows, setRows] = useState<DoorRow[]>(initialRows);
  const [show, setShow] = useState<Show>("to-come");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [lastMine, setLastMine] = useState<{ key: string; checkInId: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const counts = doorCounts(rows, namesOff);
  const words = hereWords(counts);
  const needle = query.trim().toLowerCase();
  const matches = (row: DoorRow) => needle === "" || row.name.toLowerCase().includes(needle);

  const toCome = rows.filter((row) => row.standing !== "walk-in" && !row.checkIn);
  const expectedToCome = toCome.filter((row) => row.standing === "signed-up" && matches(row));
  const notConfirmed = toCome.filter((row) => row.standing !== "signed-up" && matches(row));
  const here = rows
    .filter((row) => row.checkIn)
    .sort((a, b) => (b.checkIn?.at ?? "").localeCompare(a.checkIn?.at ?? ""));
  const open = closedWords === null;

  const busy = (key: string) => pending.has(key);
  const setBusy = (key: string, on: boolean) =>
    setPending((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  async function checkIn(row: DoorRow) {
    if (!row.rsvpId) return;
    setProblem(null);
    setBusy(row.key, true);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-ins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvpId: row.rsvpId, from: "door" }),
      });
      const data = (await res.json().catch(() => ({}))) as { row?: DoorRow; error?: string };
      if (!res.ok || !data.row?.checkIn) throw new Error(data.error ?? "it didn’t save.");
      const saved = data.row;
      setRows((current) => current.map((r) => (r.key === row.key ? saved : r)));
      setLastMine({ key: row.key, checkInId: saved.checkIn!.id });
    } catch (err) {
      setProblem(
        err instanceof TypeError
          ? `${row.name} isn’t checked in: there’s no connection. Try again.`
          : `${row.name} isn’t checked in: ${err instanceof Error ? err.message : "it didn’t save."}`,
      );
    } finally {
      setBusy(row.key, false);
    }
  }

  async function undo(row: DoorRow) {
    if (!row.checkIn) return;
    setProblem(null);
    setBusy(row.key, true);
    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/check-ins/${encodeURIComponent(row.checkIn.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "it didn’t save.");
      setRows((current) =>
        row.standing === "walk-in"
          ? current.filter((r) => r.key !== row.key)
          : current.map((r) => (r.key === row.key ? { ...r, checkIn: null } : r)),
      );
      setLastMine(null);
    } catch (err) {
      setProblem(
        err instanceof TypeError
          ? `${row.name} is still checked in: there’s no connection. Try again.`
          : `${row.name} is still checked in: ${err instanceof Error ? err.message : "it didn’t save."}`,
      );
    } finally {
      setBusy(row.key, false);
    }
  }

  function personRow(row: DoorRow, action: "check-in" | "stamp") {
    return (
      <li key={row.key} className={styles.person}>
        <InitialsChip name={row.name} uid={row.key} size="sm" />
        <div className={styles.who}>
          <span className={styles.name}>
            {row.name}
            {action === "stamp" && row.standing === "walk-in" && <Chip tone="neutral">Walk-in</Chip>}
          </span>
          <span className={styles.sub}>
            {action === "stamp" && row.checkIn ? checkInStamp(row.checkIn) : STANDING_WORDS[row.standing]}
          </span>
        </div>
        {action === "check-in" && open && (
          <Button
            size="sm"
            variant="secondary"
            className={styles.action}
            aria-label={`Check in ${row.name}`}
            disabled={!hydrated || busy(row.key)}
            onClick={() => void checkIn(row)}
          >
            {busy(row.key) ? "Checking in…" : "Check in"}
          </Button>
        )}
        {action === "stamp" && lastMine?.key === row.key && (
          <Button
            size="sm"
            variant="ghost"
            className={styles.action}
            aria-label={`Undo checking in ${row.name}`}
            disabled={!hydrated || busy(row.key)}
            onClick={() => void undo(row)}
          >
            <UndoMark />
            Undo
          </Button>
        )}
      </li>
    );
  }

  return (
    <div className={styles.page}>
      <PageHead
        crumb={
          <Link href={`/events/manage/${eventId}/check-in`} className={styles.crumbLink}>
            {eventTitle}
          </Link>
        }
        title="Door list"
      />

      <p className={styles.count} aria-live="polite">
        <span className={styles.countMain}>{words.main}</span>
        {words.walkIns && <span className={styles.countMore}> · {words.walkIns}</span>}
      </p>

      {!selfCheckIn && (
        <Notice tone="neutral" role="note">
          {SELF_OFF_DOOR_LIST}
        </Notice>
      )}
      {closedWords && (
        <Notice tone="neutral" role="note">
          {closedWords}
        </Notice>
      )}
      {problem && (
        <Notice tone="warning" role="alert">
          {problem}
        </Notice>
      )}

      <div className={styles.controls}>
        <div className={styles.toggle} role="group" aria-label="Show">
          <button
            type="button"
            className={show === "to-come" ? `${styles.toggleButton} ${styles.toggleOn}` : styles.toggleButton}
            aria-pressed={show === "to-come"}
            onClick={() => setShow("to-come")}
          >
            To come <span className={styles.toggleCount}>{counts.toCome}</span>
          </button>
          <button
            type="button"
            className={show === "here" ? `${styles.toggleButton} ${styles.toggleOn}` : styles.toggleButton}
            aria-pressed={show === "here"}
            onClick={() => setShow("here")}
          >
            Here <span className={styles.toggleCount}>{counts.here}</span>
          </button>
        </div>
        <label className={styles.search}>
          <span className={styles.srOnly}>Find a name</span>
          <SearchMark />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Find a name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {show === "to-come" ? (
        <>
          {expectedToCome.length > 0 && counts.toCome > 0 ? (
            <>
              {!needle && counts.cameUnticked > 0 && <p className={styles.note}>{cameUntickedWords(counts.cameUnticked)}</p>}
              <ul className={styles.list}>{expectedToCome.map((row) => personRow(row, "check-in"))}</ul>
            </>
          ) : (
            <p className={styles.empty}>
              {needle ? `Nobody called “${query.trim()}” is still to come.` : "Everybody who signed up is here."}
            </p>
          )}
          {notConfirmed.length > 0 && (
            <section aria-labelledby="door-not-confirmed">
              <h2 id="door-not-confirmed" className={styles.listHeading}>
                Not confirmed
              </h2>
              <ul className={styles.list}>{notConfirmed.map((row) => personRow(row, "check-in"))}</ul>
            </section>
          )}
          {here.length > 0 && (
            <section aria-labelledby="door-just-checked-in">
              <h2 id="door-just-checked-in" className={styles.listHeading}>
                Just checked in
              </h2>
              <ul className={styles.list}>
                {here.slice(0, JUST_CHECKED_IN).map((row) => personRow(row, "stamp"))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          {here.filter(matches).length > 0 ? (
            <ul className={styles.list}>{here.filter(matches).map((row) => personRow(row, "stamp"))}</ul>
          ) : (
            (needle || counts.notListed === 0) && (
              <p className={styles.empty}>
                {needle ? `Nobody called “${query.trim()}” is checked in.` : "Nobody is checked in yet."}
              </p>
            )
          )}
          {!needle && counts.notListed > 0 && <p className={styles.note}>{notListedWords(counts.notListed, here.length > 0)}</p>}
        </>
      )}

      {doorAddress && (
        <p className={styles.footnote}>
          People with a place can check themselves in at <strong>{doorAddress}</strong>, or from their email.
        </p>
      )}

      {open && (
        <div className={styles.addBar}>
          <Button
            fullWidth
            leading={<PlusMark />}
            disabled={!hydrated}
            onClick={() => setWalkInOpen(true)}
          >
            Add a walk-in
          </Button>
        </div>
      )}
      <WalkInDialog
        open={walkInOpen}
        eventId={eventId}
        eventLine={eventLine}
        emailGoesOn={emailGoesOn}
        untilSurvey={untilSurvey}
        from="door"
        onAdded={(row) => {
          setRows((current) => [...current, row]);
          if (row.checkIn) setLastMine({ key: row.key, checkInId: row.checkIn.id });
          setWalkInOpen(false);
        }}
        onCancel={() => setWalkInOpen(false)}
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

function SearchMark() {
  return (
    <svg className={styles.searchMark} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UndoMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0 -4)"
      />
    </svg>
  );
}
