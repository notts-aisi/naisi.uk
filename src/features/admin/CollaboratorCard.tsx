"use client";

import { useId, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import { Textarea } from "@/components/ui/Input";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import type { CollaboratorDoc } from "@/lib/firestore/collaborators";
import { AdminMoreMenu } from "./adminList";
import styles from "./ApprovalCard.module.css";

const STATUS_CHIP: Record<
  CollaboratorDoc["status"],
  { tone: "accent" | "success" | "danger"; label: string }
> = {
  pending: { tone: "accent", label: "Waiting" },
  approved: { tone: "success", label: "Approved" },
  rejected: { tone: "danger", label: "Turned down" },
};

function Answer({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>
        <span className={`${styles.factValue} ${styles.factProse}`}>{children}</span>
      </dd>
    </div>
  );
}

function ExternalLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={styles.link}>
      {href}
    </a>
  );
}

/**
 * One collaborator's request: somebody from outside the university asking to
 * work with us. The same card as a join request, with their own answers.
 */
export default function CollaboratorCard({
  collaborator,
  emailVerified,
  onApprove,
  onReject,
  onDelete,
  busy = false,
}: {
  collaborator: CollaboratorDoc;
  /** Whether the sign-in address is proved, read live and not from the
   *  document. undefined = not yet loaded; false = not proved; true = proved. */
  emailVerified?: boolean;
  onApprove: () => void | Promise<void>;
  onReject: (reason: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  busy?: boolean;
}) {
  const { application: app } = collaborator;
  const chip = STATUS_CHIP[collaborator.status];
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState(collaborator.rejectionReason ?? "");
  const panelId = useId();
  const name = collaborator.fullName || "No name given";

  // After a decision the list is read again and the status changes; close the
  // note so the ordinary row of buttons is back without a reload. Adjusted
  // during render, keyed on the previous status: no effect, no flash.
  const [lastStatus, setLastStatus] = useState(collaborator.status);
  if (collaborator.status !== lastStatus) {
    setLastStatus(collaborator.status);
    setDeclining(false);
  }

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <div className={styles.person}>
          <InitialsChip name={name} uid={collaborator.uid} size="lg" />
          <div className={styles.personText}>
            <h3 className={styles.name}>{name}</h3>
            <span className={styles.studies}>
              {[app.roleTitle, app.institution].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
        <div className={styles.headEnd}>
          <Chip tone={chip.tone}>{chip.label}</Chip>
          {collaborator.createdAt && (
            <span className="meta">
              Asked{" "}
              {formatSiteDate(collaborator.createdAt, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </div>
      </header>

      <div className={styles.answer}>
        <span className={styles.answerLabel}>What they want to do with us</span>
        <p className={styles.answerText}>{app.projectPitch}</p>
      </div>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Sign-in email</dt>
          <dd>
            <span className={styles.factValue}>{collaborator.email ?? "None on file"}</span>
            {emailVerified === true && (
              <Chip tone="success" dot>
                Verified
              </Chip>
            )}
            {emailVerified === false && (
              <Chip tone="warning" dot>
                Not verified
              </Chip>
            )}
          </dd>
        </div>
        <Answer label="Background">{app.background}</Answer>
        <Answer label="Interests">{app.interests}</Answer>
        <Answer label="How they heard of us">{app.heardAbout}</Answer>
        <Answer label="Knows the committee">
          {app.knowsCommittee ? app.committeeContactName || "Yes" : "No"}
        </Answer>
        {app.impactJustification ? (
          <Answer label="Why them">{app.impactJustification}</Answer>
        ) : null}
        {app.linkedinUrl ? (
          <Answer label="LinkedIn">
            <ExternalLink href={app.linkedinUrl} />
          </Answer>
        ) : null}
        {app.portfolioUrl ? (
          <Answer label="Website">
            <ExternalLink href={app.portfolioUrl} />
          </Answer>
        ) : null}
      </dl>

      <div className={styles.actions}>
        {collaborator.status !== "approved" && (
          <Button disabled={busy} onClick={() => onApprove()} aria-label={`Approve ${name}`}>
            Approve
          </Button>
        )}
        {collaborator.status !== "rejected" && (
          <Button
            variant="secondary"
            disabled={busy}
            aria-expanded={declining}
            aria-controls={panelId}
            onClick={() => setDeclining((v) => !v)}
          >
            Not now
          </Button>
        )}
        <span className={styles.actionsEnd}>
          <AdminMoreMenu
            label={`More for ${name}`}
            items={[
              {
                key: "delete",
                label: "Delete request and account…",
                note: "This can’t be undone.",
                careful: true,
                disabled: busy,
                onSelect: () => {
                  if (
                    window.confirm(
                      `Delete ${collaborator.fullName || "this collaborator"}'s application and account? This can't be undone.`,
                    )
                  ) {
                    void onDelete();
                  }
                },
              },
            ]}
          />
        </span>
      </div>

      {declining && (
        <div id={panelId} className={styles.reasons} role="group" aria-label="Not now">
          <span className={styles.reasonsTitle}>A note for them, if you want one</span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional. It goes in the email they are sent."
            aria-label="A note to include in the email"
            rows={3}
            maxLength={2000}
            disabled={busy}
          />
          <p className={styles.reasonsNote}>They are sent an email, with your note if you write one.</p>
          <div className={styles.reasonsActions}>
            <Button variant="ghost" disabled={busy} onClick={() => setDeclining(false)}>
              Cancel
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => onReject(reason.trim())}>
              Not now
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
