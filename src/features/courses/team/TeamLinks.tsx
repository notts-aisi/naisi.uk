"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { TEAM_PAGE_LIMITS } from "@/lib/courses/teamPage/model";
import type { TeamLinkView } from "@/lib/courses/teamPage/views";
import {
  ADD_A_LINK,
  ADD_LINK,
  CANCEL,
  LINK_ADDRESS,
  LINK_ADDED,
  LINK_LABEL,
  LINK_LABEL_PLACEHOLDER,
  LINK_PLACEHOLDER,
  LINK_REMOVED,
  NOT_SAVED,
  NO_LINKS_YET,
  OFFLINE,
  REMOVE,
  SAVING,
  TEAM_LINKS,
  removeLinkName,
} from "@/lib/courses/teamPage/words";
import styles from "./team.module.css";

/**
 * "TEAM LINKS" (board in-team): each link's label and address, "Add a link",
 * and for the team's people a way to remove one. The team's links are the
 * team's, so anybody in the team may remove any of them.
 *
 * "Add a link" is an address (`?link=add`), so it opens the form before the
 * page's script has arrived; the form's boxes are uncontrolled and its
 * button waits for the script (`useHydrated`). Who reads what is added is
 * said beside the form, as the privacy policy promises.
 */

type Props = {
  runId: string;
  links: TeamLinkView[];
  /** One of the team's people, on a run that still takes writing. */
  canChange: boolean;
  /** The form is open (`?link=add`). */
  adding: boolean;
  whoLine: string;
};

function Plus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={styles.icon}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function TeamLinks({ runId, links, canChange, adding, whoLine }: Props) {
  const id = useId();
  const hydrated = useHydrated();
  const router = useRouter();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const base = `/api/courses/runs/${encodeURIComponent(runId)}/team/links`;

  async function send(request: () => Promise<Response>, done: string) {
    setBusy(true);
    setSaid(null);
    setProblem(null);
    try {
      const response = await request();
      const answer = (await response.json().catch(() => ({}))) as { error?: unknown };
      if (response.ok) {
        setSaid(done);
        if (done === LINK_ADDED) router.replace(pathname, { scroll: false });
        router.refresh();
      } else {
        setProblem(typeof answer.error === "string" ? answer.error : NOT_SAVED);
      }
    } catch {
      setProblem(OFFLINE);
    }
    setBusy(false);
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.current || busy) return;
    const data = new FormData(form.current);
    const body = JSON.stringify({ label: String(data.get("label") ?? ""), url: String(data.get("url") ?? "") });
    void send(
      () => fetch(`${base}`, { method: "POST", headers: { "Content-Type": "application/json" }, body }),
      LINK_ADDED,
    );
  }

  return (
    <section id="team-links" className={`${styles.card} ${styles.cardSide} ${styles.cardSideRows}`} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={`${styles.h2} ${styles.h2Side}`}>
        {TEAM_LINKS}
      </h2>
      {links.length > 0 ? (
        <ul className={`${styles.rowsSide} ${styles.linkList}`}>
          {links.map((link) => (
            <li key={link.id} className={`${styles.row} ${styles.linkRow}`}>
              <span className={styles.rowLabel}>{link.label}</span>
              <span className={styles.rowValue}>
                <a className={styles.rowLink} href={link.url} title={link.shown} target="_blank" rel="noopener noreferrer">
                  <span className={styles.linkText}>{link.shown}</span>
                </a>
              </span>
              {canChange ? (
                <button
                  type="button"
                  className={styles.removeButton}
                  aria-label={removeLinkName(link.label)}
                  disabled={!hydrated || busy}
                  onClick={() =>
                    void send(() => fetch(`${base}/${encodeURIComponent(link.id)}`, { method: "DELETE" }), LINK_REMOVED)
                  }
                >
                  {REMOVE}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.quiet}>{NO_LINKS_YET}</p>
      )}

      {canChange && adding ? (
        <form ref={form} className={styles.addForm} onSubmit={add} noValidate>
          <div>
            <label htmlFor={`${id}-label`} className={styles.label}>
              {LINK_LABEL}
            </label>
            <input
              id={`${id}-label`}
              name="label"
              className={styles.input}
              placeholder={LINK_LABEL_PLACEHOLDER}
              maxLength={TEAM_PAGE_LIMITS.linkLabel}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor={`${id}-url`} className={styles.label}>
              {LINK_ADDRESS}
            </label>
            <input
              id={`${id}-url`}
              name="url"
              type="url"
              inputMode="url"
              className={styles.input}
              placeholder={LINK_PLACEHOLDER}
              maxLength={TEAM_PAGE_LIMITS.url}
              autoComplete="off"
            />
          </div>
          <div className={styles.addActions}>
            <button type="submit" className={styles.button} disabled={!hydrated || busy}>
              {busy ? SAVING : ADD_LINK}
            </button>
            <Link href={pathname} scroll={false} className={styles.cancel}>
              {CANCEL}
            </Link>
          </div>
          <p className={styles.who}>{whoLine}</p>
        </form>
      ) : canChange ? (
        <Link href="?link=add#team-links" scroll={false} className={styles.ghostButton}>
          <Plus />
          <span>{ADD_A_LINK}</span>
        </Link>
      ) : null}

      {said ? (
        <p className={styles.said} role="status">
          {said}
        </p>
      ) : null}
      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
