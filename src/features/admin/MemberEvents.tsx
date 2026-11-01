"use client";

import { useEffect, useState } from "react";
import Chip from "@/components/ui/Chip";
import { dayWords } from "@/features/events/manageWords";
import {
  PERSON_EVENTS_WORDS,
  PERSON_EVENT_WORDS,
  countsFromWords,
  personEventLine,
  type PersonEventRow,
  type PersonEventsView,
} from "@/lib/events/attendanceWords";
import { REQUEST_WORDS } from "@/lib/events/requestWords";
import styles from "./MemberEvents.module.css";

type Props = { uid: string };

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; view: PersonEventsView };

const STATES = new Set(Object.keys(PERSON_EVENT_WORDS));

/** The route's answer, read defensively: the one place its shape meets the browser. */
function readView(body: unknown): PersonEventsView | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.events)) return null;
  const events = raw.events.flatMap((entry): PersonEventRow[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.eventId !== "string" || typeof row.state !== "string" || !STATES.has(row.state)) return [];
    return [
      {
        eventId: row.eventId,
        title: typeof row.title === "string" ? row.title : "",
        startAt: typeof row.startAt === "string" ? row.startAt : null,
        state: row.state as PersonEventRow["state"],
      },
    ];
  });
  return {
    agreedAt: typeof raw.agreedAt === "string" ? raw.agreedAt : null,
    missed: raw.missed === true,
    events,
  };
}

/**
 * THE EVENTS CARD on an admin's page about one person (privacy v15,
 * "Attendance"): "Didn't come to the last 2 events they had a place at." when
 * that is so, then this academic year's events they signed up for or came to,
 * each with where they stood. Everything comes from
 * `GET /api/admin/members/[uid]/events`, which refuses everybody but an admin
 * and lists nothing for somebody who has not agreed to privacy version 15.
 * Draws nothing it was not handed, and changes nothing.
 */
export default function MemberEvents({ uid }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    // The page can be left while the request is in flight, so its answer is
    // dropped rather than written into an unmounted component.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/members/${encodeURIComponent(uid)}/events`, { cache: "no-store" });
        const view = res.ok ? readView(await res.json().catch(() => null)) : null;
        if (!cancelled) setState(view ? { kind: "ready", view } : { kind: "error" });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <div className={styles.events}>
      <div className={styles.head}>
        <h2 id={`events-${uid}`} className={styles.title}>
          {PERSON_EVENTS_WORDS.title}
        </h2>
        <Chip tone="neutral" size="sm">
          {PERSON_EVENTS_WORDS.admins}
        </Chip>
      </div>
      {state.kind === "loading" && (
        <p className={styles.line} aria-busy="true">
          {PERSON_EVENTS_WORDS.loading}
        </p>
      )}
      {state.kind === "error" && (
        <p className={styles.problem} role="alert">
          {PERSON_EVENTS_WORDS.failed}
        </p>
      )}
      {state.kind === "ready" && <MemberEventsView view={state.view} />}
    </div>
  );
}

/** The card's body, as the route sent it. */
export function MemberEventsView({ view }: { view: PersonEventsView }) {
  if (!view.agreedAt) return <p className={styles.line}>{PERSON_EVENTS_WORDS.notAgreed}</p>;
  return (
    <>
      {view.missed && <p className={styles.missed}>{REQUEST_WORDS.missed}</p>}
      {view.events.length === 0 ? (
        <p className={styles.line}>{PERSON_EVENTS_WORDS.none}</p>
      ) : (
        <ul className={styles.list}>
          {view.events.map((row) => (
            <li key={row.eventId} className={row.state === "missed" ? styles.rowMissed : styles.row}>
              {personEventLine(row.title, row.startAt ? dayWords(new Date(row.startAt)) : null, row.state)}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.rule}>{countsFromWords(dayWords(new Date(view.agreedAt)))}</p>
    </>
  );
}
