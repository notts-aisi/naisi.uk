"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { useAuth } from "@/auth/AuthProvider";
import { SUBJECT_MAX } from "@/lib/firestore/newsletterDrafts";
import { createDraft } from "./draftMutations";
import styles from "../../app/(app)/newsletter/newsletter.module.css";

export default function NewDraftForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) {
      setError("Give it a subject before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createDraft({
        subject,
        authorDisplayName: user?.displayName ?? user?.email ?? null,
      });
      router.push(`/newsletter/${id}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to create draft");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>New draft</h2>
        <Field
          id="new-subject"
          label="Subject"
          hint="You'll write the body (headings, text, images) after this."
        >
          <Input
            id="new-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={SUBJECT_MAX}
            placeholder="e.g. NAISI April update"
            autoFocus
          />
        </Field>

        {error && <p className={styles.danger}>{error}</p>}

        <div className={styles.formActions}>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create draft"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/newsletter")}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
