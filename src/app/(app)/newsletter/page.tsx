"use client";

import { useMemo, useState } from "react";
import Notice from "@/components/ui/Notice";
import { useAuth } from "@/auth/AuthProvider";
import DraftRail, { type RailGroup, type RailRow } from "@/features/newsletter/DraftRail";
import { deleteDraft } from "@/features/newsletter/draftMutations";
import { useDrafts } from "@/features/newsletter/useDrafts";
import { dayOf, momentOf, reachOf, statusTone } from "@/features/newsletter/draftWords";
import { DRAFT_STATUS_LABEL, type NewsletterDraft } from "@/lib/firestore/newsletterDrafts";
import {
  canApproveNewsletter,
  canDraftNewsletter,
} from "@/lib/firestore/users";
import styles from "./newsletter.module.css";

export default function NewsletterListPage() {
  const { user, role, permissions } = useAuth();
  const { drafts, loading, error } = useDrafts();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const viewer = role && (role === "admin" || role === "committee" || role === "member")
    ? { role, permissions }
    : null;

  const canDraft = viewer ? canDraftNewsletter(viewer) : false;
  const canApprove = viewer ? canApproveNewsletter(viewer) : false;

  const pendingDrafts = useMemo(
    () => drafts.filter((d) => d.status === "pending"),
    [drafts],
  );
  const activeDrafts = useMemo(
    () => drafts.filter((d) => d.status !== "sent"),
    [drafts],
  );
  const sentDrafts = useMemo(
    () => drafts.filter((d) => d.status === "sent"),
    [drafts],
  );

  const mine = useMemo(
    () => activeDrafts.filter((d) => d.authorUid === user?.uid),
    [activeDrafts, user],
  );
  const othersActive = useMemo(
    () => activeDrafts.filter((d) => d.authorUid !== user?.uid),
    [activeDrafts, user],
  );

  const groups: RailGroup[] = [];
  if (canApprove && pendingDrafts.length > 0) {
    groups.push({
      key: "pending",
      label: "Pending your review",
      count: pendingDrafts.length,
      tone: "warning",
      rows: pendingDrafts.map(rowOf),
    });
  }
  groups.push({
    key: "mine",
    label: "Your drafts",
    count: mine.length,
    rows: mine.map(rowOf),
    empty: canDraft
      ? "You haven't started any drafts yet."
      : "You don't have permission to draft newsletters.",
  });
  if (othersActive.length > 0) {
    groups.push({
      key: "others",
      label: canApprove ? "Other drafts in progress" : "Committee drafts in progress",
      count: othersActive.length,
      rows: othersActive.map(rowOf),
    });
  }

  return (
    <div className={styles.stack}>
      {error && (
        <Notice tone="warning" role="alert">
          Couldn&apos;t load drafts: {error.message}
        </Notice>
      )}

      {deleteError && (
        <Notice tone="warning" role="alert">
          Delete failed: {deleteError}
        </Notice>
      )}

      {loading ? (
        <p className={styles.muted}>Loading drafts…</p>
      ) : (
        <div className={styles.listGrid}>
          <DraftRail ariaLabel="Drafts" groups={groups} />
          {sentDrafts.length > 0 && (
            <DraftRail
              ariaLabel="Sent newsletters"
              groups={[
                { key: "sent", label: "Recently sent", rows: sentDrafts.slice(0, 10).map(rowOf) },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );

  async function onDeleteSent(d: NewsletterDraft) {
    if (
      !window.confirm(
        `Permanently delete the sent edition "${d.subject || "(no subject)"}"? This removes the record from Firestore but cannot recall emails that were already sent.`,
      )
    ) {
      return;
    }
    setDeletingId(d.id);
    setDeleteError(null);
    try {
      await deleteDraft(d.id);
    } catch (err) {
      console.error(err);
      setDeleteError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeletingId(null);
    }
  }

  /** One draft as a row of the list: its words, its chip and, for a sent edition, its delete button. */
  function rowOf(d: NewsletterDraft): RailRow {
    const canDeleteSent =
      d.status === "sent" && (role === "admin" || d.authorUid === user?.uid);
    const own = d.authorUid === user?.uid;
    const who = own ? "You" : d.authorDisplayName ?? "Someone";
    const sent = d.status === "sent";
    const when = sent ? d.sentAt ?? d.updatedAt : d.updatedAt;
    const reach = reachOf(d);
    return {
      id: d.id,
      href: `/newsletter/${d.id}`,
      title: d.subject || <span className={styles.muted}>(no subject)</span>,
      chip:
        d.status === "draft" || sent
          ? undefined
          : { tone: statusTone(d.status), label: DRAFT_STATUS_LABEL[d.status] },
      line: sent ? (
        <>
          {when && (
            <span className="meta" title={momentOf(when)}>
              {dayOf(when)}
            </span>
          )}
          {reach && <span>{reach}</span>}
          <span>· by {own ? "you" : who}</span>
        </>
      ) : (
        <>
          <span>{who}</span>
          {when && <span title={momentOf(when)}>· edited {dayOf(when)}</span>}
        </>
      ),
      note:
        d.status === "rejected" && d.reviewerNotes ? <>Reviewer note: {d.reviewerNotes}</> : undefined,
      action: canDeleteSent ? (
        <button
          type="button"
          onClick={() => void onDeleteSent(d)}
          disabled={deletingId === d.id}
          className={styles.rowDelete}
          aria-label={`Delete sent edition: ${d.subject || "no subject"}`}
        >
          {deletingId === d.id ? "Deleting…" : "Delete"}
        </button>
      ) : undefined,
    };
  }
}
