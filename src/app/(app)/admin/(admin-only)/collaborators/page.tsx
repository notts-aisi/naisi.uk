"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import CollaboratorCard from "@/features/admin/CollaboratorCard";
import {
  AdminPage,
  AdminPageHead,
  AdminLoadingBar,
  AdminListFooter,
  useClientPagination,
} from "@/features/admin/adminList";
import { useCollaborators } from "@/features/admin/useCollaborators";
import { useCollaboratorVerification } from "@/features/admin/useCollaboratorVerification";
import type { CollaboratorDoc } from "@/lib/firestore/collaborators";

const sectionTitle = {
  margin: "0 0 var(--space-3)",
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-lg)",
  fontWeight: 600,
} as const;

/**
 * Collaborators: people from outside the university who have asked to work
 * with us. The same decisions as a join request, on their own answers.
 */
export default function AdminCollaboratorsPage() {
  const { collaborators, loading, refreshing, error, reload } = useCollaborators();
  const verified = useCollaboratorVerification(collaborators.map((c) => c.uid));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { shown, hasMore, loadMore, total, shownCount } = useClientPagination(
    collaborators,
    20,
  );

  async function act(id: string, run: () => Promise<Response>) {
    setActionError(null);
    setBusyId(id);
    try {
      const res = await run();
      if (!res.ok && res.status !== 207) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "That did not go through.");
      }
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That did not go through.");
    } finally {
      setBusyId(null);
    }
  }

  const approve = (c: CollaboratorDoc) =>
    act(c.id, () =>
      fetch(`/api/collaborators/${encodeURIComponent(c.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }),
    );

  const reject = (c: CollaboratorDoc, reason: string) =>
    act(c.id, () =>
      fetch(`/api/collaborators/${encodeURIComponent(c.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      }),
    );

  const remove = (c: CollaboratorDoc) =>
    act(c.id, () =>
      fetch(`/api/collaborators/${encodeURIComponent(c.id)}`, { method: "DELETE" }),
    );

  const pending = shown.filter((c) => c.status === "pending");
  const decided = shown.filter((c) => c.status !== "pending");

  const card = (c: CollaboratorDoc) => (
    <CollaboratorCard
      key={c.id}
      collaborator={c}
      emailVerified={verified[c.uid]}
      busy={busyId === c.id}
      onApprove={() => approve(c)}
      onReject={(reason) => reject(c, reason)}
      onDelete={() => remove(c)}
    />
  );

  return (
    <AdminPage wide>
      <AdminPageHead
        title="Collaborators"
        description="People from outside the university who have asked to work with us. Approving or saying not now sends them an email."
      />

      {actionError && (
        <Card padding="sm">
          <p
            role="alert"
            style={{ color: "var(--color-danger-text)", margin: 0, fontSize: "var(--text-sm)" }}
          >
            {actionError}
          </p>
        </Card>
      )}

      {error && (
        <Card padding="md">
          <p style={{ color: "var(--color-danger-text)" }}>
            Couldn&apos;t load collaborators: {error.message}
          </p>
        </Card>
      )}

      {loading && (
        <Card padding="md">
          <AdminLoadingBar label="Loading collaborators…" />
        </Card>
      )}

      {!loading && !error && collaborators.length === 0 && (
        <Card padding="lg">
          <h3 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-2)" }}>
            Nobody has asked yet
          </h3>
          <p style={{ color: "var(--color-text-muted)" }}>
            Somebody from outside the university who picks &ldquo;Collaborate with us&rdquo; when
            they sign up shows here.
          </p>
        </Card>
      )}

      {!loading && !error && collaborators.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <section>
            <h3 style={sectionTitle}>Waiting · {pending.length}</h3>
            {pending.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                Nobody is waiting.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {pending.map(card)}
              </div>
            )}
          </section>

          {decided.length > 0 && (
            <section>
              <h3 style={sectionTitle}>Decided · {decided.length}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {decided.map(card)}
              </div>
            </section>
          )}
        </div>
      )}

      {!loading && !error && total > 0 && (
        <AdminListFooter
          shownCount={shownCount}
          total={total}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onRefresh={reload}
          refreshing={refreshing}
          noun="collaborators"
        />
      )}
    </AdminPage>
  );
}
