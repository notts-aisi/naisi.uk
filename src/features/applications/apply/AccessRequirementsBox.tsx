"use client";

import { useId, useState } from "react";
import { ADMISSION_PRIVATE_FIELD_LIMITS } from "@/lib/firestore/admissionApplicationPrivate";
import { TickIcon } from "./icons";
import type { AccessRequirements } from "./useAccessRequirements";
import form from "./form.module.css";
import styles from "./accessRequirements.module.css";

/**
 * The one optional box on Check and send: anything NAISI should know so the
 * person can take part fully.
 *
 * What goes in it is, in practice, about somebody's health, a disability or
 * who they care for. So it is asked apart from every other question, it says
 * who reads it BEFORE the box and not after, and what is typed never joins
 * the application: `useAccessRequirements` saves it through a route of its
 * own, to a place of its own.
 *
 * THE WORDS ARE A PROMISE. The line under the question says who reads the
 * answer and that it is kept apart, and the code that makes each half true is
 * `src/lib/applications/review/accessRequirements.ts` (only an admin, and
 * every read recorded) and `src/lib/applications/applicant/accessRequirementsDoc.ts`
 * (where it is kept). If either changes, this line changes with it:
 * `tests/applications-d2-zeta-access-requirements.test.mjs` holds them together.
 *
 * The box is uncontrolled, like every text box on the form. It is switched
 * off until what the person wrote before has loaded, because a box that
 * opened empty and then saved would write over an answer they could not see.
 */

/** The question, in the words the older application form asked it in. */
export const ACCESS_REQUIREMENTS_QUESTION =
  "Is there anything we should know so you can take part fully? Rooms, timing, materials, anything at all.";

/** Who reads the answer, and where it is kept. */
export const ACCESS_REQUIREMENTS_WHO_READS =
  "Only NAISI’s admins read this, and it is kept apart from your application. This box is never scored, and leaving it blank does not count against you.";

const MAX = ADMISSION_PRIVATE_FIELD_LIMITS.accessRequirements;

export default function AccessRequirementsBox({ access }: { access: AccessRequirements }) {
  const id = useId();
  const { status } = access;
  // Counted from what is typed. Until something is, the count is of what loaded.
  const [typed, setTyped] = useState<{ loads: number; length: number } | null>(null);
  const length = typed && typed.loads === access.loads ? typed.length : access.first.length;

  return (
    <div className={form.field}>
      <label htmlFor={id} className={form.label}>
        Access requirements<span className={form.optional}> (optional)</span>
      </label>
      <p id={`${id}-q`} className={form.help}>
        {ACCESS_REQUIREMENTS_QUESTION}
      </p>
      <p id={`${id}-w`} className={`${form.help} ${styles.who}`}>
        {ACCESS_REQUIREMENTS_WHO_READS}
      </p>

      {status.kind === "off" ? (
        <p className={styles.note}>
          You’re viewing this as the member, so what they wrote here isn’t shown.
        </p>
      ) : status.kind === "unloaded" ? (
        <div className={styles.note} role="alert">
          <p>
            {status.message} So that nothing is written over it, this box is switched off until it loads.
          </p>
          <button type="button" className={`${form.ghost} ${styles.again}`} onClick={access.reload}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <textarea
            // Drawn afresh when a load lands, so it opens holding what was stored.
            key={access.loads}
            id={id}
            className={form.textarea}
            rows={4}
            defaultValue={access.first}
            maxLength={MAX}
            disabled={status.kind === "loading"}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setTyped({ loads: access.loads, length: value.length });
              access.typed(value);
            }}
            onBlur={access.left}
            aria-describedby={`${id}-q ${id}-w ${id}-c`}
            aria-invalid={status.kind === "failed" ? true : undefined}
          />
          <div className={styles.foot}>
            <span
              role="status"
              className={form.status}
              data-tone={status.kind === "saved" ? "ok" : status.kind === "failed" ? "bad" : undefined}
            >
              {status.kind === "loading" ? "Loading what you wrote before…" : null}
              {status.kind === "saving" ? "Saving…" : null}
              {status.kind === "saved" ? (
                <>
                  <TickIcon />
                  Saved
                </>
              ) : null}
              {status.kind === "failed" ? "Not saved" : null}
            </span>
            <span id={`${id}-c`} className={`${form.count} ${styles.count}`}>
              {length} / {MAX} characters
            </span>
          </div>
          {status.kind === "failed" ? (
            <p className={form.error} role="alert">
              {status.message}{" "}
              {status.final
                ? "What you’ve typed is still on this screen."
                : "What you’ve typed is still on this screen, and we’ll keep trying."}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
