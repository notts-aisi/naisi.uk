"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import ActionToast, { useActionToast } from "@/components/ui/ActionToast";
import shared from "@/features/applications/editor/editor.module.css";
import AllocationPublish from "@/features/courses/AllocationPublish";
import { boardTally } from "@/features/courses/allocationTally";
import { useAllocation } from "@/features/courses/useAllocation";
import { emailsLabel, publishConfirmText, publishResultLines } from "@/lib/courses/publishWords";
import styles from "./PublishGroups.module.css";
import { BEFORE_PUBLISH, AFTER_PUBLISH, LOADING, RETRY } from "./peopleInGroupsWords";

/**
 * PUBLISH, on its own page under a programme's Groups tab, reached from
 * People in groups' "Publish groups…" (board st-publish).
 *
 * This page is Publish as it works today, moved off the board: the same
 * Publish area (`AllocationPublish`: who a press emails, the last test, "Send
 * a test to me" and "Publish and send 37 emails"), the same routes and the
 * same rules, which are Publish's own and decided on the server. Somebody
 * still to place is named before anything is pressed, as the board named
 * them (`boardTally`, the count Publish's plan agrees with), and the server
 * names them again if it disagrees.
 *
 * The readiness check and the two emails shown before sending, which the
 * board st-publish also draws, are the next slice's (the Overview checklist
 * and Publish's readiness): they are not drawn here.
 */

type Props = {
  runId: string;
  roundId: string;
  programmeId: string;
  /** "AGI Strategy". */
  programmeName: string;
};

/** "Ada, Grace and Alan". */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function PublishGroups({ runId, roundId, programmeId, programmeName }: Props) {
  const { data, loading, error, reload, publishAllocation, sendPublishTest } = useAllocation(runId);
  const { toast, run: runAction, dismiss } = useActionToast();
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string[]>([]);
  const [unplaced, setUnplaced] = useState<string[]>([]);

  const groupIds = useMemo(() => new Set((data?.groups ?? []).map((group) => group.id)), [data]);
  // Who Publish waits for, by the board's own count: the run's people with
  // no group that still meets, who have not left and have not given their
  // place back.
  const tally = useMemo(
    () => boardTally(data?.people ?? [], (row) => !row.groupId || !groupIds.has(row.groupId)),
    [data, groupIds],
  );

  const handleTest = useCallback(() => {
    setTesting(true);
    setTestNote(null);
    setProblem(null);
    void (async () => {
      try {
        const sent = await sendPublishTest();
        if (!sent.ok) setProblem(sent.error);
        else if (sent.delivery === "held") {
          setTestNote(
            "The test was held, not sent: this copy of the site doesn’t email your address. A held test doesn’t count, so Publish stays locked until one reaches you.",
          );
        } else if (sent.delivery === "suppressed") {
          setTestNote("Your address is on the do-not-email list, so the test was not sent. It doesn’t count as a test.");
        }
      } finally {
        setTesting(false);
      }
    })();
  }, [sendPublishTest]);

  const handlePublish = useCallback(() => {
    if (!data) return;
    if (tally.toPlace.length > 0) {
      setResult([]);
      setUnplaced(tally.toPlace.map((row) => row.displayName || "Applicant"));
      return;
    }
    const summary = data.publish;
    if (
      !window.confirm(
        publishConfirmText({
          runLabel: data.run.label || "this run",
          emails: summary.emails,
          people: summary.people,
          facilitators: summary.facilitators,
          more: summary.more,
          noAddress: summary.noAddress,
          emptyGroups: summary.emptyGroups,
          gaveBack: summary.gaveBack ?? 0,
          republish: data.run.allocationPublishedAt != null,
        }),
      )
    ) {
      return;
    }
    const conflict: { names: string[] } = { names: [] };
    setBusy(true);
    setProblem(null);
    setTestNote(null);
    void (async () => {
      try {
        await runAction(
          async () => {
            const pressed = await publishAllocation(summary.emails);
            if (pressed.ok) {
              setUnplaced([]);
              setResult(publishResultLines(pressed.report));
              return;
            }
            if (pressed.unplaced.length > 0) {
              conflict.names = pressed.unplaced;
              throw new Error("Nothing was sent. Some people still have no group: they are named above the buttons.");
            }
            setProblem(pressed.error);
            throw new Error(pressed.error);
          },
          {
            savingMessage: summary.emails > 0 ? `Publishing and sending ${emailsLabel(summary.emails)}…` : "Publishing…",
            successMessage: "Published. What went is on this page.",
          },
        );
      } finally {
        setBusy(false);
        if (conflict.names.length > 0) {
          setResult([]);
          setUnplaced(conflict.names);
        }
      }
    })();
  }, [data, tally, publishAllocation, runAction]);

  return (
    <div className={styles.page}>
      <Link
        href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/groups`}
        className={styles.back}
      >
        People in groups
      </Link>
      <h2 className={styles.title}>{`Publish ${programmeName}’s groups`}</h2>
      {!data ? (
        <section className={shared.card}>
          {error ? (
            <>
              <p className={shared.cardNote}>{error.message}</p>
              <button type="button" className={shared.btn} onClick={reload} disabled={loading}>
                {RETRY}
              </button>
            </>
          ) : (
            <p className={shared.cardNote}>{LOADING}</p>
          )}
        </section>
      ) : (
        <>
          {unplaced.length > 0 && (
            <div className={styles.unplaced} role="alert">
              <p className={styles.unplacedTitle}>
                {unplaced.length === 1 ? "1 person has no group" : `${unplaced.length} people have no group`}, so nothing was
                published:
              </p>
              <p>{nameList(unplaced)}</p>
              <Link
                href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/groups`}
                className={styles.back}
              >
                Place them in People in groups
              </Link>
            </div>
          )}
          <AllocationPublish
            summary={data.publish}
            publishedAt={data.run.allocationPublishedAt}
            busy={busy}
            testing={testing}
            testNote={testNote}
            problem={problem}
            result={result}
            onTest={handleTest}
            onPublish={handlePublish}
          />
          <p className={styles.note}>{data.run.allocationPublishedAt ? AFTER_PUBLISH : BEFORE_PUBLISH}</p>
        </>
      )}
      <ActionToast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
