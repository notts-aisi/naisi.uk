"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { own } from "@/lib/applications/keys";
import type { ArrangementView } from "@/lib/applications/arrange/advise";
import styles from "./ArrangeGroups.module.css";

/**
 * Arrange with Claude, on a programme's Times view, for an admin.
 *
 * Suggest asks the arrangement route for a proposal: the site's own split of
 * the people holding a place into groups by when they are free, and Claude's
 * facilitator for each group and moves, kept only where they fit. The
 * proposal lives on this page and nowhere else.
 *
 * APPLY USES THE SITE'S OWN ROUTES, in order, and stops at the first refusal:
 * a new group is added (`.../programmes/[id]/groups`), a group with no time is
 * given one (`.../groups/[id]/time`), everybody is placed in one request
 * (`/api/courses/runs/[runId]/allocate`), and each chosen facilitator is added
 * beside the group's own (`/api/courses/groups/[id]/facilitators`). Each of
 * those asks every question it always asks. Nobody is emailed: telling people
 * their group is still Publish.
 */

type Step = { label: string; ok: boolean; detail?: string };

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const REASON: Record<string, string> = {
  "no-week": "said nothing about when they are free",
  "fits-none": "can make none of these times",
  "no-room": "no room in a group they can make",
};

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, data, error: typeof data.error === "string" ? data.error : `It answered ${response.status}.` };
}

export default function ArrangeGroups({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [arrangement, setArrangement] = useState<ArrangementView | null>(null);
  const [asking, setAsking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const base = `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;

  const suggest = async (askClaude: boolean) => {
    setAsking(true);
    setError(null);
    setSteps([]);
    try {
      const answer = await send(`${base}/arrangement`, "POST", { askClaude });
      if (!answer.ok) setError(answer.error);
      else setArrangement(answer.data.arrangement as ArrangementView);
    } catch {
      setError("That couldn’t be sent. Check your connection and try again.");
    } finally {
      setAsking(false);
    }
  };

  const apply = async () => {
    if (!arrangement) return;
    setApplying(true);
    setError(null);
    const done: Step[] = [];
    const note = (step: Step) => {
      done.push(step);
      setSteps([...done]);
      return step.ok;
    };
    try {
      // 1 and 2: every group has an id and a time.
      const ids: string[] = [];
      for (const group of arrangement.groups) {
        const start = group.session.startTimeLocal;
        if (group.id === null) {
          const made = await send(`${base}/groups`, "POST", {
            name: group.name,
            weekday: group.session.weekday,
            start,
            minutes: group.session.durationMinutes,
            places: group.room,
          });
          const id = typeof made.data.groupId === "string" ? made.data.groupId : null;
          if (!note({ label: `Add ${group.name}`, ok: made.ok && id !== null, detail: made.ok ? undefined : made.error })) return;
          ids.push(id!);
          continue;
        }
        if (group.timeIsNew && group.existing) {
          const timed = await send(`${base}/groups/${encodeURIComponent(group.id)}/time`, "PUT", {
            weekday: group.session.weekday,
            start,
            from: group.existing.slot,
          });
          if (!note({ label: `Give ${group.name} its time`, ok: timed.ok, detail: timed.ok ? undefined : timed.error })) return;
        }
        ids.push(group.id);
      }

      // 3: everybody placed, in one request.
      const placements = arrangement.groups.flatMap((group, index) =>
        group.members.map((member) => ({ uid: member.uid, groupId: ids[index] })),
      );
      const placed = await send(`/api/courses/runs/${encodeURIComponent(arrangement.runId)}/allocate`, "POST", { placements });
      const rejected = Array.isArray(placed.data.rejected) ? (placed.data.rejected as { reason?: string }[]) : [];
      if (
        !note({
          label: `Place ${placements.length} people`,
          ok: placed.ok && rejected.length === 0,
          detail: !placed.ok
            ? placed.error
            : rejected.length > 0
              ? `${rejected.length} could not be placed (${[...new Set(rejected.map((r) => r.reason))].join(", ")}). If it says not-accepted, hand everybody over to the run first.`
              : undefined,
        })
      ) return;

      // 4: each chosen facilitator, beside the group's own.
      for (const [index, group] of arrangement.groups.entries()) {
        if (!group.facilitator) continue;
        const uids = [...new Set([...(group.existing?.facilitatorUids ?? []), group.facilitator.uid])];
        const staffed = await send(`/api/courses/groups/${encodeURIComponent(ids[index])}/facilitators`, "POST", { uids });
        if (!note({ label: `${group.facilitator.name} facilitates ${group.name}`, ok: staffed.ok, detail: staffed.ok ? undefined : staffed.error })) return;
      }
      note({ label: "Done. Nobody has been emailed: Publish tells people their group.", ok: true });
      router.refresh();
    } catch {
      note({ label: "That couldn’t be sent. Check your connection; what is ticked above was saved.", ok: false });
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="Arrange with Claude">
      <div className={styles.head}>
        <h2 className={styles.title}>Arrange with Claude</h2>
        <p className={styles.line}>
          The site splits everybody holding a place into groups by when they’re free. Claude then suggests a
          facilitator for each group and any moves, and only moves that fit the times are kept. Only admins see this,
          and nothing is saved until you press Apply.
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={!hydrated || asking || applying} onClick={() => void suggest(true)}>
          {asking ? "Working it out…" : arrangement ? "Suggest again" : "Suggest an arrangement"}
        </button>
        <button type="button" className={styles.quiet} disabled={!hydrated || asking || applying} onClick={() => void suggest(false)}>
          Times only, without Claude
        </button>
        {asking ? <span className={styles.line}>Claude takes a minute or two.</span> : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {arrangement ? (
        <div className={styles.result} aria-live="polite">
          {arrangement.claude?.notes ? <p className={styles.notes}>{arrangement.claude.notes}</p> : null}
          <div className={styles.groups}>
            {arrangement.groups.map((group, index) => (
              <div key={`${group.id ?? "new"}:${index}`} className={styles.group}>
                <div className={styles.groupHead}>
                  <strong>{group.name}</strong>
                  <span className={styles.line}>
                    {DAY[group.session.weekday]} {group.session.startTimeLocal}, {group.session.durationMinutes} min ·{" "}
                    {group.members.length} of {group.room}
                    {group.id === null ? " · new group" : group.timeIsNew ? " · gets this time" : ""}
                  </span>
                </div>
                {group.facilitator ? (
                  <p className={styles.facilitator}>
                    Facilitator: <strong>{group.facilitator.name}</strong>
                    {group.facilitator.why ? <span className={styles.line}> · {group.facilitator.why}</span> : null}
                  </p>
                ) : null}
                <ul className={styles.members}>
                  {group.members.map((member) => (
                    <li key={member.uid}>
                      {member.name}
                      {member.facilitates ? <span className={styles.tag}> would facilitate</span> : null}
                      {member.moved ? <span className={styles.tag}> moved by Claude</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {arrangement.unplaced.length > 0 ? (
            <div className={styles.unplaced}>
              <strong>Left for you to place ({arrangement.unplaced.length})</strong>
              <ul className={styles.members}>
                {arrangement.unplaced.map((person) => (
                  <li key={person.uid}>
                    {person.name}: {own(REASON, person.reason) ?? person.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {arrangement.claude && arrangement.claude.dropped.length > 0 ? (
            <details className={styles.dropped}>
              <summary>Claude suggestions that didn’t fit ({arrangement.claude.dropped.length})</summary>
              <ul className={styles.members}>
                {arrangement.claude.dropped.map((entry, i) => (
                  <li key={i}>
                    {entry.suggestion}: {entry.why}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={!hydrated || asking || applying} onClick={() => void apply()}>
              {applying ? "Applying…" : "Apply this arrangement"}
            </button>
            <span className={styles.line}>Adds groups, places people and adds facilitators. Nobody is emailed.</span>
          </div>
          {steps.length > 0 ? (
            <ol className={styles.steps}>
              {steps.map((step, i) => (
                <li key={i} className={step.ok ? styles.stepOk : styles.stepFailed}>
                  {step.ok ? "✓" : "✗"} {step.label}
                  {step.detail ? <span className={styles.line}> · {step.detail}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
