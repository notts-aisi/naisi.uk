"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import { Field, Input, Textarea } from "@/components/ui/Input";
import Notice from "@/components/ui/Notice";
import OptionRow from "@/components/ui/OptionRow";
import ResponsiveSelect from "@/components/ui/ResponsiveSelect";
import { copyToClipboard, downloadCSV, toCSV } from "@/lib/csv";
import { useAuth } from "@/auth/AuthProvider";
import {
  FOOD_PROVENANCE_BADGE,
  RSVP_STATUSES,
  type EventDoc,
  type FormQuestion,
  type RsvpAnswer,
  type RsvpDoc,
  type RsvpStatus,
} from "@/lib/firestore/events";
import { own } from "@/lib/applications/keys";
import { useEventRsvps } from "./useEventRsvps";
import OrderHelper from "./OrderHelper";
import TestRsvpPanel from "./TestRsvpPanel";
import Pie, { pickColor, type PieSlice } from "./Pie";
import { SIGNUP_WORDS, dayWords, signupTone, stampWords } from "./manageWords";
import styles from "./AttendeeDashboard.module.css";

type Props = { event: EventDoc };

/** Stringify a raw answer for CSV / table display. */
function renderAnswer(a: RsvpAnswer | undefined): string {
  if (a === undefined || a === null) return "";
  if (typeof a === "string") return a;
  if (typeof a === "boolean") return a ? "Yes" : "No";
  if (Array.isArray(a)) return a.join(", ");
  if (typeof a === "object") {
    const obj = a as { checked?: string[]; other?: string };
    const parts: string[] = [];
    if (Array.isArray(obj.checked) && obj.checked.length > 0) parts.push(...obj.checked);
    if (obj.other) parts.push(`Other: ${obj.other}`);
    return parts.join(", ");
  }
  return "";
}

export default function AttendeeDashboard({ event }: Props) {
  const { role } = useAuth();
  const { rsvps, loading, error, refresh } = useEventRsvps(event.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [denyFor, setDenyFor] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState("");
  const [filter, setFilter] = useState<"active" | RsvpStatus | "all">("active");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastIncludeWaitlist, setBroadcastIncludeWaitlist] = useState(true);
  const [broadcastState, setBroadcastState] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent"; sent: number; failed: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const pending = useMemo(() => rsvps.filter((r) => r.status === "pending"), [rsvps]);
  const confirmed = useMemo(() => rsvps.filter((r) => r.status === "confirmed"), [rsvps]);
  const waitlisted = useMemo(() => rsvps.filter((r) => r.status === "waitlisted"), [rsvps]);
  const denied = useMemo(() => rsvps.filter((r) => r.status === "denied"), [rsvps]);
  const cancelled = useMemo(() => rsvps.filter((r) => r.status === "cancelled"), [rsvps]);
  const syntheticCount = useMemo(() => rsvps.filter((r) => r.synthetic).length, [rsvps]);
  const pendingChanges = useMemo(
    () => rsvps.filter((r) => r.pendingAnswers),
    [rsvps],
  );

  // "active" = counts that matter for catering/ordering (confirmed + waitlisted).
  // Pies and counts default to this slice so the food order number is obvious.
  const active = useMemo(
    () => rsvps.filter((r) => r.status === "confirmed" || r.status === "waitlisted"),
    [rsvps],
  );

  const visibleRows = useMemo(() => {
    if (filter === "all") return rsvps;
    if (filter === "active") return active;
    return rsvps.filter((r) => r.status === filter);
  }, [rsvps, filter, active]);

  async function act(
    rsvpId: string,
    path: "approve" | "deny" | "cancel" | "approve-change" | "deny-change",
    note?: string,
  ) {
    setBusyId(rsvpId);
    setActionErr(null);
    try {
      const res = await fetch(`/api/events/${event.id}/rsvp/${rsvpId}/${path}`, {
        method: "POST",
        headers: note !== undefined ? { "content-type": "application/json" } : {},
        body: note !== undefined ? JSON.stringify({ note }) : undefined,
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setActionErr(body?.error ?? `Action failed (${res.status})`);
        return;
      }
      // This was a server-side mutation, so the onSnapshot listener has no
      // local echo for it; re-pull so the organiser sees their action land
      // without waiting on the realtime channel (or a manual reload).
      await refresh().catch(() => {});
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onApprove(r: RsvpDoc) {
    await act(r.id, "approve");
  }

  async function onDenyConfirm() {
    if (!denyFor) return;
    await act(denyFor, "deny", denyNote);
    setDenyFor(null);
    setDenyNote("");
  }

  async function onCancel(r: RsvpDoc) {
    // Somebody who held a place, or a spot on the waiting list, is told by
    // email. A request nobody had answered is withdrawn without one.
    const told = r.status === "confirmed" || r.status === "waitlisted";
    const question = told
      ? `Cancel ${r.name}’s sign-up? They are told by email, and would have to sign up again.`
      : `Cancel ${r.name}’s request? They are not emailed, and would have to sign up again.`;
    if (!window.confirm(question)) return;
    await act(r.id, "cancel");
  }

  async function onApproveChange(r: RsvpDoc) {
    await act(r.id, "approve-change");
  }

  async function onDenyChange(r: RsvpDoc) {
    if (
      !window.confirm(
        `Turn down ${r.name}’s change? The answers they gave first stay as they are.`,
      )
    )
      return;
    await act(r.id, "deny-change");
  }

  async function onSendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastSubject.trim() || !broadcastBody.trim()) {
      setBroadcastState({
        kind: "error",
        message: "Write a subject and a message before you send.",
      });
      return;
    }
    const recipientCount =
      confirmed.length + (broadcastIncludeWaitlist ? waitlisted.length : 0);
    if (recipientCount === 0) {
      setBroadcastState({
        kind: "error",
        message: "Nobody has a confirmed place or is on the waiting list, so there is nobody to email.",
      });
      return;
    }
    if (
      !window.confirm(
        `Send this update to ${recipientCount} attendee${recipientCount === 1 ? "" : "s"}?`,
      )
    )
      return;
    setBroadcastState({ kind: "sending" });
    try {
      const res = await fetch(`/api/events/${event.id}/broadcast`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: broadcastSubject,
          body: broadcastBody,
          includeWaitlisted: broadcastIncludeWaitlist,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; sent?: number; failed?: number; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setBroadcastState({
          kind: "error",
          message: body?.error ?? `Send failed (${res.status})`,
        });
        return;
      }
      setBroadcastState({
        kind: "sent",
        sent: body.sent ?? 0,
        failed: body.failed ?? 0,
      });
      setBroadcastSubject("");
      setBroadcastBody("");
    } catch (err) {
      setBroadcastState({
        kind: "error",
        message: err instanceof Error ? err.message : "Send failed",
      });
    }
  }

  async function onCopyEmails() {
    const emails = Array.from(new Set(active.map((r) => r.email))).join(", ");
    if (!emails) {
      setCopyStatus("Nobody has a confirmed place or is on the waiting list.");
      setTimeout(() => setCopyStatus(null), 3000);
      return;
    }
    const ok = await copyToClipboard(emails);
    setCopyStatus(
      ok
        ? `Copied ${active.length} address${active.length === 1 ? "" : "es"}: everyone confirmed or on the waiting list.`
        : "The addresses weren’t copied.",
    );
    setTimeout(() => setCopyStatus(null), 3000);
  }

  function onDownloadCSV() {
    const questions = event.signupForm;
    const header = [
      "name",
      "email",
      "status",
      "createdAt",
      ...questions.map((q) => q.label || q.id),
    ];
    const rows = rsvps.map((r) => [
      r.name,
      r.email,
      r.status,
      r.createdAt?.toISOString() ?? "",
      ...questions.map((q) => renderAnswer(own(r.answers, q.id))),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    const safeTitle = event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40) || "event";
    downloadCSV(`${safeTitle}-rsvps-${stamp}.csv`, toCSV(header, rows));
  }

  if (loading) {
    return (
      <p className={styles.quiet} aria-busy="true">
        Loading sign-ups…
      </p>
    );
  }

  if (error) {
    return (
      <Notice tone="warning" role="alert" title="The sign-ups didn’t load.">
        {error.message}
      </Notice>
    );
  }

  const capacityLine =
    event.capacity !== null
      ? `${confirmed.length} confirmed of ${event.capacity} places`
      : `${confirmed.length} confirmed, with no limit on places`;

  return (
    <div className={styles.wrap}>
      {/* Summary strip --------------------------------------------------- */}
      <Card as="section" padding="lg" aria-label="Sign-ups by state">
        <dl className={styles.counts}>
          <CountBox status="pending" value={pending.length} />
          <CountBox status="confirmed" value={confirmed.length} />
          <CountBox status="waitlisted" value={waitlisted.length} />
          <CountBox status="denied" value={denied.length} />
          <CountBox status="cancelled" value={cancelled.length} />
        </dl>
        <p className={styles.capacityLine}>
          {capacityLine}
          {event.foodProvenance !== "none" && (
            <Chip tone="accent">{FOOD_PROVENANCE_BADGE[event.foodProvenance]}</Chip>
          )}
        </p>
      </Card>

      {/* Broadcast composer --------------------------------------------- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Send an update</h2>
            <p className={styles.sectionHint}>
              One email to everyone with a confirmed place, and to the waiting
              list if you choose. For a room change, a reminder, a weather call.
            </p>
          </div>
          {!broadcastOpen && (
            <Button variant="secondary" onClick={() => setBroadcastOpen(true)}>
              Write an update
            </Button>
          )}
        </div>
        {broadcastOpen && (
          <Card padding="lg">
            <form onSubmit={onSendBroadcast} className={styles.form}>
              <Field
                id="broadcast-subject"
                label="Subject"
                hint="The event’s name is added to the end for you."
              >
                <Input
                  id="broadcast-subject"
                  value={broadcastSubject}
                  onChange={(e) => setBroadcastSubject(e.target.value)}
                  disabled={broadcastState.kind === "sending"}
                  maxLength={150}
                  placeholder="e.g. Room change: we’ve moved to Pope B11"
                />
              </Field>
              <Field
                id="broadcast-body"
                label="Message"
                hint="Plain text. An empty line starts a new paragraph. The time and the place are added at the bottom."
              >
                <Textarea
                  id="broadcast-body"
                  value={broadcastBody}
                  onChange={(e) => setBroadcastBody(e.target.value)}
                  disabled={broadcastState.kind === "sending"}
                  rows={6}
                  maxLength={8000}
                  placeholder="e.g. Hi all, we’ve moved from Pope A17 to Pope B11. Same time, same food. See you there."
                />
              </Field>
              <OptionRow
                checked={broadcastIncludeWaitlist}
                onChange={(e) => setBroadcastIncludeWaitlist(e.target.checked)}
                disabled={broadcastState.kind === "sending"}
                description={`${confirmed.length} confirmed, ${waitlisted.length} on the waiting list`}
              >
                Send it to the waiting list as well
              </OptionRow>
              {broadcastState.kind === "error" && (
                <p className={styles.problem} role="alert">
                  {broadcastState.message}
                </p>
              )}
              {broadcastState.kind === "sent" && (
                <p className={styles.done} role="status">
                  Sent to {broadcastState.sent} attendee
                  {broadcastState.sent === 1 ? "" : "s"}
                  {broadcastState.failed > 0 ? ` · ${broadcastState.failed} failed` : ""}.
                </p>
              )}
              <div className={styles.buttons}>
                <Button type="submit" disabled={broadcastState.kind === "sending"}>
                  {broadcastState.kind === "sending" ? "Sending…" : "Send update"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setBroadcastOpen(false);
                    setBroadcastState({ kind: "idle" });
                  }}
                  disabled={broadcastState.kind === "sending"}
                >
                  Close
                </Button>
              </div>
            </form>
          </Card>
        )}
      </section>

      {/* Pending change-requests ----------------------------------------- */}
      {pendingChanges.length > 0 && (
        <section className={styles.section}>
          <div>
            <h2 className={styles.sectionTitle}>
              Asking to change an answer ({pendingChanges.length})
            </h2>
            <p className={styles.sectionHint}>
              Usually a dietary change. Approving swaps in the new answers;
              turning it down keeps the ones they gave first.
            </p>
          </div>
          <div className={styles.queue}>
            {pendingChanges.map((r) => (
              <Card key={r.id} padding="md">
                <div className={styles.rsvpRow}>
                  <div className={styles.rsvpMain}>
                    <div>
                      <strong className={styles.who}>{r.name}</strong>
                      <span className={styles.email}>{r.email}</span>
                    </div>
                    <ChangeDiff
                      questions={event.signupForm}
                      current={r.answers}
                      proposed={r.pendingAnswers ?? {}}
                    />
                    {r.pendingAnswersRequestedAt && (
                      <div className={styles.muted}>
                        Asked {stampWords(r.pendingAnswersRequestedAt)}
                      </div>
                    )}
                  </div>
                  <div className={styles.buttons}>
                    <Button onClick={() => onApproveChange(r)} disabled={busyId === r.id}>
                      Approve change
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => onDenyChange(r)}
                      disabled={busyId === r.id}
                    >
                      Turn down
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Pending queue --------------------------------------------------- */}
      {pending.length > 0 && (
        <section className={styles.section}>
          <div>
            <h2 className={styles.sectionTitle}>Waiting for a decision ({pending.length})</h2>
            <p className={styles.sectionHint}>
              Approve or turn down each one. An approved request gets a place
              if there is one left; if the event is full and has a waiting
              list, it goes on the list.
            </p>
          </div>
          <div className={styles.queue}>
            {pending.map((r) => (
              <Card key={r.id} padding="md">
                <div className={styles.rsvpRow}>
                  <div className={styles.rsvpMain}>
                    <div>
                      <strong className={styles.who}>{r.name}</strong>
                      <span className={styles.email}>{r.email}</span>
                    </div>
                    <AnswerSummary rsvp={r} questions={event.signupForm} />
                    {r.createdAt && (
                      <div className={styles.muted}>Sent {stampWords(r.createdAt)}</div>
                    )}
                  </div>
                  <div className={styles.buttons}>
                    <Button onClick={() => onApprove(r)} disabled={busyId === r.id}>
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDenyFor(r.id);
                        setDenyNote("");
                      }}
                      disabled={busyId === r.id}
                    >
                      Turn down…
                    </Button>
                  </div>
                </div>
                {denyFor === r.id && (
                  <div className={styles.denyBox}>
                    <Field
                      id={`deny-${r.id}`}
                      label="Note to them (optional)"
                      hint="They read this: it goes in the email that tells them, as a note from the organiser. It is kept with the sign-up too."
                    >
                      <Input
                        id={`deny-${r.id}`}
                        value={denyNote}
                        onChange={(e) => setDenyNote(e.target.value)}
                        placeholder="e.g. This one is for this term’s fellows. The next social is open to everyone."
                        maxLength={500}
                      />
                    </Field>
                    <div className={styles.buttons}>
                      <Button variant="danger" onClick={onDenyConfirm} disabled={busyId === r.id}>
                        Turn down {r.name}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDenyFor(null);
                          setDenyNote("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {actionErr && (
        <Notice tone="warning" role="alert">
          {actionErr}
        </Notice>
      )}

      {/* Test data (admin) ---------------------------------------------- */}
      {role === "admin" && (
        <TestRsvpPanel
          event={event}
          syntheticCount={syntheticCount}
          onChanged={refresh}
        />
      )}

      {/* Pizza order helper --------------------------------------------- */}
      {event.signupForm.some((q) => q.type === "multiSelect") && (
        <OrderHelper event={event} rsvps={confirmed} />
      )}

      {/* Charts --------------------------------------------------------- */}
      {active.length > 0 && (
        <section className={styles.section}>
          <div>
            <h2 className={styles.sectionTitle}>Answers</h2>
            <p className={styles.sectionHint}>
              From everyone with a confirmed place or on the waiting list. Use
              these numbers when you order food.
            </p>
          </div>
          <div className={styles.chartsGrid}>
            {event.signupForm.map((q) => (
              <QuestionChart key={q.id} question={q} rsvps={active} />
            ))}
            {event.signupForm.length === 0 && (
              <p className={styles.quiet}>This event asks no questions, so there is nothing to chart.</p>
            )}
          </div>
        </section>
      )}

      {/* Attendee table + export ---------------------------------------- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Everyone who signed up</h2>
          <div className={styles.tableControls}>
            <label className={styles.filterLabel}>
              <span>Show</span>
              <ResponsiveSelect<typeof filter>
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "active", label: "Confirmed and waiting list" },
                  { value: "all", label: "Everyone" },
                  ...RSVP_STATUSES.map((s) => ({
                    value: s,
                    label: SIGNUP_WORDS[s],
                  })),
                ]}
                ariaLabel="Which sign-ups to show"
              />
            </label>
            <Button variant="secondary" onClick={onCopyEmails}>
              Copy emails
            </Button>
            <Button variant="secondary" onClick={onDownloadCSV}>
              Download CSV
            </Button>
          </div>
        </div>
        {copyStatus && (
          <p className={styles.quiet} role="status">
            {copyStatus}
          </p>
        )}

        {visibleRows.length === 0 ? (
          <p className={styles.quiet}>Nobody in this view.</p>
        ) : (
          <div className={styles.tableCard}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Status</th>
                    <th scope="col">Sent</th>
                    <th scope="col">Answers</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.id}>
                      <td className={styles.cellName}>{r.name}</td>
                      <td className={styles.cellEmail}>{r.email}</td>
                      <td>
                        <span className={styles.chips}>
                          <Chip tone={signupTone(r.status)} dot>
                            {SIGNUP_WORDS[r.status]}
                          </Chip>
                          {r.pendingAnswers && <Chip tone="warning">Change asked for</Chip>}
                          {r.synthetic && <Chip tone="neutral">Test</Chip>}
                        </span>
                      </td>
                      <td className={styles.cellDate}>
                        {r.createdAt ? dayWords(r.createdAt) : ""}
                      </td>
                      <td className={styles.cellAnswers}>
                        <AnswerSummary rsvp={r} questions={event.signupForm} />
                        {r.decisionNote && (
                          <div className={styles.decisionNote}>
                            <strong>Note:</strong> {r.decisionNote}
                          </div>
                        )}
                      </td>
                      <td className={styles.rowActions}>
                        {r.status !== "cancelled" && r.status !== "denied" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onCancel(r)}
                            disabled={busyId === r.id}
                            aria-label={`Cancel ${r.name}’s sign-up`}
                          >
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function CountBox({ status, value }: { status: RsvpStatus; value: number }) {
  return (
    <div className={styles.countBox}>
      <dt className={styles.countLabel}>
        <Chip tone={signupTone(status)} dot>
          {SIGNUP_WORDS[status]}
        </Chip>
      </dt>
      <dd className={styles.countValue}>{value}</dd>
    </div>
  );
}

function ChangeDiff({
  questions,
  current,
  proposed,
}: {
  questions: FormQuestion[];
  current: Record<string, RsvpAnswer>;
  proposed: Record<string, RsvpAnswer>;
}) {
  const rows = questions
    .map((q) => ({
      q,
      was: renderAnswer(current[q.id]),
      now: renderAnswer(proposed[q.id]),
    }))
    .filter((r) => r.was !== r.now);
  if (rows.length === 0) {
    return <p className={styles.muted}>Nothing changes: they sent the same answers again.</p>;
  }
  return (
    <ul className={styles.answerList}>
      {rows.map(({ q, was, now }) => (
        <li key={q.id}>
          <span className={styles.answerLabel}>{q.label}:</span>{" "}
          <span className={styles.was}>{was || "(empty)"}</span>{" "}
          <span className={styles.answerLabel}>→</span> <strong>{now || "(empty)"}</strong>
        </li>
      ))}
    </ul>
  );
}

function AnswerSummary({
  rsvp,
  questions,
}: {
  rsvp: RsvpDoc;
  questions: FormQuestion[];
}) {
  if (questions.length === 0) return null;
  return (
    <ul className={styles.answerList}>
      {questions.map((q) => {
        const val = renderAnswer(own(rsvp.answers, q.id));
        if (!val) return null;
        return (
          <li key={q.id}>
            <span className={styles.answerLabel}>{q.label}:</span> {val}
          </li>
        );
      })}
    </ul>
  );
}

function QuestionChart({
  question,
  rsvps,
}: {
  question: FormQuestion;
  rsvps: RsvpDoc[];
}) {
  if (question.type === "shortText" || question.type === "longText") {
    const answers = rsvps
      .map((r) => ({ name: r.name, value: renderAnswer(own(r.answers, question.id)) }))
      .filter((a) => a.value);
    return (
      <Card padding="md">
        <h3 className={styles.chartTitle}>{question.label}</h3>
        {answers.length === 0 ? (
          <p className={styles.muted}>No answers.</p>
        ) : (
          <ul className={styles.textAnswerList}>
            {answers.map((a, i) => (
              <li key={i}>
                <strong>{a.name}:</strong> {a.value}
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  // Aggregate into slices.
  const counts = new Map<string, number>();
  for (const r of rsvps) {
    const a = own(r.answers, question.id);
    if (a === undefined) continue;

    if (question.type === "yesNo") {
      if (typeof a === "boolean") {
        const k = a ? "Yes" : "No";
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    } else if (question.type === "singleSelect") {
      if (typeof a === "string" && a) {
        counts.set(a, (counts.get(a) ?? 0) + 1);
      }
    } else if (question.type === "multiSelect") {
      if (Array.isArray(a)) {
        for (const v of a) {
          if (typeof v === "string" && v) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      } else if (a && typeof a === "object") {
        const obj = a as { checked?: string[]; other?: string };
        if (Array.isArray(obj.checked)) {
          for (const v of obj.checked) {
            if (typeof v === "string" && v) counts.set(v, (counts.get(v) ?? 0) + 1);
          }
        }
        if (obj.other) counts.set("Other", (counts.get("Other") ?? 0) + 1);
      }
    } else if (question.type === "dietaryAllergies") {
      if (a && typeof a === "object" && !Array.isArray(a)) {
        const obj = a as { checked?: string[]; other?: string };
        if (Array.isArray(obj.checked)) {
          for (const v of obj.checked) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        if (obj.other) counts.set("Other", (counts.get("Other") ?? 0) + 1);
      }
    }
  }

  // Only chart what people actually picked: an all-zero pie is just noise.
  const slices: PieSlice[] = Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], i) => ({ label, count, color: pickColor(i) }));

  const totalResponses = rsvps.filter((r) => own(r.answers, question.id) !== undefined).length;
  const multiPick =
    question.type === "multiSelect" || question.type === "dietaryAllergies";

  return (
    <Card padding="md">
      <h3 className={styles.chartTitle}>{question.label}</h3>
      {slices.length === 0 ? (
        <p className={styles.muted}>No answers yet.</p>
      ) : (
        <>
          <p className={styles.muted}>
            {totalResponses} answer{totalResponses === 1 ? "" : "s"}
            {multiPick ? " · people can pick more than one" : ""}
          </p>
          <Pie slices={slices} />
        </>
      )}
    </Card>
  );
}
