"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import kit from "@/features/applications/kit/kit.module.css";
import { TickIcon } from "@/features/applications/apply/icons";
import { useHydrated } from "@/hooks/useHydrated";
import type { ReleaseReason, ReleaseReasonKind } from "@/lib/applications/model";
import {
  RELEASE_REASON_OPTIONS,
  RELEASE_REASON_OTHER_MAX,
  parseReleaseReason,
} from "@/lib/applications/status/reasons";
import type { Reply } from "@/lib/applications/status/replies";
import styles from "./status.module.css";

/**
 * The buttons somebody answers decision day with.
 *
 * Each press posts one word to the reply route and then asks the server to
 * draw the page again, so what is on the screen afterwards is what is stored
 * and never what this component guessed would be. A refusal is shown as the
 * sentence the route answered with, where the buttons are.
 *
 * GIVING A PLACE BACK IS ASKED TWICE. "I can’t make it" and "No thanks" free
 * a place for somebody else and cannot be taken back from this page, so the
 * first press only opens the question and the second one sends. Saying yes
 * (coming, or accepting an invitation) is one press.
 *
 * THE SECOND STEP ASKS WHY. It carries a short list of reasons, with "Other"
 * and a box for a few words, and will not send until one is chosen (and, for
 * "Other", something is written). The reason goes with the reply and the
 * committee reads it: a time that does not work is something they may be able
 * to put right. What may be sent is decided by `parseReleaseReason`, the
 * same function the route asks, so the page refuses exactly what the server
 * would.
 *
 * Nothing here works before the page's scripts have loaded, so every button
 * is disabled until they have, and when an admin is looking at the page as
 * the member.
 *
 * AFTER A REPLY THE HEADING TAKES THE FOCUS. The button that was pressed has
 * usually gone by the time the page is drawn again, and focus left on nothing
 * leaves a screen reader at the top of the document with no word of what
 * happened. `ReplyTitle` is the heading of each screen a reply can lead to,
 * and it takes the focus once, straight after a reply that was recorded and
 * at no other time, so opening the page never moves anybody's focus.
 */

/**
 * True from a reply being recorded until a heading has taken the focus for
 * it. Module state, because the page that is drawn again is the same
 * document: the server sends new content, and this script stays loaded.
 */
let replied = false;

export function ReplyTitle({
  as: Tag,
  className,
  children,
}: {
  as: "h1" | "h2";
  className: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  // After every draw, not only the first: a reply can change this heading's
  // words without replacing the heading.
  useEffect(() => {
    if (!replied) return;
    replied = false;
    heading.current?.focus();
  });
  return (
    <Tag ref={heading} tabIndex={-1} className={className}>
      {children}
    </Tag>
  );
}

const COULD_NOT_REACH = "We couldn’t reach the site, so nothing was recorded. Check your connection and try again.";
const COULD_NOT_RECORD = "We couldn’t record that. Try again in a moment.";

function useReply(roundId: string) {
  const router = useRouter();
  const [sending, setSending] = useState<Reply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redrawing, startRedraw] = useTransition();
  // Held from the press itself, not from the next draw, so two taps landing
  // before the buttons have been disabled still send one reply.
  const inFlight = useRef(false);

  const send = useCallback(
    // `reason` goes with the two replies that give something back, and with no other.
    async (reply: Reply, reason?: ReleaseReason) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setSending(reply);
      setError(null);
      try {
        const response = await fetch(
          `/api/admissions/forms/${encodeURIComponent(roundId)}/application/reply`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(reason ? { reply, reason } : { reply }),
          },
        );
        const answer = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.ok) replied = true;
        else setError(answer?.error ?? COULD_NOT_RECORD);
        // Whatever was answered, the page is drawn again from what is stored.
        startRedraw(() => router.refresh());
      } catch {
        setError(COULD_NOT_REACH);
      } finally {
        inFlight.current = false;
        setSending(null);
      }
    },
    [roundId, router],
  );

  return { send, sending, busy: sending !== null || redrawing, error };
}

function Problem({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className={styles.problem} role="alert">
      {error}
    </p>
  );
}

function ViewingAs() {
  return <p className={styles.note}>You’re viewing this as the member, so you can’t reply for them.</p>;
}

/**
 * The second press of giving a place back: the question, why, the button
 * that sends, and the way out.
 *
 * The reasons are native radios in a fieldset, and "Other" opens a labelled
 * box with its limit said under it. The first reason takes the focus when
 * the step opens, because choosing one is the first thing to do. Pressing the
 * button with no reason, or with "Other" and nothing written, says what is
 * missing and moves the focus to it; nothing is sent.
 */
function GiveBack({
  question,
  confirmLabel,
  keepLabel,
  busy,
  onConfirm,
  onKeep,
}: {
  question: string;
  confirmLabel: string;
  keepLabel: string;
  busy: boolean;
  onConfirm: (reason: ReleaseReason) => void;
  onKeep: () => void;
}) {
  const id = useId();
  const firstReason = useRef<HTMLInputElement | null>(null);
  const otherBox = useRef<HTMLTextAreaElement | null>(null);
  const [chosen, setChosen] = useState<ReleaseReasonKind | null>(null);
  const [left, setLeft] = useState<number>(RELEASE_REASON_OTHER_MAX);
  const [missing, setMissing] = useState<string | null>(null);
  useEffect(() => {
    firstReason.current?.focus();
  }, []);

  const confirm = () => {
    const parsed = parseReleaseReason({ kind: chosen, other: otherBox.current?.value ?? "" });
    if (!parsed.ok) {
      setMissing(parsed.error);
      (chosen === "other" ? otherBox.current : firstReason.current)?.focus();
      return;
    }
    setMissing(null);
    onConfirm(parsed.reason);
  };

  return (
    <div className={styles.actions} role="group" aria-label={question} data-asks="why">
      <p className={styles.note}>{question}</p>
      <fieldset
        className={styles.reasons}
        aria-describedby={missing ? `${id}-why ${id}-missing` : `${id}-why`}
      >
        <legend className={styles.reasonsLegend}>What’s the main reason?</legend>
        <p id={`${id}-why`} className={styles.reasonsHelp}>
          We ask in case we can offer you something that works.
        </p>
        <div className={styles.reasonRows}>
          {RELEASE_REASON_OPTIONS.map((option, at) => {
            const on = option.kind === chosen;
            return (
              <label key={option.kind} className={styles.reasonRow} data-on={on ? "true" : "false"}>
                <input
                  ref={at === 0 ? firstReason : undefined}
                  type="radio"
                  name={`${id}-reason`}
                  className={styles.reasonNative}
                  checked={on}
                  disabled={busy}
                  onChange={() => {
                    setChosen(option.kind);
                    setMissing(null);
                  }}
                />
                <span aria-hidden="true" className={styles.reasonRadio} data-on={on ? "true" : "false"} />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        {chosen === "other" ? (
          <div className={styles.reasonOther}>
            <label htmlFor={`${id}-other`} className={styles.reasonsLegend}>
              Tell us a bit more
            </label>
            <textarea
              ref={otherBox}
              id={`${id}-other`}
              className={styles.reasonBox}
              rows={3}
              maxLength={RELEASE_REASON_OTHER_MAX}
              disabled={busy}
              aria-describedby={`${id}-left`}
              onChange={(event) => {
                setLeft(RELEASE_REASON_OTHER_MAX - event.currentTarget.value.length);
                setMissing(null);
              }}
            />
            <p id={`${id}-left`} className={styles.reasonsHelp}>
              {left} {left === 1 ? "character" : "characters"} left
            </p>
          </div>
        ) : null}
        {missing ? (
          <p id={`${id}-missing`} className={styles.problem} role="alert">
            {missing}
          </p>
        ) : null}
      </fieldset>
      <button type="button" className={styles.outlineSmall} onClick={confirm} disabled={busy}>
        {busy ? "Saving…" : confirmLabel}
      </button>
      <button type="button" className={styles.quiet} onClick={onKeep} disabled={busy}>
        {keepLabel}
      </button>
    </div>
  );
}

/** For somebody holding a place: "I’m coming" (until they have said so) and "I can’t make it". */
export function PlaceReply({
  roundId,
  said,
  locked,
}: {
  roundId: string;
  /** What they have already told us, as a sentence, or null when they have said nothing yet. */
  said: string | null;
  /** An admin is looking at this as the member. */
  locked: boolean;
}) {
  const hydrated = useHydrated();
  const { send, sending, busy, error } = useReply(roundId);
  const [asking, setAsking] = useState(false);
  const off = !hydrated || busy || locked;

  if (asking) {
    return (
      <>
        <Problem error={error} />
        <GiveBack
          question="Give your place back? This frees it for someone else, and you can’t undo it here."
          confirmLabel="Yes, I can’t make it"
          keepLabel="Keep my place"
          busy={busy}
          onConfirm={(reason) => send("cant-make-it", reason)}
          onKeep={() => setAsking(false)}
        />
      </>
    );
  }

  return (
    <div className={styles.actions} data-gap="tight">
      {locked ? <ViewingAs /> : null}
      <Problem error={error} />
      {said ? (
        <p className={styles.said} role="status">
          <TickIcon size={18} />
          <span>{said}</span>
        </p>
      ) : (
        <>
          <button
            type="button"
            className={`${kit.primary} ${styles.primary}`}
            onClick={() => send("coming")}
            disabled={off}
          >
            {sending === "coming" ? "Saving…" : "I’m coming"}
          </button>
          <p className={styles.note}>Optional. It helps us plan groups.</p>
        </>
      )}
      <button type="button" className={styles.quiet} onClick={() => setAsking(true)} disabled={off}>
        I can’t make it
      </button>
      <p className={styles.note}>This frees your place for someone else.</p>
    </div>
  );
}

/**
 * For somebody invited: "Accept your invitation" and "No thanks". Accepting
 * is left off when the route would refuse it, so the page never offers a
 * button that cannot work; "No thanks" is always there.
 */
export function InvitationReply({
  roundId,
  canAccept,
  locked,
}: {
  roundId: string;
  canAccept: boolean;
  locked: boolean;
}) {
  const hydrated = useHydrated();
  const { send, sending, busy, error } = useReply(roundId);
  const [asking, setAsking] = useState(false);
  const off = !hydrated || busy || locked;

  if (asking) {
    return (
      <>
        <Problem error={error} />
        <GiveBack
          question="Turn this invitation down? The place goes to someone else, and you can’t undo it here."
          confirmLabel="Yes, no thanks"
          keepLabel="Go back"
          busy={busy}
          onConfirm={(reason) => send("decline-invitation", reason)}
          onKeep={() => setAsking(false)}
        />
      </>
    );
  }

  return (
    <div className={styles.actions} data-space="above">
      {locked ? <ViewingAs /> : null}
      <Problem error={error} />
      {canAccept ? (
        <button
          type="button"
          className={`${kit.primary} ${styles.primary}`}
          onClick={() => send("accept-invitation")}
          disabled={off}
        >
          {sending === "accept-invitation" ? "Saving…" : "Accept your invitation"}
        </button>
      ) : null}
      <button type="button" className={styles.outlineSmall} onClick={() => setAsking(true)} disabled={off}>
        No thanks
      </button>
    </div>
  );
}
