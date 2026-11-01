"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import StaffNameText from "@/components/StaffNameText";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import { Field, Input } from "@/components/ui/Input";
import Notice from "@/components/ui/Notice";
import {
  openPageWords,
  questionLead,
  waitingHeading,
  type AboutKind,
  type SignupRequestView,
  type SignupRequestsAnswer,
} from "@/lib/events/requestWords";
import { askedWords } from "./manageWords";
import styles from "./SignupRequests.module.css";

type Props = {
  eventId: string;
  /**
   * The ids of the requests the whole list's live listener sees waiting,
   * sorted and joined. When they differ from the ones last fetched, somebody
   * asked or somebody decided elsewhere, and the requests are fetched again,
   * each new one with its card. Left out where there is no listener, and
   * while it is still loading.
   */
  refreshKey?: string;
  /** Called after a decision lands, so the whole list can read itself again. */
  onDecided?: () => void | Promise<void>;
};

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; answer: SignupRequestsAnswer };

/**
 * The sorted ids of some requests, as one string: `refreshKey`'s shape, so the
 * whole list and the requests route can tell whether they agree.
 */
export const idsOf = (requests: readonly { id: string }[]) =>
  requests
    .map((request) => request.id)
    .sort()
    .join(",");

/**
 * THE REQUESTS WAITING FOR A DECISION on an event's Sign-ups page. Everything
 * comes from `GET /api/events/[id]/signups`, which decides what this viewer
 * is sent, names included (by the name rule, for the person looking); this
 * fetches it, draws it (`SignupRequestsView`) and sends a decision to the
 * approve or deny route.
 */
export default function SignupRequests({ eventId, refreshKey, onDecided }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [denyFor, setDenyFor] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState("");
  // The ids the last fetch answered with, in `refreshKey`'s shape. A key is
  // fetched for at most once, so a listener a moment behind the route cannot
  // set off one fetch after another.
  const known = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/signups`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as (SignupRequestsAnswer & { error?: string }) | null;
      if (!res.ok || !body || !Array.isArray(body.requests)) {
        setState({ kind: "error", message: body?.error ?? `They didn’t load (${res.status}).` });
        return;
      }
      known.current = idsOf(body.requests);
      setState({ kind: "ready", answer: { requests: body.requests, decides: body.decides === true } });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "They didn’t load." });
    }
  }, [eventId]);

  // Once when the page opens: a second run of the effect (a development
  // double render) does not fetch again.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshKey === undefined || refreshKey === known.current) return;
    known.current = refreshKey;
    void load();
  }, [refreshKey, load]);

  async function decide(id: string, path: "approve" | "deny", note?: string) {
    setBusyId(id);
    setActionErr(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/rsvp/${encodeURIComponent(id)}/${path}`, {
        method: "POST",
        headers: note !== undefined ? { "content-type": "application/json" } : {},
        body: note !== undefined ? JSON.stringify({ note }) : undefined,
      });
      const body = (await res.json().catch(() => null)) as { ok?: true; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setActionErr(body?.error ?? `That didn’t work (${res.status}).`);
        return;
      }
      if (path === "deny") {
        setDenyFor(null);
        setDenyNote("");
      }
      await load();
      await onDecided?.();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : "That didn’t work.");
    } finally {
      setBusyId(null);
    }
  }

  if (state.kind === "loading") {
    return (
      <p className={styles.quiet} aria-busy="true">
        Loading the requests…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <Notice tone="warning" role="alert" title="The requests didn’t load.">
        {state.message}
      </Notice>
    );
  }
  return (
    <SignupRequestsView
      answer={state.answer}
      busyId={busyId}
      actionErr={actionErr}
      denyFor={denyFor}
      denyNote={denyNote}
      onDenyNote={setDenyNote}
      onApprove={(id) => void decide(id, "approve")}
      onTurnDown={(id) => {
        setDenyFor(id);
        setDenyNote("");
      }}
      onConfirmTurnDown={(id) => void decide(id, "deny", denyNote)}
      onCancelTurnDown={() => {
        setDenyFor(null);
        setDenyNote("");
      }}
    />
  );
}

/** A line of the card in its colour. A colour never stands alone: the words say it. */
const TONE: Record<AboutKind, ChipTone> = {
  place: "accent",
  facilitates: "accent",
  offered: "neutral",
  member: "success",
  notMember: "neutral",
  guest: "warning",
};

type ViewProps = {
  answer: SignupRequestsAnswer;
  /** The request a decision is on its way for. */
  busyId: string | null;
  actionErr: string | null;
  /** The request whose "Turn down…" was pressed, which opens its note. */
  denyFor: string | null;
  denyNote: string;
  onDenyNote: (note: string) => void;
  onApprove: (id: string) => void;
  onTurnDown: (id: string) => void;
  onConfirmTurnDown: (id: string) => void;
  onCancelTurnDown: () => void;
};

/**
 * The requests as the route sent them, each saying who is asking: the name
 * by the rule for the viewer, when they asked, a few words about who they
 * are, their answers, and for an admin the way to their page. Approve and
 * Turn down show only where the route says the viewer may decide. Draws
 * nothing it was not handed.
 */
export function SignupRequestsView({
  answer: { requests, decides },
  busyId,
  actionErr,
  denyFor,
  denyNote,
  onDenyNote,
  onApprove,
  onTurnDown,
  onConfirmTurnDown,
  onCancelTurnDown,
}: ViewProps) {
  return (
    <section className={styles.section} aria-labelledby="signup-requests-heading">
      <div>
        <h2 id="signup-requests-heading" className={styles.heading}>
          {waitingHeading(requests.length)}
        </h2>
        {requests.length === 0 ? (
          <p className={styles.hint}>Nobody is waiting. A new request shows here.</p>
        ) : decides ? (
          <p className={styles.hint}>
            An approved request gets a place if there is one left; if the event is full and has a waiting list, it goes
            on the list. Each person is emailed either way.
          </p>
        ) : (
          <p className={styles.hint}>The event’s organisers and the people who approve events decide these.</p>
        )}
      </div>

      {actionErr && (
        <Notice tone="warning" role="alert">
          {actionErr}
        </Notice>
      )}

      {requests.length > 0 && (
        <ul className={styles.grid}>
          {requests.map((request) => (
            <li key={request.id} className={styles.item}>
              <RequestCard
                request={request}
                decides={decides}
                busy={busyId === request.id}
                denying={denyFor === request.id}
                denyNote={denyNote}
                onDenyNote={onDenyNote}
                onApprove={() => onApprove(request.id)}
                onTurnDown={() => onTurnDown(request.id)}
                onConfirmTurnDown={() => onConfirmTurnDown(request.id)}
                onCancelTurnDown={onCancelTurnDown}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestCard({
  request,
  decides,
  busy,
  denying,
  denyNote,
  onDenyNote,
  onApprove,
  onTurnDown,
  onConfirmTurnDown,
  onCancelTurnDown,
}: {
  request: SignupRequestView;
  decides: boolean;
  busy: boolean;
  denying: boolean;
  denyNote: string;
  onDenyNote: (note: string) => void;
  onApprove: () => void;
  onTurnDown: () => void;
  onConfirmTurnDown: () => void;
  onCancelTurnDown: () => void;
}) {
  return (
    <Card padding="md" className={styles.card}>
      <div className={styles.top}>
        <div className={styles.who}>
          <p className={styles.name}>
            <StaffNameText name={request.name} />
            {request.test && (
              <Chip tone="neutral" size="sm" className={styles.test}>
                Test
              </Chip>
            )}
          </p>
          {request.email && <p className={styles.email}>{request.email}</p>}
          {request.askedAt && <p className={styles.asked}>{askedWords(new Date(request.askedAt))}</p>}
        </div>
        {decides && (
          <div className={styles.buttons}>
            <Button variant="secondary" onClick={onTurnDown} disabled={busy}>
              Turn down…
            </Button>
            <Button onClick={onApprove} disabled={busy}>
              Approve
            </Button>
          </div>
        )}
      </div>

      {request.about.length > 0 && (
        <ul className={styles.about} aria-label="Who is asking">
          {request.about.map((line) => (
            <li key={`${line.kind}:${line.words}`}>
              <Chip tone={TONE[line.kind]} size="sm">
                {line.words}
              </Chip>
            </li>
          ))}
        </ul>
      )}

      {request.answers.length > 0 && (
        <ul className={styles.answers}>
          {request.answers.map((line, i) => (
            <li key={i}>
              <span className={styles.question}>{questionLead(line.question)}</span> {line.answer}
            </li>
          ))}
        </ul>
      )}

      {request.page && (
        <Link href={request.page} className={styles.page}>
          {openPageWords(request.name.name)}
        </Link>
      )}

      {decides && denying && (
        <div className={styles.denyBox}>
          <Field
            id={`deny-${request.id}`}
            label="Note to them (optional)"
            hint="They read this: it goes in the email that tells them, as a note from the organiser. It is kept with the sign-up too."
          >
            <Input
              id={`deny-${request.id}`}
              value={denyNote}
              onChange={(e) => onDenyNote(e.target.value)}
              placeholder="e.g. This one is for this term’s fellows. The next social is open to everyone."
              maxLength={500}
            />
          </Field>
          <div className={styles.buttons}>
            <Button variant="danger" onClick={onConfirmTurnDown} disabled={busy}>
              Turn down {request.name.name}
            </Button>
            <Button variant="secondary" onClick={onCancelTurnDown}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
