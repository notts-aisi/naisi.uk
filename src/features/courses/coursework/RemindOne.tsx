"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import { remindOneWords } from "@/lib/courses/groupWeekWork/words";
import RemindPanel from "../groupPage/RemindPanel";
import styles from "./reading.module.css";

/**
 * REMIND ONE PERSON ABOUT ONE WEEK, from the reading view's empty state: the
 * group's own Remind, as built (`RemindPanel` and its route,
 * `POST /api/courses/groups/[groupId]/remind`). Pressing "Remind Grace" opens
 * the panel, which asks the route what a press would do and shows who it
 * emails, when they were last reminded, the email word for word and a
 * button that says how many it emails ("Send to 1 person"). Nothing is sent
 * until that button. The route asks its own gate and rule again; after a
 * press the page is read again, so "Last reminded" is the server's.
 */
export default function RemindOne({ groupId, weekNumber, uid, firstName }: { groupId: string; weekNumber: number; uid: string; firstName: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const label = remindOneWords(firstName);
  return (
    <>
      <button
        type="button"
        className={styles.buttonGhost}
        disabled={!hydrated}
        onClick={() => {
          setSaid(null);
          setOpened((n) => n + 1);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}
      <Modal open={open} onClose={() => setOpen(false)} ariaLabel={label} side>
        {(dismiss) =>
          // Drawn only while open: the panel asks the route what a press would do as it mounts.
          open ? (
            <RemindPanel
              key={opened}
              groupId={groupId}
              weekNumber={weekNumber}
              only={{ uid, firstName }}
              onClose={dismiss}
              onDone={(words) => {
                dismiss();
                setSaid(words);
                router.refresh();
              }}
            />
          ) : null
        }
      </Modal>
    </>
  );
}
