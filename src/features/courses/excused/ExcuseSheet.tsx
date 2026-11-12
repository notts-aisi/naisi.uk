"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import * as O from "@/lib/courses/excused/ownWords";
import type { JoiningOnlineView } from "@/lib/courses/joiningOnline/model";
import JoiningOnline from "../weekly/JoiningOnline";
import AskForm, { type AskWeek } from "./AskForm";
import styles from "./Excuse.module.css";

/**
 * "CAN'T MAKE WED 11 NOV?": the short flow behind the card's "Can't make it",
 * phone first (a sheet rising from the bottom on a phone, a dialog wider).
 *
 * FIRST, what else they could do that week. Today that is joining online,
 * where the session is held in a room (today's "Joining online", unchanged,
 * `JoiningOnline`). Going to another group's session that week needs
 * one-week visits, which do not exist yet: when they do, the sessions offered
 * go here, beside joining online, and the way on reads "None of these work:
 * ask to be excused". With nothing to offer first, the sheet opens straight
 * on the request.
 *
 * THEN the request (`AskForm`), which an admin decides. Sending it closes
 * nothing by itself: the page reloads its own data and the card says it is
 * waiting.
 */
export default function ExcuseSheet({
  open,
  onClose,
  day,
  groupId,
  groupName,
  first,
  weeks,
  facilitatorFirstNames,
  joiningOnline,
  hasLink,
  locked = false,
  onSaidOnline,
}: {
  open: boolean;
  onClose: () => void;
  /** "Wed 11 Nov". */
  day: string;
  groupId: string;
  groupName: string;
  /** The session the card is about, as the request's heading names it. */
  first: AskWeek & { when: string };
  weeks: readonly AskWeek[];
  facilitatorFirstNames: readonly string[];
  /** Today's "Joining online" for this session, or null where it is not offered first. */
  joiningOnline: JoiningOnlineView | null;
  hasLink: boolean;
  locked?: boolean;
  /** Joining online saved, either way: the ticket draws it as the register now stands. */
  onSaidOnline?: (said: boolean) => void;
}) {
  const [step, setStep] = useState<"first" | "ask">(joiningOnline ? "first" : "ask");

  return (
    <Modal open={open} onClose={onClose} ariaLabel={step === "first" ? O.cantMakeDayWords(day) : O.ASK_TO_BE_EXCUSED} sheet>
      {(dismiss) => (
        <div className={styles.sheet} data-testid="excuse-sheet">
          <div className={styles.sheetHead}>
            <h2 className={styles.sheetTitle}>{step === "first" ? O.cantMakeDayWords(day) : O.ASK_TO_BE_EXCUSED}</h2>
            <button type="button" className={styles.secondary} onClick={dismiss}>
              {O.CLOSE}
            </button>
          </div>
          {step === "first" && joiningOnline ? (
            <>
              <p className={styles.line}>{O.joinOnlineFirstWords(groupName)}</p>
              {/* The seam: another group's session that week goes here, beside joining online, once visits exist. */}
              <JoiningOnline
                view={joiningOnline}
                hasLink={hasLink}
                locked={locked}
                onSaidChange={(said) => {
                  onSaidOnline?.(said);
                  if (said) dismiss();
                }}
              />
              <button type="button" className={styles.secondaryWide} onClick={() => setStep("ask")} data-testid="excuse-ask-instead">
                {O.ASK_TO_BE_EXCUSED}
              </button>
              <p className={styles.small}>{O.AN_ADMIN_DECIDES}</p>
            </>
          ) : (
            <>
              <p className={styles.line}>
                {O.askFromWords({ groupName, weekNumber: first.weekNumber, occurrence: first.occurrence, when: first.when })}
              </p>
              <AskForm groupId={groupId} weeks={weeks} facilitatorFirstNames={facilitatorFirstNames} mode="before" locked={locked} onSent={dismiss} />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
