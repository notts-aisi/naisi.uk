"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import Notice from "@/components/ui/Notice";
import SectionTabs from "@/components/ui/SectionTabs";
import { useAuth } from "@/auth/AuthProvider";
import { getClientDb } from "@/lib/firebase/client";
import {
  DRAFT_STATUS_LABEL,
  SUBJECT_MAX,
  normalizeDraft,
  type NewsletterDraft,
} from "@/lib/firestore/newsletterDrafts";
import {
  bodyMarkdownToBlocks,
  type Block,
} from "@/lib/firestore/newsletterBlocks";
import {
  canApproveNewsletter,
  canDraftNewsletter,
} from "@/lib/firestore/users";
import {
  approveDraft,
  deleteDraft,
  rejectDraft,
  revertToDraft,
  submitDraftForReview,
  updateDraft,
} from "./draftMutations";
import BlockEditor from "@/components/blocks/BlockEditor";
import { momentOf, reachOf, statusTone } from "./draftWords";
import EmailPreview from "./editor/EmailPreview";
import styles from "../../app/(app)/newsletter/newsletter.module.css";

type Props = {
  draftId: string;
};

type Tab = "compose" | "preview";

export default function DraftEditor({ draftId }: Props) {
  const router = useRouter();
  const { user, role, permissions } = useAuth();
  const [draft, setDraft] = useState<NewsletterDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [tab, setTab] = useState<Tab>("compose");
  const [sendStatus, setSendStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | {
        kind: "sent";
        subscribers: number;
        emails: number;
        pushed: number;
        pushRefusal: string | null;
      }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [testStatus, setTestStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent"; addresses: string[] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    const db = getClientDb();
    const unsub = onSnapshot(
      doc(db, "newsletterDrafts", draftId),
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const next = normalizeDraft(snap.id, snap.data());
        setDraft(next);
        setSubject((cur) => (dirty ? cur : next.subject));
        setBlocks((cur) => {
          if (dirty) return cur;
          if (next.blocks.length > 0) return next.blocks;
          // Legacy draft with only bodyMarkdown — auto-migrate on load.
          if (next.bodyMarkdown.trim()) return bodyMarkdownToBlocks(next.bodyMarkdown);
          return [];
        });
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      },
    );
    return unsub;
    // Snapshot is intentionally not restarted when `dirty` changes; functional
    // setters above read the latest `dirty` via closure of setSubject/setBlocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  const viewer =
    role && (role === "admin" || role === "committee" || role === "member")
      ? { role, permissions }
      : null;
  const canDraft = viewer ? canDraftNewsletter(viewer) : false;
  const canApprove = viewer ? canApproveNewsletter(viewer) : false;

  const isAuthor = !!user && !!draft && draft.authorUid === user.uid;
  const status = draft?.status ?? "draft";
  const editable = useMemo(() => {
    if (!draft) return false;
    if (status === "sent") return false;
    if (status === "pending") return canApprove;
    if (status === "approved") return canApprove;
    return isAuthor || canApprove;
  }, [draft, status, canApprove, isAuthor]);

  const previewName = user?.displayName?.split(" ")[0] ?? "Alex";

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await updateDraft(draft.id, { subject, blocks });
      setDirty(false);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitForReview() {
    if (!draft) return;
    if (!subject.trim() || blocks.length === 0) {
      setError("Add a subject and at least one block before submitting for review.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (dirty) await updateDraft(draft.id, { subject, blocks });
      await submitDraftForReview(draft.id);
      setDirty(false);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      if (dirty) await updateDraft(draft.id, { subject, blocks });
      await approveDraft(draft.id);
      setDirty(false);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!draft) return;
    if (!rejectNote.trim()) {
      setError("Leave a short note so the author knows what to change.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectDraft(draft.id, rejectNote);
      setRejectNote("");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRevertToDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await revertToDraft(draft.id);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not revert");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!draft) return;
    const message =
      draft.status === "sent"
        ? "Permanently delete this sent edition? This removes the record but cannot recall emails that were already sent."
        : "Permanently delete this draft? This can't be undone.";
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      await deleteDraft(draft.id);
      router.push("/newsletter");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  async function onSendTest() {
    if (!draft) return;
    setTestStatus({ kind: "sending" });
    try {
      // Flush pending edits first so the test reflects what's on screen.
      if (dirty) await updateDraft(draft.id, { subject, blocks });
      const res = await fetch(`/api/newsletter/${draft.id}/send-test`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; sentTo?: string[]; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setTestStatus({
          kind: "error",
          message: body?.error ?? `Test send failed (${res.status})`,
        });
        return;
      }
      setTestStatus({ kind: "sent", addresses: body.sentTo ?? [] });
      if (dirty) setDirty(false);
    } catch (err) {
      setTestStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Unknown test-send error",
      });
    }
  }

  async function onOpenPreview() {
    setPreviewBusy(true);
    try {
      const res = await fetch("/api/newsletter/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, blocks, previewName }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        setError(`Preview failed (${res.status})${msg ? `: ${msg.slice(0, 200)}` : ""}`);
        return;
      }
      const html = await res.text();
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        setError("Couldn't open the preview. Check your browser's popup blocker.");
      }
      // Revoke the URL after the new tab has had a chance to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview error");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function onSend() {
    if (!draft) return;
    if (
      !window.confirm(
        "Send this newsletter to every subscribed user, honouring their delivery prefs? You can't unsend.",
      )
    ) {
      return;
    }
    setSendStatus({ kind: "sending" });
    setError(null);
    try {
      const res = await fetch(`/api/newsletter/${draft.id}/send`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | {
            ok?: true;
            sentCount?: number;
            subscribersReached?: number;
            pushed?: number;
            pushRefusal?: string | null;
            failedCount?: number;
            error?: string;
          }
        | null;
      if (!res.ok || !body?.ok) {
        // The route's own sentence, verbatim, and this is where the 409 from a
        // send that is already running or was interrupted lands. It names what
        // to do next (ask an admin), which a generic "Send failed (409)" would
        // turn into a second press of the button.
        setSendStatus({
          kind: "error",
          message: body?.error ?? `Send failed (${res.status})`,
        });
        return;
      }
      setSendStatus({
        kind: "sent",
        subscribers: body.subscribersReached ?? 0,
        emails: body.sentCount ?? 0,
        pushed: body.pushed ?? 0,
        pushRefusal: body.pushRefusal ?? null,
      });
    } catch (err) {
      setSendStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Unknown send error",
      });
    }
  }

  if (loading) {
    return (
      <div className={styles.card}>
        <p className={styles.muted}>Loading draft…</p>
      </div>
    );
  }
  if (notFound || !draft) {
    return (
      <div className={styles.card}>
        <p className={styles.muted}>Draft not found. It may have been deleted.</p>
      </div>
    );
  }

  const author = draft.authorDisplayName ?? "unknown";
  const title = subject.trim() || "(no subject)";

  if (status === "sent") {
    const canDelete = isAuthor || role === "admin";
    const reach = reachOf(draft);
    return (
      <div className={styles.card}>
        <header className={styles.cardHead}>
          <div className={styles.cardHeadMain}>
            <p className="meta">Edition by {author}</p>
            <h2 className={styles.cardTitle}>{title}</h2>
          </div>
          <div className={styles.cardHeadSide}>
            <Badge tone={statusTone(status)}>{DRAFT_STATUS_LABEL[status]}</Badge>
          </div>
        </header>

        <p className={styles.facts}>
          {draft.sentAt && <span className="meta">{momentOf(draft.sentAt)}</span>}
          {draft.sentCount != null && (
            <span>
              {draft.subscribersReached != null
                ? `${reach} (${draft.sentCount} email${draft.sentCount === 1 ? "" : "s"})`
                : reach}
            </span>
          )}
          {/*
            Shown only when somebody was actually notified. Every draft sent
            before the push producer existed has no `pushedCount` at all, and
            a send where nobody has the cell on has a real zero: either way
            "0 by push" would sit beside a successful send reading as a
            failure of something the sender never asked for.
          */}
          {draft.pushedCount != null && draft.pushedCount > 0 && (
            <span>{draft.pushedCount} notified by push</span>
          )}
        </p>

        <EmailPreview subject={subject} blocks={blocks} previewName={previewName} />

        <TestAndPreviewBanner />

        {error && <p className={styles.danger}>{error}</p>}

        <div className={styles.actions}>
          <div className={styles.actionsGroup}>
            <Button
              variant="secondary"
              onClick={onSendTest}
              disabled={testStatus.kind === "sending"}
            >
              {testStatus.kind === "sending" ? "Sending test…" : "Send test to me"}
            </Button>
            <Button variant="ghost" onClick={onOpenPreview} disabled={previewBusy}>
              {previewBusy ? "Opening…" : "Open preview in new tab"}
            </Button>
          </div>
        </div>

        {canDelete && (
          <div className={styles.careful}>
            <Button variant="danger" onClick={onDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete edition"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <header className={styles.cardHead}>
        <div className={styles.cardHeadMain}>
          <p className="meta">
            Draft by {author}
            {draft.approvedBy && status !== "draft" && status !== "pending" && " · approved"}
          </p>
          <h2 className={styles.cardTitle}>{title}</h2>
        </div>
        <div className={styles.cardHeadSide}>
          {dirty && editable && <span className={styles.saveHint}>Unsaved changes</span>}
          <Badge tone={statusTone(status)}>{DRAFT_STATUS_LABEL[status]}</Badge>
        </div>
      </header>

      {/*
        A STANDING SEND CLAIM, SHOWN WHERE THE SEND BUTTON IS. The route stamps
        `sendClaimedAt` before the first message and deletes it with the write
        that sets `sent`, so an approved draft still carrying it is a send that
        started and stopped half way. Nothing expires it and there is no button
        here to clear it, deliberately: releasing it is a decision somebody
        makes after reading the send log to see who already has the mail. What
        this line does is make the state legible before the Send button is
        pressed, rather than leaving the 409 to be the first anybody hears of it.
      */}
      {status === "approved" && draft.sendClaimedAt && (
        <Notice tone="warning" role="note">
          A send of this draft started at{" "}
          {draft.sendClaimedAt.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          and did not finish. An admin can clear it once the send log has been read.
        </Notice>
      )}

      {status === "rejected" && draft.reviewerNotes && (
        <Notice tone="warning" role="note" title="Returned for revisions">
          {draft.reviewerNotes}
        </Notice>
      )}

      <SectionTabs
        ariaLabel="Editor view"
        current={tab}
        onSelect={(key) => setTab(key === "preview" ? "preview" : "compose")}
        tabs={[
          { key: "compose", label: "Compose" },
          { key: "preview", label: "Preview" },
        ]}
      />

      {tab === "compose" ? (
        <>
          <Field id="subject" label="Subject line" hint="Shown in the recipient's inbox preview.">
            <Input
              id="subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setDirty(true);
              }}
              maxLength={SUBJECT_MAX}
              disabled={!editable || busy}
              placeholder="e.g. NAISI April update"
            />
          </Field>

          <div>
            <h3 className={styles.fieldTitle}>Email</h3>
            <BlockEditor
              draftId={draft.id}
              blocks={blocks}
              onChange={(next) => {
                setBlocks(next);
                setDirty(true);
              }}
              disabled={!editable || busy}
            />
          </div>

          <p className={styles.tip}>
            Tip: you can personalise text anywhere by typing <code>{"{preferredName}"}</code>. It
            is replaced with each recipient&apos;s name at send time.
          </p>
        </>
      ) : (
        <EmailPreview subject={subject} blocks={blocks} previewName={previewName} />
      )}

      <TestAndPreviewBanner />

      {error && <p className={styles.danger}>{error}</p>}

      <div className={styles.actions}>
        <div className={styles.actionsGroup}>
          <Button
            variant="secondary"
            onClick={onSendTest}
            disabled={testStatus.kind === "sending"}
          >
            {testStatus.kind === "sending" ? "Sending test…" : "Send test to me"}
          </Button>
          <Button variant="ghost" onClick={onOpenPreview} disabled={previewBusy}>
            {previewBusy ? "Opening…" : "Open preview in new tab"}
          </Button>
        </div>

        <div className={styles.actionsGroup}>
          {canApprove && (status === "approved" || status === "pending") && (
            <Button variant="ghost" onClick={onRevertToDraft} disabled={busy}>
              Move back to draft
            </Button>
          )}

          {editable && (
            <Button
              variant={
                canApprove && (status === "pending" || status === "approved")
                  ? "secondary"
                  : "primary"
              }
              onClick={onSave}
              disabled={busy || !dirty}
            >
              {busy ? "Saving…" : "Save draft"}
            </Button>
          )}

          {canDraft && (status === "draft" || status === "rejected") && isAuthor && (
            <Button variant="secondary" onClick={onSubmitForReview} disabled={busy}>
              Submit for review
            </Button>
          )}

          {canApprove && status === "pending" && (
            <Button onClick={onApprove} disabled={busy}>
              Approve
            </Button>
          )}

          {canApprove && status === "approved" && (
            <Button onClick={onSend} disabled={sendStatus.kind === "sending"}>
              {sendStatus.kind === "sending" ? "Sending…" : "Send now"}
            </Button>
          )}
        </div>
      </div>

      {canApprove && status === "pending" && (
        <div className={styles.sendBack}>
          <div className={styles.sendBackField}>
            <Input
              id="rejectNote"
              aria-label="Reason to send back for revisions…"
              placeholder="Reason to send back for revisions…"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={onReject} disabled={busy}>
            Send back
          </Button>
        </div>
      )}

      {sendStatus.kind === "sent" && (
        <Notice tone="info">
          Sent to {sendStatus.subscribers} subscriber
          {sendStatus.subscribers === 1 ? "" : "s"} across {sendStatus.emails} email
          address{sendStatus.emails === 1 ? "" : "es"}.
          {sendStatus.pushed > 0 && ` ${sendStatus.pushed} notified by push.`}
          {/*
            Shown whatever the count is, because it is the case where the count
            of zero means something went wrong rather than nobody being opted
            in. Its own line, in the muted colour: the newsletter did go out,
            and the sender should read this as a note rather than a failure.
          */}
          {sendStatus.pushRefusal && (
            <span className={styles.noticeNote}>{sendStatus.pushRefusal}</span>
          )}
        </Notice>
      )}
      {sendStatus.kind === "error" && (
        <Notice tone="warning" role="alert">
          Send failed: {sendStatus.message}
        </Notice>
      )}

      {(isAuthor || role === "admin") && (
        <div className={styles.careful}>
          <Button variant="danger" onClick={onDelete} disabled={busy}>
            Delete draft
          </Button>
        </div>
      )}
    </div>
  );

  function TestAndPreviewBanner() {
    if (testStatus.kind === "sent") {
      return (
        <Notice tone="info">
          Test email sent to {testStatus.addresses.join(" and ")}. Check your inbox (and spam
          folder).
        </Notice>
      );
    }
    if (testStatus.kind === "error") {
      return (
        <Notice tone="warning" role="alert">
          Test send failed: {testStatus.message}
        </Notice>
      );
    }
    return null;
  }
}
