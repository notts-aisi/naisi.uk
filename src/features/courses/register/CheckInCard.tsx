"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Modal from "@/components/ui/Modal";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";
import type { CheckInRegisterView } from "@/lib/surveys/checkIns/facilitatorView";
import { CHECK_IN_CARD, openButtonWords, openedWords } from "@/lib/surveys/checkIns/words";
import styles from "./CheckInCard.module.css";

/**
 * THE CHECK-IN, ON THE REGISTER: "Last 10 minutes: the check-in", for the
 * session the register's foot finishes, between the grid and the foot. The
 * group's facilitators and admins only: the route answers anybody else (the
 * programme's lead, who reads the register) with a refusal, and the card then
 * draws nothing.
 *
 *  - ON THE SESSION'S DAY, before it is opened: what it is, "Open it for the
 *    6 here" counted from the register as it stands on this screen (marked
 *    present, late or left early, among the rows the route says it can
 *    reach: never the group's facilitators, nor anybody Publish has not told
 *    their group, whom an admin's register shows), and
 *    "Take the register first" while nobody is. The route counts again on the
 *    press and refuses a number that has moved, with the new one.
 *  - WHILE IT IS OPEN: "4 of 6 have sent it", never who; "Show the QR code",
 *    which shows the room the code that opens it signed in; "Close it now",
 *    asked once, never undone; and when it closes by itself.
 *  - ONCE CLOSED: the group's totals from three answers, with how many
 *    answered, never a comment and never who. Beside it, the group's latest
 *    closed check-in before this session's, the same way.
 *
 * Everything shown is the route's (`checkInRegisterView`) but the count on
 * the button, which follows the marks as they are tapped. It asks again while
 * the check-in is open, every half a minute, and after a mark.
 */

export type CheckInCardProps = {
  groupId: string;
  /** The session the register's foot finishes. */
  sessionKey: string;
  /** That session's marks, by uid, as the grid holds them now. */
  marks: Readonly<Record<string, AttendanceStatus>>;
};

const HERE: readonly AttendanceStatus[] = ["present", "late", "left-early"];

/** How often an open check-in's count is asked again, while the page is in front. */
const POLL_MS = 30_000;

/** What was last read, tagged with the request it answered, so a slow answer for another session is never shown. */
type Store = { key: string; view: CheckInRegisterView | null };

export default function CheckInCard({ groupId, sessionKey, marks }: CheckInCardProps) {
  const [store, setStore] = useState<Store>({ key: "", view: null });
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const url = `/api/courses/groups/${encodeURIComponent(groupId)}/check-in?session=${encodeURIComponent(sessionKey)}`;
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as CheckInRegisterView) : null))
      .then((view) => {
        if (!cancelled) setStore({ key: url, view });
      })
      .catch(() => {
        // A card that could not be read draws nothing, and the register is unchanged.
        if (!cancelled) setStore({ key: url, view: null });
      });
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  const view = store.key === url ? store.view : null;
  const open = view?.card?.state === "open";
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, reload]);

  // Somebody marked there after it opened has a row now, so its count moves.
  const marksKey = useMemo(() => JSON.stringify(Object.entries(marks).sort()), [marks]);
  const seenMarks = useRef(marksKey);
  useEffect(() => {
    if (!open || marksKey === seenMarks.current) return;
    seenMarks.current = marksKey;
    const timer = window.setTimeout(reload, 1500);
    return () => window.clearTimeout(timer);
  }, [open, marksKey, reload]);

  const counted = view?.card?.state === "ready" ? view.card.counted : null;
  const here = useMemo(() => {
    if (!counted) return 0;
    return counted.filter((uid) => Object.hasOwn(marks, uid) && HERE.includes(marks[uid])).length;
  }, [marks, counted]);

  async function post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const response = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, data };
  }

  async function onOpen() {
    setBusy(true);
    setLine(null);
    try {
      const { ok, data } = await post("check-in", { session: sessionKey, people: here });
      setLine(ok ? openedWords(typeof data.emailed === "number" ? data.emailed : 0) : typeof data.error === "string" ? data.error : CHECK_IN_CARD.notReached);
    } catch {
      setLine(CHECK_IN_CARD.notReached);
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function onClose() {
    setBusy(true);
    setLine(null);
    try {
      const { ok, data } = await post("check-in/close", { session: sessionKey });
      if (!ok) setLine(typeof data.error === "string" ? data.error : CHECK_IN_CARD.notReached);
      setConfirmClose(false);
    } catch {
      setLine(CHECK_IN_CARD.notReached);
    } finally {
      setBusy(false);
      reload();
    }
  }

  if (!view || (!view.card && !view.last)) return null;
  const card = view.card;

  return (
    <div className={styles.stack} data-testid="check-in">
      {card && (
        <section className={styles.card} aria-labelledby="check-in-title">
          <h3 id="check-in-title" className={styles.title}>
            {card.state === "closed" ? card.heading : CHECK_IN_CARD.title}
          </h3>
          {card.state !== "closed" && <p className={styles.body}>{CHECK_IN_CARD.body}</p>}

          {card.state === "ready" &&
            (here > 0 ? (
              <Button className={styles.open} fullWidth onClick={() => void onOpen()} disabled={busy} data-testid="check-in-open">
                {busy ? CHECK_IN_CARD.opening : openButtonWords(here)}
              </Button>
            ) : (
              <p className={styles.waiting}>{CHECK_IN_CARD.takeRegisterFirst}</p>
            ))}

          {card.state === "open" && (
            <>
              <p className={styles.state}>
                <Chip tone="success" size="sm">
                  {CHECK_IN_CARD.open}
                </Chip>
                <span data-testid="check-in-sent">{card.sent}</span>
              </p>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setShowCode(true)}>
                  {CHECK_IN_CARD.showCode}
                </Button>
                <Button variant="ghost" className={styles.closeNow} onClick={() => setConfirmClose(true)} disabled={busy} data-testid="check-in-close">
                  {CHECK_IN_CARD.closeNow}
                </Button>
              </div>
            </>
          )}

          {card.state === "closed" && (
            <>
              <p className={styles.state}>
                <Chip tone="neutral" size="sm">
                  {CHECK_IN_CARD.closed}
                </Chip>
              </p>
              <Totals totals={card.totals} tooFew={card.tooFew} />
            </>
          )}

          {(card.state === "ready" || card.state === "open") && <p className={styles.note}>{card.closes}</p>}
          {line && (
            <p className={styles.line} role="status">
              {line}
            </p>
          )}
        </section>
      )}

      {view.last && (
        <section className={styles.last} aria-labelledby="check-in-last">
          <h3 id="check-in-last" className={styles.eyebrow}>
            {view.last.heading}
          </h3>
          <Totals totals={view.last.totals} tooFew={view.last.tooFew} />
        </section>
      )}

      {card?.state === "open" && (
        <Modal open={showCode} onClose={() => setShowCode(false)} ariaLabel={CHECK_IN_CARD.codeTitle}>
          {(dismiss) => (
            <div className={styles.code}>
              <h2 className={styles.codeTitle}>{CHECK_IN_CARD.codeTitle}</h2>
              <svg
                className={styles.codeImage}
                viewBox={`0 0 ${card.code.size} ${card.code.size}`}
                shapeRendering="crispEdges"
                role="img"
                aria-label={`QR code for ${card.code.address}`}
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect width={card.code.size} height={card.code.size} fill="#fff" />
                <path fill="#000" d={card.code.d} />
              </svg>
              <p className={styles.body}>{CHECK_IN_CARD.codeLine}</p>
              <Button fullWidth onClick={dismiss}>
                {CHECK_IN_CARD.codeDone}
              </Button>
            </div>
          )}
        </Modal>
      )}

      {card?.state === "open" && (
        <Modal open={confirmClose} onClose={() => setConfirmClose(false)} ariaLabel={CHECK_IN_CARD.closeNow} width="sm">
          {(dismiss) => (
            <div className={styles.confirm}>
              <p className={styles.confirmLine}>{card.confirm}</p>
              <div className={styles.confirmActions}>
                <Button variant="secondary" onClick={dismiss} disabled={busy}>
                  {CHECK_IN_CARD.keepOpen}
                </Button>
                <Button variant="danger" onClick={() => void onClose()} disabled={busy} data-testid="check-in-close-confirm">
                  {busy ? CHECK_IN_CARD.closing : CHECK_IN_CARD.closeNow}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/** A closed check-in's totals, one line of parts, or that there are too few to show. */
function Totals({ totals, tooFew }: { totals: string[] | null; tooFew: string | null }) {
  if (tooFew) return <p className={styles.totals}>{tooFew}</p>;
  if (!totals || totals.length === 0) return null;
  return (
    <p className={styles.totals} data-testid="check-in-totals">
      {totals.map((part, at) => (
        <Fragment key={at}>
          {at > 0 ? " · " : null}
          <span className={styles.part}>{part}</span>
        </Fragment>
      ))}
    </p>
  );
}
