"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import PageHead from "@/components/ui/PageHead";
import { useAuth } from "@/auth/AuthProvider";
import { TITLE_MAX } from "@/lib/firestore/events";
import { createEvent } from "./eventMutations";
import styles from "./EventEditor.module.css";

export default function NewEventForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the event a title before you create it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createEvent({
        title,
        authorDisplayName: user?.displayName ?? user?.email ?? null,
      });
      router.push(`/events/manage/${id}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "The event wasn’t created.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={styles.editor}>
      <PageHead
        crumb={<Link href="/events/manage">Manage events</Link>}
        title="New event"
        description="Start with a name. It is saved as a draft, and nothing is public until it has been approved and published."
      />

      <Card as="section" padding="lg">
        <div className={styles.fields}>
          <Field
            id="new-title"
            label="Event title"
            hint="You fill in the date, the description and the sign-up questions on the next screen."
          >
            <Input
              id="new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="e.g. Board games and pizza"
              autoFocus
            />
          </Field>
        </div>

        {error && (
          <p className={styles.problem} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create event"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/events/manage")}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </Card>
    </form>
  );
}
