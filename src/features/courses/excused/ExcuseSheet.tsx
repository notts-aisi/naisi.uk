"use client";

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
 * It opens on the request (`AskForm`), which an admin decides, and the form
 * asks first what else they could do that week. Joining their own group's
 * session online, where it is held in a room, is today's "Joining online",
 * unchanged (`JoiningOnline`), drawn beside the line that asks them to
 * confirm they can't; saying they will join online closes the sheet. Going to
 * another group's session that week needs one-week visits, which do not exist
 * yet: when they do, the sessions offered go in the form beside the lines
 * about another group, where it says to email the team today.
 *
 * Sending the request closes the sheet: the page reloads its own data and the
 * card says it is waiting.
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
  /** Today's "Joining online" for this session, or null where joining it online is no real choice. */
  joiningOnline: JoiningOnlineView | null;
  hasLink: boolean;
  locked?: boolean;
  /** Joining online saved, either way: the ticket draws it as the register now stands. */
  onSaidOnline?: (said: boolean) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel={O.cantMakeDayWords(day)} sheet>
      {(dismiss) => (
        <div className={styles.sheet} data-testid="excuse-sheet">
          <div className={styles.sheetHead}>
            <h2 className={styles.sheetTitle}>{O.cantMakeDayWords(day)}</h2>
            <button type="button" className={styles.secondary} onClick={dismiss}>
              {O.CLOSE}
            </button>
          </div>
          <p className={styles.line}>
            {O.askFromWords({ groupName, weekNumber: first.weekNumber, occurrence: first.occurrence, when: first.when })}
          </p>
          <AskForm
            groupId={groupId}
            weeks={weeks}
            facilitatorFirstNames={facilitatorFirstNames}
            mode="before"
            locked={locked}
            onSent={dismiss}
            onlineControl={
              joiningOnline ? (
                <JoiningOnline
                  view={joiningOnline}
                  hasLink={hasLink}
                  locked={locked}
                  onSaidChange={(said) => {
                    onSaidOnline?.(said);
                    if (said) dismiss();
                  }}
                />
              ) : null
            }
          />
        </div>
      )}
    </Modal>
  );
}
