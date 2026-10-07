"use client";

import { useState } from "react";
import MemberText from "@/components/ui/MemberText";
import kit from "@/features/applications/kit/kit.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import parts from "./parts.module.css";
import screen from "./ReviewScreen.module.css";
import styles from "./AccessRequirementsBlock.module.css";

/**
 * What an applicant wrote under Access requirements, for an admin.
 *
 * It is a block of its own, drawn only on the payload an admin is sent, and
 * it starts SHUT. The answer is not in the review screen's payload at all:
 * pressing the button asks a route of its own for it, and that route records
 * who opened it and whose it was before it answers
 * (`src/lib/applications/review/accessRequirements.ts`). So an admin who
 * merely opens an application has read nothing, and every read there has been
 * is in the log.
 *
 * Hide puts it away again. Showing it a second time is a second read and is
 * recorded as one.
 *
 * The answer is the applicant's own words, drawn as text and nothing else.
 *
 * The screen keys this block by the applicant, so moving to the next
 * application can never leave the last person's answer on the screen.
 */

type State =
  | { kind: "shut" }
  | { kind: "opening" }
  | { kind: "open"; text: string }
  | { kind: "failed"; message: string };

type Opened = { accessRequirements?: unknown; error?: unknown };

export default function AccessRequirementsBlock({
  apiBase,
  applicantUid,
  firstName,
}: {
  /** `/api/admissions/forms/<round>`, as the review screen is handed it. */
  apiBase: string;
  applicantUid: string;
  firstName: string;
}) {
  const hydrated = useHydrated();
  const [state, setState] = useState<State>({ kind: "shut" });

  const open = async () => {
    setState({ kind: "opening" });
    try {
      const response = await fetch(
        `${apiBase}/applications/${encodeURIComponent(applicantUid)}/access-requirements`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const data = (await response.json().catch(() => ({}))) as Opened;
      if (!response.ok || typeof data.accessRequirements !== "string") {
        setState({
          kind: "failed",
          message: typeof data.error === "string" && data.error ? data.error : "That could not be opened. Try again.",
        });
        return;
      }
      setState({ kind: "open", text: data.accessRequirements });
    } catch {
      setState({ kind: "failed", message: "That could not be opened. Check your connection and try again." });
    }
  };

  return (
    <section className={screen.admin} aria-label="Access requirements">
      <div className={screen.adminHead}>
        <div className={kit.mono}>Access requirements</div>
        <span className={screen.adminLine} aria-hidden="true" />
      </div>
      <div className={`${screen.adminBox} ${styles.box}`}>
        <p className={styles.rule}>
          Only admins see this. It’s kept apart from the application, and leads and reviewers never
          see it.
        </p>
        {state.kind === "open" ? (
          <div className={styles.answer} role="status">
            {state.text ? (
              <MemberText text={state.text} className={styles.text} />
            ) : (
              <p className={styles.empty}>{firstName} left this box empty.</p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={`${parts.quiet} ${styles.button}`}
                onClick={() => setState({ kind: "shut" })}
              >
                Hide
              </button>
              <span className={screen.carefulLogged}>Logged with your name and the time.</span>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className={`${parts.quiet} ${styles.button}`}
              disabled={!hydrated || state.kind === "opening"}
              onClick={open}
            >
              {state.kind === "opening" ? "Opening…" : `Show what ${firstName} wrote`}
            </button>
            <span className={screen.carefulLogged}>
              Opening it is logged with your name and the time.
            </span>
          </div>
        )}
        {state.kind === "failed" ? (
          <p className={screen.error} role="alert">
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
