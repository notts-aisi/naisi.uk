"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import {
  ADD_LINK,
  BOX_NOTE,
  EVERY_WEEK,
  LINK_ADDED,
  MEETING_LINK_REFUSAL,
  SAVING,
  addLinkWords,
  joiningCountWords,
  joiningNamesWords,
  linkFieldLabel,
  namesWords,
} from "@/lib/courses/joiningOnline/words";
import type { JoiningOnlineBoxSession } from "@/lib/courses/meetingLink/box";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import facilitator from "./facilitator.module.css";
import styles from "./JoiningOnlineBox.module.css";

/**
 * THE BOX AT THE TOP OF A FACILITATOR'S GROUP PAGE AND REGISTER: for each
 * session still to end where somebody has said they are joining online, who,
 * and while the session has no meeting link, the field to add one ("2 people
 * are joining online on Tue 10 Nov. Add a meeting link for week 2."), for
 * that week or kept for every week. Once the session has a link the box says
 * who is joining online and asks nothing.
 *
 * Worked out on the server by the page that draws it, after its own gate
 * (`joiningOnlineBox`); a saved link asks the server page again. The link is
 * saved through its own route (`POST /api/courses/groups/[groupId]/meeting-link`),
 * which asks the same gate again. Nobody is emailed, and the box never shows
 * a link: the group sees it on their programme page.
 *
 * Every field is uncontrolled and every button stays off until the page has
 * hydrated, so nothing typed before then is lost and no press goes nowhere.
 * `canAdd` is false in a view-as session, where nothing is written.
 */
export default function JoiningOnlineBox({
  groupId,
  sessions,
  canAdd,
}: {
  groupId: string;
  sessions: JoiningOnlineBoxSession[];
  canAdd: boolean;
}) {
  if (sessions.length === 0) return null;
  const asking = sessions.some((session) => !session.hasLink);
  return (
    <section
      className={asking ? `${styles.box} ${styles.asking}` : styles.box}
      aria-label="Joining online"
      data-testid="joining-online-box"
    >
      {sessions.map((session) =>
        session.hasLink ? (
          <div key={session.sessionKey} className={styles.session}>
            <p className={styles.line}>{joiningNamesWords(session.names, session.day)}</p>
          </div>
        ) : (
          <div key={session.sessionKey} className={styles.session}>
            <p className={styles.line}>
              {joiningCountWords(session.names.length, session.day)} {addLinkWords(session.weekNumber)}
            </p>
            <p className={styles.names}>{namesWords(session.names)}</p>
            {canAdd && <LinkForm groupId={groupId} session={session} />}
          </div>
        ),
      )}
      {asking && <p className={styles.note}>{BOX_NOTE}</p>}
    </section>
  );
}

function LinkForm({ groupId, session }: { groupId: string; session: JoiningOnlineBoxSession }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const everyWeek = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaid(null);
    try {
      const response = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/meeting-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionKey: session.sessionKey,
          url: field.current?.value ?? "",
          everyWeek: everyWeek.current?.checked === true,
        }),
      });
      const answer = (await response.json().catch(() => null)) as { error?: unknown } | null;
      if (!response.ok) {
        setSaid({ ok: false, text: typeof answer?.error === "string" && answer.error ? answer.error : MEETING_LINK_REFUSAL.failed });
        return;
      }
      setSaid({ ok: true, text: LINK_ADDED });
      router.refresh();
    } catch {
      setSaid({ ok: false, text: MEETING_LINK_REFUSAL.failed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={save} noValidate>
      <label className={styles.label} htmlFor={`${id}-link`}>
        {linkFieldLabel(session.weekNumber)}
      </label>
      <input
        ref={field}
        id={`${id}-link`}
        name="url"
        type="url"
        inputMode="url"
        autoComplete="off"
        className={styles.input}
        maxLength={GROUP_FIELD_LIMITS.meetingUrl}
        placeholder="https://"
      />
      <label className={styles.everyWeek}>
        <input ref={everyWeek} type="checkbox" name="everyWeek" />
        <span>{EVERY_WEEK}</span>
      </label>
      <div className={styles.foot}>
        <button type="submit" className={facilitator.buttonPrimary} disabled={!hydrated || saving}>
          {saving ? SAVING : ADD_LINK}
        </button>
        <p className={said && !said.ok ? styles.error : styles.status} role="status" aria-live="polite">
          {said?.text ?? ""}
        </p>
      </div>
    </form>
  );
}
