"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { AdminPanel, AdminProblem } from "./adminPanels";
import panels from "./adminPanels.module.css";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; to: string }
  | { kind: "held"; to: string }
  | { kind: "error"; message: string };

export default function EmailPipeTest() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSend() {
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/admin/test-email", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; sentTo?: string; held?: boolean; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setStatus({
          kind: "error",
          message: body?.error ?? `Failed (${res.status})`,
        });
        return;
      }
      setStatus({ kind: body.held ? "held" : "sent", to: body.sentTo ?? "your inbox" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return (
    <AdminPanel
      title="Email pipeline"
      badges={
        status.kind === "sent" ? (
          <Badge tone="success">Sent</Badge>
        ) : status.kind === "held" ? (
          <Badge tone="neutral">Held</Badge>
        ) : status.kind === "error" ? (
          <Badge tone="danger">Error</Badge>
        ) : undefined
      }
      description="Sends a test email to your own address. Use this after changing the mail settings or a template."
      actions={
        <Button size="sm" onClick={onSend} disabled={status.kind === "sending"}>
          {status.kind === "sending" ? "Sending…" : "Send test to myself"}
        </Button>
      }
    >
      {status.kind === "sent" && (
        <p className={panels.muted} role="status">
          Sent to {status.to}. If it doesn&apos;t arrive within a minute, check the spam folder and
          the server logs.
        </p>
      )}
      {status.kind === "held" && (
        <p className={panels.muted} role="status">
          Held, not sent. This copy of the site is not allowed to email {status.to}. The site
          notice and scheduled jobs page says who it can email.
        </p>
      )}
      {status.kind === "error" && <AdminProblem>{status.message}</AdminProblem>}
    </AdminPanel>
  );
}
