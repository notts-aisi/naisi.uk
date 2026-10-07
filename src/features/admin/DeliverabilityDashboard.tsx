"use client";

import { useEffect, useState, type ReactNode } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHead from "@/components/ui/PageHead";
import Switch from "@/components/ui/Switch";
import { AdminLoadingBar, AdminTable } from "./adminList";
import { AdminPanel, AdminProblem, AdminSection } from "./adminPanels";
import DeliverabilityExports from "./DeliverabilityExports";
import styles from "./Deliverability.module.css";

type SendStatus = "sent" | "bounced" | "complained" | "suppressed" | "held";

type Send = {
  id: string;
  to: string;
  subject: string;
  kind: string;
  /** Only on `notice` rows: which surface bypassed the notification grid. */
  surface?: string;
  status: SendStatus;
  statusReason?: string;
  sentAt: string | null;
  statusUpdatedAt: string | null;
  referenceId?: string;
};

type Suppression = {
  id: string;
  email: string;
  reason: string;
  subReason?: string;
  source: string;
  addedAt: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "Not recorded";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: SendStatus, reason?: string) {
  switch (status) {
    case "bounced":
      return (
        <Badge tone="danger" title={reason ? `Reason: ${reason}` : undefined}>
          Bounced{reason ? ` · ${reason}` : ""}
        </Badge>
      );
    case "complained":
      return (
        <Badge tone="warning" title={reason ? `Reason: ${reason}` : undefined}>
          Complaint{reason ? ` · ${reason}` : ""}
        </Badge>
      );
    // Neutral, not danger: nothing went wrong with this message. It was never
    // handed to the provider because the address is on the suppression list,
    // and the row is here so the withholding is visible rather than a gap.
    case "suppressed":
      return (
        <Badge tone="neutral" title={reason ? `Reason: ${reason}` : undefined}>
          Held: suppressed
        </Badge>
      );
    // Neutral for the same reason. The address is fine: this copy of the site
    // is not the live one and may not write to it. On the live site this
    // status never appears.
    case "held":
      return (
        <Badge tone="neutral" title={reason ? `Reason: ${reason}` : undefined}>
          Held: not the live site
        </Badge>
      );
    default:
      return <Badge tone="success">Sent</Badge>;
  }
}

/**
 * Kinds whose stored string is not what an operator should have to read.
 *
 * Most `EmailSendKind` values are already legible ("newsletter", "rsvp",
 * "course-nudge") and are shown as they are stored, which keeps this map short
 * and keeps the badge honest about the field behind it. The two here are the
 * ones a name alone would under-describe: a `notice` row is mail that IGNORED
 * the recipient's notification settings, which is the single most important
 * thing this table can tell an admin, and an `event-announcement` is the events
 * row's own send rather than a newsletter.
 */
const KIND_LABELS: Record<string, string> = {
  notice: "Important notice",
  "event-announcement": "Event announcement",
};

/**
 * Which notice-lane surface a bypass came from, in the operator's words. The
 * stored value is the code's (`event-broadcast`); this is the sentence fragment
 * that answers "who sent it and to whom".
 */
const SURFACE_LABELS: Record<string, string> = {
  "event-broadcast": "event attendees",
  "event-cancel": "event cancelled",
  "course-group": "course group",
  "course-room": "room notice",
  "course-run": "whole cohort",
};

function kindBadge(kind: string, surface?: string) {
  const label = KIND_LABELS[kind] ?? kind;
  // The surface is shown ONLY where it exists, which is only on notice rows.
  // It is the second half of what a bypass row has to answer: this message
  // reached its recipient whatever their settings said, and here is which
  // surface decided that.
  const tone = kind === "notice" ? "warning" : "neutral";
  return (
    <Badge
      tone={tone}
      title={surface ? `Notice lane: ${SURFACE_LABELS[surface] ?? surface}` : undefined}
    >
      {label}
      {surface ? ` · ${SURFACE_LABELS[surface] ?? surface}` : ""}
    </Badge>
  );
}

/**
 * Email delivery: the send log, the addresses we no longer email, and the log
 * of downloads the site has made.
 *
 * It draws the page's head itself, because Refresh belongs there and is this
 * component's own state. `audience` is the card that says who this copy of
 * the site may email: a Server Component the page hands in, so its answer is
 * worked out on the server and only the sentence reaches the browser.
 */
export default function DeliverabilityDashboard({ audience }: { audience?: ReactNode }) {
  const [sends, setSends] = useState<Send[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsuppressing, setUnsuppressing] = useState<string | null>(null);
  // Bump to re-run the load effect (driven by the Refresh button).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [sendsRes, suppRes] = await Promise.all([
          fetch("/api/admin/deliverability/sends"),
          fetch("/api/admin/deliverability/suppressed"),
        ]);
        if (!sendsRes.ok) throw new Error(`Sends fetch ${sendsRes.status}`);
        if (!suppRes.ok) throw new Error(`Suppressed fetch ${suppRes.status}`);
        const sendsBody = (await sendsRes.json()) as { items: Send[] };
        const suppBody = (await suppRes.json()) as { items: Suppression[] };
        if (cancelled) return;
        setSends(sendsBody.items ?? []);
        setSuppressions(suppBody.items ?? []);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Refresh button: surface the loading state, then re-run the load effect.
  function refresh() {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }

  async function onUnsuppress(id: string) {
    setUnsuppressing(id);
    try {
      const res = await fetch(
        `/api/admin/deliverability/suppressed/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`Delete ${res.status}`);
      setSuppressions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Un-suppress failed");
    } finally {
      setUnsuppressing(null);
    }
  }

  return (
    <>
      <PageHead
        crumb="Site settings"
        title="Email delivery"
        description="What the site has sent lately, the addresses it no longer emails, and the downloads it has made."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {error && <AdminProblem>{error}</AdminProblem>}

      <div className={styles.pair}>
        {/* Read before the send log below: a row marked Held is this card's
            answer applied to one message. */}
        {audience}
        <TaskEmailKillSwitch />
      </div>

      <AdminSection title="Recent sends">
        {loading && sends.length === 0 ? (
          <Card padding="md">
            <AdminLoadingBar label="Loading the send log…" />
          </Card>
        ) : sends.length === 0 ? (
          <Card padding="md">
            <p className={styles.muted}>
              No sends logged yet. Rows appear here once anyone triggers an outbound email.
            </p>
          </Card>
        ) : (
          <AdminTable caption="Recent sends" minWidth="52rem">
            <thead>
              <tr>
                <th scope="col" style={{ width: "22%" }}>
                  To
                </th>
                <th scope="col" style={{ width: "18%" }}>
                  Kind
                </th>
                <th scope="col" style={{ width: "27%" }}>
                  Subject
                </th>
                <th scope="col" style={{ width: "15%" }}>
                  Sent
                </th>
                <th scope="col" style={{ width: "18%" }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sends.map((s) => (
                <tr key={s.id}>
                  <td className={styles.address}>{s.to}</td>
                  <td>{kindBadge(s.kind, s.surface)}</td>
                  <td>{s.subject}</td>
                  <td className={styles.when}>{formatDate(s.sentAt)}</td>
                  <td>{statusBadge(s.status, s.statusReason)}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminSection>

      <AdminSection
        title="Suppressed addresses"
        description="Addresses that bounced or marked us as spam. Nothing is sent to them until they are taken off this list."
      >
        {loading && suppressions.length === 0 ? (
          <Card padding="md">
            <AdminLoadingBar label="Loading the suppression list…" />
          </Card>
        ) : suppressions.length === 0 ? (
          <Card padding="md">
            <p className={styles.muted}>No addresses suppressed. The list is healthy.</p>
          </Card>
        ) : (
          <AdminTable caption="Suppressed addresses" minWidth="44rem">
            <thead>
              <tr>
                <th scope="col" style={{ width: "34%" }}>
                  Email
                </th>
                <th scope="col">Reason</th>
                <th scope="col">Detail</th>
                <th scope="col">Added</th>
                <th scope="col">
                  <span className={styles.srOnly}>Take off the list</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {suppressions.map((s) => (
                <tr key={s.id}>
                  <td className={styles.address}>{s.email}</td>
                  <td>
                    {s.reason === "complaint" ? (
                      <Badge tone="warning">Complaint</Badge>
                    ) : (
                      <Badge tone="danger">Bounce</Badge>
                    )}
                  </td>
                  <td className={styles.detail}>{s.subReason ?? "None given"}</td>
                  <td className={styles.when}>{formatDate(s.addedAt)}</td>
                  <td className={styles.action}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void onUnsuppress(s.id)}
                      disabled={unsuppressing === s.id}
                    >
                      {unsuppressing === s.id ? "Removing…" : "Un-suppress"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminSection>

      {/* The export log. Its own component with its own fetch: the rows come
          from a different route, they are read once and not watched, and
          sharing this page's Refresh button through `reloadKey` is the only
          coupling. */}
      <DeliverabilityExports reloadKey={reloadKey} />
    </>
  );
}

/**
 * The switch for the task manager's outbound emails. With it off, task flows
 * can be clicked through on the practice site without mailing real inboxes.
 * Other email (the newsletter, sign-in, delivery reports) is unaffected.
 */
function TaskEmailKillSwitch() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Bump to re-run the load effect (after a successful toggle).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/config/task-emails");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          enabled: boolean;
          updatedAt: string | null;
        };
        if (cancelled) return;
        setEnabled(data.enabled);
        setUpdatedAt(data.updatedAt);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function toggle() {
    if (enabled === null || busy) return;
    const next = !enabled;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/config/task-emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEnabled(next);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel
      title="Task emails"
      badges={
        <Badge tone={enabled === false ? "warning" : "success"}>
          {enabled === null ? "Loading…" : enabled ? "Emails on" : "Emails off"}
        </Badge>
      }
      description={
        <>
          When <strong>off</strong>, the task manager&apos;s comment and send-for-review emails
          stop before they reach the mail provider. Comments still post on the site. Every other
          kind of email is unaffected.
        </>
      }
    >
      <div className={styles.switchRow}>
        <Switch
          checked={enabled === true}
          disabled={enabled === null || busy}
          label="Send task emails"
          description={busy ? "Saving…" : updatedAt ? `Last changed ${formatDate(updatedAt)}` : undefined}
          onChange={(next) => {
            // The route is told the opposite of what is stored, as the
            // button it replaces did. A press that changes nothing is dropped.
            if (next !== enabled) void toggle();
          }}
        />
      </div>
      {err && <AdminProblem>{err}</AdminProblem>}
    </AdminPanel>
  );
}
