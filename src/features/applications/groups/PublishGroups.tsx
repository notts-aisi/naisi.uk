"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActionToast, { useActionToast } from "@/components/ui/ActionToast";
import InitialsChip from "@/components/ui/InitialsChip";
import AllocationPublish from "@/features/courses/AllocationPublish";
import { boardTally } from "@/features/courses/allocationTally";
import { useAllocation } from "@/features/courses/useAllocation";
import type { PreviewEmail, PreviewKind, PublishPreview } from "@/lib/courses/getReady/preview";
import {
  AFTER_YOU_PUBLISH,
  EMAILS_LOADING,
  EMAIL_CARD,
  EMAIL_FIELD,
  NAMES_SHOWN,
  NOBODY_OWED,
  THE_EMAIL,
  emailCountWords,
  moreNamesWords,
  namesInWords,
} from "@/lib/courses/getReady/words";
import { emailsLabel, publishConfirmText, publishResultLines } from "@/lib/courses/publishWords";
import styles from "./PublishGroups.module.css";

/**
 * PUBLISH, ON ITS OWN PAGE (board st-publish), below its readiness check:
 * the two emails as each person will get them, then who a press reaches,
 * "Send a test to me" and "Publish and send 37 emails".
 *
 * THE EMAILS are Publish's own, read from the preview route
 * (`/api/courses/runs/[runId]/allocation/publish/preview`): who a press
 * emails of each kind, by name, and the first email of each, drawn as the
 * mail door draws it. The email itself is shown in a frame that runs no
 * script, as Email designs shows one.
 *
 * THE BUTTONS are Publish as the run's allocation board draws it: the same
 * Publish area (`AllocationPublish`), the same routes and the same rules,
 * read from the board's own summary (`useAllocation`), so the number on the
 * button is the number a press sends, and the server refuses a press whose
 * number is no longer true. After a test or a press, the emails, the
 * summary and the readiness check above are all read again.
 */

type Props = {
  runId: string;
};

/** A frame that grows to the email inside it, which runs no script. */
function EmailFrame({ email }: { email: PreviewEmail }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const fit = useCallback(() => {
    const doc = frame.current?.contentDocument;
    const tall = doc?.documentElement?.scrollHeight ?? 0;
    if (tall > 0) setHeight(tall);
  }, []);
  return (
    <iframe
      ref={frame}
      srcDoc={email.html}
      title={`${THE_EMAIL}: ${email.subject}`}
      className={styles.frame}
      style={height ? { height: `${height}px` } : undefined}
      sandbox="allow-same-origin"
      onLoad={fit}
    />
  );
}

function EmailCard({
  id,
  title,
  line,
  kind,
}: {
  id: string;
  title: string;
  line: string;
  kind: PreviewKind | null;
}) {
  const shown = kind ? kind.names.slice(0, NAMES_SHOWN) : [];
  const rest = kind ? kind.names.slice(NAMES_SHOWN) : [];
  return (
    <section className={styles.emailCard} aria-labelledby={id}>
      <div className={styles.emailWho}>
        <div className={styles.emailHead}>
          <h2 id={id} className={styles.cardTitle}>
            {title}
          </h2>
          {kind ? (
            <span className={`${styles.chip} ${kind.emails > 0 ? styles.chipOk : styles.chipNone}`}>
              <span className={styles.chipDot} aria-hidden="true" />
              {emailCountWords(kind.emails)}
            </span>
          ) : null}
        </div>
        <p className={styles.cardLine}>{line}</p>
        {kind === null ? (
          <p className={styles.cardLine}>{EMAILS_LOADING}</p>
        ) : kind.emails === 0 ? (
          <p className={styles.cardLine}>{NOBODY_OWED}</p>
        ) : (
          <>
            <ul className={styles.names}>
              {shown.map((person) => (
                <li key={person.uid} className={styles.name}>
                  <InitialsChip name={person.name} uid={person.uid} size="sm" />
                  <span>{person.name}</span>
                </li>
              ))}
            </ul>
            {rest.length > 0 ? (
              <details className={styles.more}>
                <summary className={styles.moreSummary}>{moreNamesWords(rest.length)}</summary>
                <p className={styles.moreNames}>{namesInWords(rest.map((person) => person.name))}</p>
              </details>
            ) : null}
          </>
        )}
      </div>
      {kind?.email ? (
        <div className={styles.emailSide}>
          <h3 className={styles.eyebrow}>{THE_EMAIL}</h3>
          <div className={styles.letter}>
            <dl className={styles.envelope}>
              <div className={styles.envelopeRow}>
                <dt>{EMAIL_FIELD.from}</dt>
                <dd>{kind.email.from}</dd>
              </div>
              {kind.email.replyTo ? (
                <div className={styles.envelopeRow}>
                  <dt>{EMAIL_FIELD.replyTo}</dt>
                  <dd>{kind.email.replyTo}</dd>
                </div>
              ) : null}
              <div className={styles.envelopeRow}>
                <dt>{EMAIL_FIELD.to}</dt>
                <dd>{kind.email.to}</dd>
              </div>
              <div className={styles.envelopeRow}>
                <dt>{EMAIL_FIELD.subject}</dt>
                <dd className={styles.subject}>{kind.email.subject}</dd>
              </div>
            </dl>
            <EmailFrame email={kind.email} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function PublishGroups({ runId }: Props) {
  const router = useRouter();
  const { data, error, reload, publishAllocation, sendPublishTest } = useAllocation(runId);
  const { toast, run: runAction, dismiss } = useActionToast();
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [previewProblem, setPreviewProblem] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string[]>([]);
  const [unplaced, setUnplaced] = useState<string[]>([]);

  // The two emails, read again after every test and press.
  useEffect(() => {
    let live = true;
    fetch(`/api/courses/runs/${encodeURIComponent(runId)}/allocation/publish/preview`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (PublishPreview & { error?: string }) | null;
        if (!live) return;
        if (!response.ok || !body || !body.people) {
          setPreviewProblem(body?.error ?? "The emails couldn’t be read. Reload the page to try again.");
          return;
        }
        setPreviewProblem(null);
        setPreview(body);
      })
      .catch(() => {
        if (live) setPreviewProblem("The emails couldn’t be read. Reload the page to try again.");
      });
    return () => {
      live = false;
    };
  }, [runId, version]);

  /** Everything on the page, read again: the summary, the emails, and the readiness check above. */
  const readAgain = useCallback(() => {
    reload();
    setVersion((n) => n + 1);
    router.refresh();
  }, [reload, router]);

  const groupIds = useMemo(() => new Set((data?.groups ?? []).map((group) => group.id)), [data]);
  // Who Publish waits for, by the board's own count: the run's people with no
  // group that still meets, who have not left and have not given their place back.
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
        readAgain();
      }
    })();
  }, [sendPublishTest, readAgain]);

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
        readAgain();
      }
    })();
  }, [data, tally, publishAllocation, runAction, readAgain]);

  const peopleLine = preview?.incubator ? EMAIL_CARD.people.incubatorLine : EMAIL_CARD.people.line;

  return (
    <>
      {previewProblem ? (
        <p className={styles.problem} role="alert">
          {previewProblem}
        </p>
      ) : null}
      <EmailCard id="publish-people-title" title={EMAIL_CARD.people.title} line={peopleLine} kind={preview?.people ?? null} />
      <EmailCard
        id="publish-facilitators-title"
        title={EMAIL_CARD.facilitators.title}
        line={EMAIL_CARD.facilitators.line}
        kind={preview?.facilitators ?? null}
      />
      {preview && preview.refusals.length > 0 ? (
        <div className={styles.unplaced} role="status">
          {preview.refusals.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </div>
      ) : null}
      {unplaced.length > 0 ? (
        <div className={styles.unplaced} role="alert">
          <p className={styles.unplacedTitle}>
            {unplaced.length === 1 ? "1 person has no group" : `${unplaced.length} people have no group`}, so nothing was
            published: {namesInWords(unplaced)}.
          </p>
        </div>
      ) : null}
      {data ? (
        <div className={styles.foot}>
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
            note={AFTER_YOU_PUBLISH}
          />
        </div>
      ) : (
        <p className={styles.cardLine}>{error ? error.message : EMAILS_LOADING}</p>
      )}
      <ActionToast toast={toast} onDismiss={dismiss} />
    </>
  );
}
