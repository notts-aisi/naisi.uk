"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { FOR_JOINING_ONLINE } from "@/lib/courses/joiningOnline/words";
import { JOIN_ONLINE, LINK_IS_HERE } from "@/lib/courses/sessionChange/words";
import type { OverviewVisit } from "@/lib/courses/visit/view";
import { CANCEL_THE_VISIT, CANCEL_THIS_VISIT, KEEP_IT } from "@/lib/courses/visit/words";
import weekly from "@/features/courses/weekly/weekly.module.css";

/**
 * A ONE-WEEK VISIT ON THE PERSON'S OWN PROGRAMME PAGE: the card for the
 * session they go to, in the approved words the server worked out
 * (`OverviewVisit`), with "I’m joining online" acting on that session
 * (`answers`, the existing ticket's own part) and, until the earlier of the
 * two sessions starts, "Cancel this visit", which asks once and then cancels
 * it (`POST /api/courses/runs/[runId]/visit/cancel`). After cancelling, one
 * line says so, and the page is read again. Nothing else is said: a press the
 * server refuses (the session has started since the page was drawn) reads the
 * page again, and the button and its line are gone.
 */
export default function VisitCard({
  runId,
  visit,
  answers = null,
  locked = false,
}: {
  runId: string;
  visit: OverviewVisit;
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

  async function cancel() {
    setBusy(true);
    try {
      const response = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/visit/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekNumber: visit.weekNumber }),
      });
      if (response.ok) setCancelled(true);
    } catch {
      // Read the page again either way: it says what stands.
    }
    setBusy(false);
    setAsking(false);
    router.refresh();
  }

  if (cancelled && visit.cancel) {
    return (
      <section className={weekly.ticket} aria-labelledby={`${ids}-chip`}>
        <p id={`${ids}-chip`} className={weekly.visitDone} role="status" data-testid="visit-cancelled">
          {visit.cancel.done}
        </p>
      </section>
    );
  }

  return (
    <section className={weekly.ticket} aria-labelledby={`${ids}-chip`} data-testid="visit-card">
      <div className={weekly.visitBody}>
        <span id={`${ids}-chip`} className={weekly.visitChip}>
          {visit.chip}
        </span>
        <h2 className={weekly.ticketWhen}>{visit.when}</h2>
        {visit.place && <p className={weekly.visitLine}>{visit.place}</p>}
        <p className={weekly.visitLine}>{visit.withLine}</p>
        <p className={weekly.visitLine}>{visit.stillIn}</p>
        {visit.arrangedBy && <p className={weekly.visitLine}>{visit.arrangedBy}</p>}
        {(answers || visit.cancel) && (
          <div className={weekly.ticketActions}>
            {answers}
            {visit.cancel && !asking && (
              <Button type="button" variant="secondary" disabled={!hydrated || busy || locked} onClick={() => setAsking(true)} data-testid="visit-cancel">
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
              <Button type="button" onClick={() => void cancel()} disabled={!hydrated || busy || locked} data-testid="visit-cancel-confirm">
                {CANCEL_THE_VISIT}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAsking(false)} disabled={busy}>
                {KEEP_IT}
              </Button>
            </div>
          </div>
        )}
        {visit.cancel && <p className={weekly.visitNote}>{visit.cancel.until}</p>}
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
