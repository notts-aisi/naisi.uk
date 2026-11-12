"use client";

import { useId, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { londonClockLabel } from "@/lib/courses/londonLabels";
import { firstWordOf } from "@/lib/courses/registerCover/pageModel";
import {
  CHANGE,
  FACILITATORS_RECORD_TITLE,
  NOBODY_RECORDED,
  PRESENCE_CHOICES,
  TAKEN_BY,
  THIS_SESSION,
  presenceWords,
  remindersStoppedWords,
  remindersTitle,
  takenByWords,
  type CoverLineView,
} from "@/lib/courses/registerCover/pageWords";
import type { AttendanceFacilitator, AttendanceFacilitatorRecord, AttendanceSession } from "../useAttendance";
import styles from "./SessionSidePanel.module.css";

/**
 * "THIS SESSION", BESIDE THE REGISTER, for an admin and the programme's lead
 * (the register's read sends the facilitator record to them alone, and this
 * panel is drawn only when it does): who took the register and from when,
 * covering for whom; whether each of the group's facilitators was there,
 * each with its Change (`POST .../attendance/facilitators`, which emails
 * nobody and writes a history row only they are shown); when the reminders
 * to the facilitators stopped; and the check-in and the session report,
 * which sit here for them instead of under the grid.
 *
 * Never drawn for a facilitator, a run's track lead by that alone, somebody
 * given a session or a member.
 */

type Entry = AttendanceFacilitatorRecord[string][number];

/** Every five minutes from the session's start to its end, as instants, for "Arrived late". */
function arrivalTimes(startsAt: string | null, endsAt: string | null): string[] {
  if (!startsAt || !endsAt) return [];
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const out: string[] = [];
  for (let at = start; at <= end && out.length < 200; at += 5 * 60_000) out.push(new Date(at).toISOString());
  return out;
}

export default function SessionSidePanel({
  groupId,
  session,
  cover,
  record,
  facilitators,
  onChanged,
  checkIn,
  report,
}: {
  groupId: string;
  session: AttendanceSession;
  cover: CoverLineView | null;
  record: Entry[];
  facilitators: AttendanceFacilitator[];
  onChanged: () => void;
  checkIn: ReactNode;
  report: ReactNode;
}) {
  const ids = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [state, setState] = useState<"there" | "late" | "not-there">("there");
  const [arrivedAt, setArrivedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Read once: whether the session has started, for whether there is anything to record yet.
  const [now] = useState(() => Date.now());

  // Everybody the record is about: the group's facilitators, and anybody an
  // entry names who is no longer one of them, by name.
  const byUid = new Map<string, Entry>(record.map((entry) => [entry.uid, entry]));
  const people: { uid: string; name: string; entry: Entry | null }[] = [
    ...facilitators.map((each) => ({ uid: each.uid, name: each.name, entry: byUid.get(each.uid) ?? null })),
    ...record.filter((entry) => !facilitators.some((each) => each.uid === entry.uid)).map((entry) => ({ uid: entry.uid, name: entry.name, entry })),
  ];
  const started = session.startsAt !== null && new Date(session.startsAt).getTime() <= now;
  const times = arrivalTimes(session.startsAt, session.endsAt);
  const covering = cover?.covering.map((each) => firstWordOf(each.name)).filter(Boolean) ?? [];

  function startEditing(uid: string, entry: Entry | null) {
    setProblem(null);
    setEditing(uid);
    setState(entry?.state ?? "there");
    setArrivedAt(entry?.arrivedAt ?? times[0] ?? "");
  }

  async function save(uid: string) {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/attendance/facilitators`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          uid,
          state,
          ...(state === "late" ? { arrivedAt } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) {
        setProblem(body?.error ?? `That didn’t go through (${response.status}).`);
        return;
      }
      setEditing(null);
      onChanged();
    } catch {
      setProblem("We couldn’t tell whether that went through. Refresh to see.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={styles.panel} aria-labelledby={`${ids}-title`} data-testid="register-side">
      <h2 id={`${ids}-title`} className={styles.title}>
        {THIS_SESSION}
      </h2>

      {cover && (
        <div className={styles.part}>
          <h3 className={styles.label}>{TAKEN_BY}</h3>
          <p className={styles.value}>{takenByWords(cover)}</p>
        </div>
      )}

      <div className={styles.part}>
        <h3 className={styles.label}>{FACILITATORS_RECORD_TITLE}</h3>
        {people.length === 0 ? (
          <p className={styles.value}>{NOBODY_RECORDED}</p>
        ) : (
          <ul className={styles.list}>
            {people.map((person) => (
              <li key={person.uid} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.value}>
                    {person.entry ? presenceWords(person.entry) : `${person.name}: ${NOBODY_RECORDED.toLowerCase()}`}
                  </span>
                  {started && editing !== person.uid && (
                    <Button
                      variant="secondary"
                     
                      onClick={() => startEditing(person.uid, person.entry)}
                      aria-label={`${CHANGE}: ${person.name}`}
                    >
                      {CHANGE}
                    </Button>
                  )}
                </div>
                {editing === person.uid && (
                  <div className={styles.form}>
                    <label className={styles.fieldLabel} htmlFor={`${ids}-${person.uid}-state`}>
                      {`Was ${person.name} there?`}
                    </label>
                    <Select
                      id={`${ids}-${person.uid}-state`}
                      value={state}
                      disabled={busy}
                      onChange={(event) => setState(event.target.value as typeof state)}
                    >
                      {PRESENCE_CHOICES.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </Select>
                    {state === "late" && times.length > 0 && (
                      <>
                        <label className={styles.fieldLabel} htmlFor={`${ids}-${person.uid}-at`}>
                          Arrived at
                        </label>
                        <Select
                          id={`${ids}-${person.uid}-at`}
                          value={arrivedAt}
                          disabled={busy}
                          onChange={(event) => setArrivedAt(event.target.value)}
                        >
                          {times.map((at) => (
                            <option key={at} value={at}>
                              {londonClockLabel(new Date(at))}
                            </option>
                          ))}
                        </Select>
                      </>
                    )}
                    {problem && (
                      <p className={styles.problem} role="status">
                        {problem}
                      </p>
                    )}
                    <div className={styles.actions}>
                      <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
                        Cancel
                      </Button>
                      <Button onClick={() => void save(person.uid)} disabled={busy}>
                        {busy ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {cover && (
        <div className={styles.part}>
          <h3 className={styles.label}>{remindersTitle(covering)}</h3>
          <p className={styles.value}>{remindersStoppedWords(cover)}</p>
        </div>
      )}

      {checkIn && <div className={styles.part}>{checkIn}</div>}
      {report && <div className={styles.part}>{report}</div>}
    </aside>
  );
}
