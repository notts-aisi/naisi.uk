"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import { Textarea } from "@/components/ui/Input";
import OptionRow from "@/components/ui/OptionRow";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import {
  STATUS_LABELS,
  type NewsletterPrefs,
  type UserDoc,
} from "@/lib/firestore/users";
import {
  REJECTION_REASONS,
  type RejectionReasonKey,
} from "@/lib/firestore/applicationEmails";
import { AdminMoreMenu } from "./adminList";
import { approveUser, deleteUser, rejectUser } from "./adminMutations";
import type { UniEmailHolder } from "./useUniEmailIndex";
import styles from "./ApprovalCard.module.css";

function sendApplicationEmail(body: {
  templateId: string;
  uid: string;
  customReason?: string;
}) {
  fetch("/api/admin/application-emails/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.warn("[application email] fire-and-forget failed", err);
  });
}

/** "July 2028" from a stored year and month. No instant is involved, so no time zone is. */
function formatGraduation(isoMonth: string): string {
  const [y, m] = isoMonth.split("-");
  if (!y || !m) return isoMonth;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatNewsletter(prefs: NewsletterPrefs): string {
  if (!prefs.subscribed) return "Not subscribed";
  const channels: string[] = [];
  if (prefs.deliverToGmail) channels.push("Google");
  if (prefs.deliverToUniEmail) channels.push("university");
  return channels.length ? `Subscribed (${channels.join(" + ")})` : "Subscribed";
}

/** The four reasons a join request can be closed with, in the order they are offered.
 *  Each has its own email, which is what the person is sent. */
const REASONS: { key: RejectionReasonKey; label: string }[] = [
  { key: "not-in-nottingham", label: "Not based in Nottingham" },
  { key: "suspected-spam", label: "Looks like spam" },
  { key: "not-member", label: "Not an interested member" },
  { key: "custom", label: "Another reason…" },
];

export default function ApprovalCard({
  user,
  uniEmailConflicts = [],
  onResolved,
}: {
  user: UserDoc;
  /** Other accounts already holding this applicant's university email. */
  uniEmailConflicts?: UniEmailHolder[];
  /**
   * Re-reads the queue once this request has been decided. The queue is a
   * one-shot `getDocs` list rather than a listener, so without it a decided
   * card sits on screen under a stuck "Approving…" button and the admin has to
   * press Refresh to find out whether the write landed.
   */
  onResolved?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [reason, setReason] = useState<RejectionReasonKey | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [copied, setCopied] = useState(false);
  const reasonsId = useId();

  /**
   * The re-read normally drops this row and unmounts the card, so clearing
   * `busy` afterwards only matters when it does not: a re-read that failed
   * has to leave working buttons behind rather than a disabled card.
   */
  async function refreshQueue() {
    await onResolved?.();
    setBusy(null);
  }

  async function handleApprove() {
    setBusy("approve");
    setError(null);
    try {
      await approveUser(user.uid);
      sendApplicationEmail({ templateId: "application-approved", uid: user.uid });
    } catch (err) {
      console.error(err);
      setError("That did not approve. Try again.");
      setBusy(null);
      return;
    }
    await refreshQueue();
  }

  async function handleNotNow() {
    if (!reason) {
      setError("Pick a reason.");
      return;
    }
    const custom = customReason.trim();
    if (reason === "custom" && custom.length === 0) {
      setError("Write the reason, or pick another one.");
      return;
    }
    setBusy("reject");
    setError(null);
    try {
      await rejectUser(user.uid, reason);
      sendApplicationEmail({
        templateId: REJECTION_REASONS[reason].templateId,
        uid: user.uid,
        customReason: reason === "custom" ? custom : undefined,
      });
      setShowReasons(false);
    } catch (err) {
      console.error(err);
      setError("That did not save. Try again.");
      setBusy(null);
      return;
    }
    await refreshQueue();
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Permanently delete ${user.displayName ?? user.email}? This removes their record and sign-in account. This can't be undone.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setError(null);
    try {
      await deleteUser(user.uid);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "The delete did not go through.");
      setBusy(null);
      return;
    }
    await refreshQueue();
  }

  async function handleCopy() {
    if (!user.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopied(true);
    } catch {
      setError("Could not copy the address. It is on the card, to select by hand.");
    }
  }

  const profile = user.profile;
  // The name on the account, with what they go by beside it when that differs.
  const name = user.displayName ?? profile?.preferredName ?? "Unnamed";
  const goesBy =
    profile?.preferredName && user.displayName && !user.displayName.startsWith(profile.preferredName)
      ? profile.preferredName
      : null;
  const subject = profile?.subject ?? profile?.course;
  const status = profile?.status
    ? profile.status === "other" && profile.statusOther
      ? `${STATUS_LABELS[profile.status]}: ${profile.statusOther}`
      : STATUS_LABELS[profile.status]
    : null;
  const studies = [goesBy ? `Goes by ${goesBy}` : null, subject, status]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={styles.card}
      // Addressed by the browser end-to-end suite, which approves a seeded
      // applicant through this page rather than by writing the document.
      data-testid="approval-card"
    >
      <header className={styles.head}>
        <div className={styles.person}>
          <InitialsChip name={name} uid={user.uid} size="lg" />
          <div className={styles.personText}>
            <h3 className={styles.name}>{name}</h3>
            {studies && <span className={styles.studies}>{studies}</span>}
          </div>
        </div>
        {user.createdAt && (
          <span className="meta">
            Signed up{" "}
            {formatSiteDate(user.createdAt, { weekday: "short", day: "numeric", month: "short" })}
          </span>
        )}
      </header>

      {uniEmailConflicts.length > 0 && (
        <div className={styles.conflict} role="note">
          <strong className={styles.conflictTitle}>University email already in use</strong>
          <ul className={styles.conflictList}>
            {uniEmailConflicts.map((c) => (
              <li key={c.uid}>
                {c.displayName || "Unnamed"} ({c.role}), {c.verified ? "verified" : "not verified"}
              </li>
            ))}
          </ul>
          <span className={styles.conflictNote}>
            A university email belongs to one account. Approving this makes a second one. Say not
            now, or delete the older account if this person is signing up again.
          </span>
        </div>
      )}

      {profile && (
        <div className={styles.answer}>
          {/* The label is the word the browser test reads off this card. */}
          <span className={styles.answerLabel}>Motivation</span>
          <p className={styles.answerText}>{profile.motivation}</p>
        </div>
      )}

      {profile?.interests && (
        <div className={styles.answer}>
          <span className={styles.answerLabel}>Interests</span>
          <p className={`${styles.answerText} ${styles.answerTextQuiet}`}>{profile.interests}</p>
        </div>
      )}

      <dl className={styles.facts}>
        {profile?.universityEmail && (
          <div className={styles.fact}>
            <dt>University email</dt>
            <dd>
              <span className={styles.factValue}>{profile.universityEmail}</span>
              {profile.uniEmailVerifiedAt ? (
                <Chip tone="success" dot>
                  Verified
                </Chip>
              ) : (
                <>
                  <Chip tone="warning" dot>
                    Not verified
                  </Chip>
                  <span>We’ll email their sign-in address instead.</span>
                </>
              )}
            </dd>
          </div>
        )}
        <div className={styles.fact}>
          <dt>Sign-in email</dt>
          <dd>
            <span className={styles.factValue}>{user.email ?? "None on file"}</span>
          </dd>
        </div>
        {profile?.year && !profile.status && (
          <div className={styles.fact}>
            <dt>Year</dt>
            <dd>{profile.year}</dd>
          </div>
        )}
        {profile?.expectedGraduation && (
          <div className={styles.fact}>
            <dt>Graduating</dt>
            <dd>{formatGraduation(profile.expectedGraduation)}</dd>
          </div>
        )}
        {profile?.newsletter && (
          <div className={styles.fact}>
            <dt>Newsletter</dt>
            <dd>{formatNewsletter(profile.newsletter)}</dd>
          </div>
        )}
      </dl>

      <div className={styles.actions}>
        <Button
          onClick={handleApprove}
          disabled={busy !== null}
          data-testid="approval-approve"
          aria-label={busy === "approve" ? undefined : `Approve ${name}`}
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          onClick={() => {
            setShowReasons((v) => !v);
            setError(null);
          }}
          disabled={busy !== null}
          variant="secondary"
          aria-expanded={showReasons}
          aria-controls={reasonsId}
          trailing={<Chevron up={showReasons} />}
        >
          Not now
        </Button>
        <span className={styles.actionsEnd}>
          <AdminMoreMenu
            label={`More for ${name}`}
            items={[
              {
                key: "copy",
                label: copied ? "Copied" : "Copy email address",
                disabled: !user.email,
                onSelect: handleCopy,
              },
              {
                key: "delete",
                label: busy === "delete" ? "Deleting…" : "Delete join request…",
                note: "Removes their record and sign-in. This can’t be undone.",
                careful: true,
                disabled: busy !== null,
                onSelect: handleDelete,
              },
            ]}
          />
        </span>
      </div>

      {showReasons && (
        <div id={reasonsId} className={styles.reasons} role="group" aria-label="Why not now?">
          <span className={styles.reasonsTitle}>Why not now?</span>
          <div className={styles.reasonOptions}>
            {REASONS.map((option) => (
              <OptionRow
                key={option.key}
                type="radio"
                name={`reason-${user.uid}`}
                value={option.key}
                checked={reason === option.key}
                onChange={() => {
                  setReason(option.key);
                  setError(null);
                }}
                disabled={busy !== null}
              >
                {option.label}
              </OptionRow>
            ))}
          </div>
          {reason === "custom" && (
            <Textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="What should we tell them?"
              aria-label="The reason they are told"
              rows={3}
              maxLength={2000}
              disabled={busy !== null}
            />
          )}
          <p className={styles.reasonsNote}>
            They are sent an email with the reason you pick. Their request leaves this list, and
            you can put it back from Accounts.
          </p>
          <div className={styles.reasonsActions}>
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => {
                setShowReasons(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleNotNow} disabled={busy !== null}>
              {busy === "reject" ? "Sending…" : "Not now"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}
