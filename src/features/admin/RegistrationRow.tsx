"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import {
  REGISTRATION_METHOD_META,
  REGISTRATION_STATUS_META,
  type RegistrationView,
} from "@/lib/firestore/registrations";
import styles from "./Registrations.module.css";

function formatDate(iso: string | null): string {
  if (!iso) return "Not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not recorded";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One sign-up, as a row of the tracker's table, with a two-step delete: the
 * first press asks, the second deletes.
 *
 * The status shown is the one the server worked out from whether a profile
 * exists right now. Nothing here reads a stored status word.
 */
export default function RegistrationRow({
  reg,
  onDelete,
  busy = false,
}: {
  reg: RegistrationView;
  onDelete: () => void | Promise<void>;
  busy?: boolean;
}) {
  const meta = REGISTRATION_STATUS_META[reg.status];
  const methodMeta = REGISTRATION_METHOD_META[reg.method];
  const [confirming, setConfirming] = useState(false);

  return (
    <tr>
      <td className={styles.whoCell}>
        <span className={styles.email}>{reg.email || "(no email)"}</span>
        <span className={styles.sub}>
          {reg.audience === "collaborator" ? "Collaborator" : "Member"}
          {reg.sendCount > 1 ? ` · ${reg.sendCount} link sends` : ""}
        </span>
      </td>
      <td data-label="Route">
        <Chip tone={methodMeta.tone}>{methodMeta.label}</Chip>
      </td>
      <td data-label="Got as far as">
        <Chip tone={meta.tone}>{meta.label}</Chip>
      </td>
      <td data-label="Created" className={styles.dateCell}>
        {formatDate(reg.createdAt)}
      </td>
      <td className={styles.actionCell}>
        {confirming ? (
          <span className={styles.confirm}>
            <span className={styles.confirmText}>Delete account?</span>
            <Button size="sm" variant="danger" onClick={() => void onDelete()} disabled={busy}>
              {busy ? "Deleting…" : "Yes"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className={styles.quietDelete}
            onClick={() => setConfirming(true)}
            title="Delete this account: its sign-in, this row and its mailing list rows"
          >
            Delete…
          </Button>
        )}
      </td>
    </tr>
  );
}
