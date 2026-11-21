"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { FOR_JOINING_ONLINE } from "@/lib/courses/joiningOnline/words";
import { JOIN_ONLINE, LINK_IS_HERE } from "@/lib/courses/sessionChange/words";
import type { OverviewVisit } from "@/lib/courses/visit/view";
import { CANCEL_THE_VISIT, CANCEL_THIS_VISIT, KEEP_IT, cancelOutcomeLine } from "@/lib/courses/visit/words";
import weekly from "@/features/courses/weekly/weekly.module.css";

/**
 * A ONE-WEEK VISIT ON THE PERSON'S OWN PROGRAMME PAGE: the card for the
 * session they go to, in the approved words the server worked out
 * (`OverviewVisit`), with "I’m joining online" acting on that session
 * (`answers`, the existing ticket's own part) and, until the earlier of the
 * two sessions starts, "Cancel this visit", which asks once and then cancels
 * it (`POST /api/courses/runs/[runId]/visit/cancel`). After cancelling, one
 * line says so, and the page is read again. A cancel that does not happen says
 * one line of its own, chosen from the status and kind alone
 * (`cancelOutcomeLine`): too late, or not gone through with the visit standing;
 * nothing when the visit is already gone, or for somebody signed out.
 */
export default function VisitCard({
  runId,
  visit,
  answers = null,
  locked = false,
  label = "",
}: {
  runId: string;
  visit: OverviewVisit;
  /** "Your next session · week 2" beside the chip, when the visit is their next session; "" draws the chip alone. */
  label?: string;
  /** "I’m joining online", about this session, or nothing. */
  answers?: ReactNode;
  /** A view-as session: the cancel is drawn as the person sees it, and never pressed. */
  locked?: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ids = useId();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setRefused(null);
    let answer: { status: number; kind?: unknown } = { status: 0 };
    try {
      const response = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/visit/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekNumber: visit.weekNumber }),
      });
      const body = (await response.json().catch(() => null)) as { kind?: unknown } | null;
      answer = { status: response.ok ? 200 : response.status, kind: body?.kind };
    } catch {
      // Never reached the server: said as not gone through, the visit standing.
    }
    setBusy(false);
    setAsking(false);
    if (answer.status === 200) setCancelled(true);
    // The line the page says itself, chosen by the status and the kind alone, never the server's words.
    else setRefused(cancelOutcomeLine(answer, visit.hostName, visit.firstName));
    router.refresh();
  }

  if (cancelled && visit.cancel) {
    return (
      <section className={weekly.ticket} aria-labelledby={`${ids}-chip`}>
        <p id={`${ids}-chip`} className={weekly.visitDone} role="status">
          {visit.cancel.done}
        </p>
      </section>
    );
  }

  return (
    <section className={weekly.ticket} aria-labelledby={`${ids}-chip`}>
      <div className={weekly.visitBody}>
        <div className={weekly.nextHead}>
          {label && <p className={weekly.ticketEyebrow}>{label}</p>}
          <span id={`${ids}-chip`} className={weekly.visitChip}>
            {visit.chip}
          </span>
        </div>
        <h2 className={weekly.ticketWhen}>{visit.when}</h2>
        {visit.place && <p className={weekly.visitLine}>{visit.place}</p>}
        <p className={weekly.visitLine}>{visit.withLine}</p>
        <p className={weekly.visitLine}>{visit.stillIn}</p>
        {visit.arrangedBy && <p className={weekly.visitLine}>{visit.arrangedBy}</p>}
        {(answers || visit.cancel) && (
          <div className={weekly.ticketActions}>
            {answers}
            {visit.cancel && !asking && (
              <Button type="button" variant="secondary" disabled={!hydrated || busy || locked} onClick={() => setAsking(true)}>
                {CANCEL_THIS_VISIT}
              </Button>
            )}
          </div>
        )}
        {visit.cancel && asking && (
          <div className={weekly.visitConfirm} role="group" aria-labelledby={`${ids}-question`}>
            <p id={`${ids}-question`} className={weekly.visitLine}>
              {visit.cancel.question}
            </p>
            <div className={weekly.ticketActions}>
              <Button type="button" onClick={() => void cancel()} disabled={!hydrated || busy || locked}>
                {CANCEL_THE_VISIT}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAsking(false)} disabled={busy}>
                {KEEP_IT}
              </Button>
            </div>
          </div>
        )}
        {refused ? (
          <p className={weekly.visitNote} role="status">
            {refused}
          </p>
        ) : (
          visit.cancel && <p className={weekly.visitNote}>{visit.cancel.until}</p>
        )}
      </div>
      {visit.meetingUrl && (
        <div className={`${weekly.ticketFoot} ${weekly.joinFoot}`}>
          <a className={weekly.joinButton} href={visit.meetingUrl} target="_blank" rel="noopener noreferrer">
            {JOIN_ONLINE}
          </a>
          <p className={weekly.joinNote}>
            {FOR_JOINING_ONLINE} {LINK_IS_HERE}
          </p>
        </div>
      )}
    </section>
  );
}
