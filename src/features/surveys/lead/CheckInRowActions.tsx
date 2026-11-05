"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RowOpen, RowRemind } from "@/lib/surveys/checkIns/weekTable";
import { THIS_WEEK_WORDS as WORDS, openedWords, remindedWords } from "@/lib/surveys/checkIns/words";
import styles from "./thisWeek.module.css";

/**
 * WHAT AN ADMIN CAN DO ABOUT ONE SESSION'S CHECK-IN, on the table above the
 * weeks of a programme's Check-ins view: each press through the route that
 * already does it, asked once first, the number it emails on the button.
 *
 *  - Open it, within its window or late (`/api/courses/groups/[groupId]/check-in`,
 *    the register's own route, `late` said when it is), for the number of
 *    people the register marks there as the table was drawn: the route counts
 *    again and refuses a number that has moved, with the new one.
 *  - Close it now (`.../check-in/close`).
 *  - Remind the group's facilitators (`.../check-ins/remind` under the
 *    programme), once a session a day.
 *
 * Every answer is said in a line beside the buttons, and the page is read
 * again, so the row says what is true now.
 */
export default function CheckInRowActions({
  roundId,
  programmeId,
  groupId,
  sessionKey,
  registerHref,
  open,
  close,
  remind,
  takeRegisterFirst,
  note,
  reminded,
}: {
  roundId: string;
  programmeId: string;
  groupId: string;
  sessionKey: string;
  /** The group's register page. */
  registerHref: string;
  open: RowOpen | null;
  close: { label: string; confirm: string } | null;
  remind: RowRemind | null;
  takeRegisterFirst: string | null;
  note: string | null;
  reminded: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"open" | "close" | "remind" | null>(null);
  const [line, setLine] = useState<string | null>(null);

  /** A POST of this body, as every press sends one. */
  const posting = (body: Record<string, unknown>): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  async function press(
    kind: "open" | "close" | "remind",
    confirm: string,
    request: () => Promise<Response>,
    said: (data: Record<string, unknown>) => string,
  ) {
    if (busy || !window.confirm(confirm)) return;
    setBusy(kind);
    setLine(null);
    try {
      const response = await request();
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      setLine(response.ok ? said(data) : typeof data.error === "string" ? data.error : WORDS.notReached);
      router.refresh();
    } catch {
      setLine(WORDS.notReached);
    } finally {
      setBusy(null);
    }
  }

  const count = (data: Record<string, unknown>, key: string) => (typeof data[key] === "number" ? (data[key] as number) : 0);

  return (
    <div className={styles.actions}>
      {open && (
        <div className={styles.action}>
          <button
            type="button"
            className={styles.button}
            disabled={busy !== null}
            onClick={() =>
              void press(
                "open",
                open.confirm,
                () =>
                  fetch(
                    `/api/courses/groups/${encodeURIComponent(groupId)}/check-in`,
                    posting({ session: sessionKey, people: open.people, ...(open.late ? { late: true } : {}) }),
                  ),
                (data) => openedWords(count(data, "emailed")),
              )
            }
          >
            {busy === "open" ? WORDS.opening : open.label}
          </button>
          {open.closes && <span className={styles.aside}>{open.closes}</span>}
        </div>
      )}
      {takeRegisterFirst && (
        <p className={styles.aside}>
          {takeRegisterFirst}{" "}
          <Link href={registerHref} className={styles.link}>
            {WORDS.openRegister}
          </Link>
        </p>
      )}
      {note && <p className={styles.aside}>{note}</p>}
      {close && (
        <button
          type="button"
          className={`${styles.button} ${styles.quiet}`}
          disabled={busy !== null}
          onClick={() =>
            void press(
              "close",
              close.confirm,
              () => fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/check-in/close`, posting({ session: sessionKey })),
              () => WORDS.closed,
            )
          }
        >
          {busy === "close" ? WORDS.closing : close.label}
        </button>
      )}
      {remind && (
        <button
          type="button"
          className={`${styles.button} ${styles.quiet}`}
          disabled={busy !== null}
          onClick={() =>
            void press(
              "remind",
              remind.confirm,
              () =>
                fetch(
                  `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/check-ins/remind`,
                  posting({ groupId, sessionKey, emails: remind.emails }),
                ),
              (data) => remindedWords(count(data, "emailed")),
            )
          }
        >
          {busy === "remind" ? WORDS.sending : remind.label}
        </button>
      )}
      {reminded && <p className={styles.aside}>{reminded}</p>}
      {line && (
        <p className={styles.line} role="status">
          {line}
        </p>
      )}
    </div>
  );
}
