"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import MarkReady from "@/features/courses/MarkReady";
import WeekBlocksLoader from "@/features/courses/WeekBlocksLoader";
import { useHydrated } from "@/hooks/useHydrated";
import type { WeekOwner } from "@/lib/courses/weeksTab/load";
import {
  GROUP_LABEL,
  IN_PERSON,
  NO_GROUPS_YET,
  ONLINE,
  ONLINE_HINT,
  OWNER_HINT,
  OWNER_LABEL,
  THIS_WEEK_IS,
  groupCopyLine,
  groupPasteLede,
  oneGroupTitle,
  previewForWords,
  saveForWords,
} from "@/lib/courses/weeksTab/words";
import styles from "./weeks.module.css";

/**
 * THE CONTROLS OF ONE WEEK'S PAGE ON A PROGRAMME'S WEEKS TAB (board
 * pr-weeks), each sending its own route, which decides who may: the paste
 * card, the week's owner, how the week meets, and Mark ready. Each reads the
 * page again from the server once its route has answered, so what the page
 * says is what is stored, never what was pressed. Each is drawn disabled
 * until the page's script has arrived, so nothing is pressed that cannot be
 * sent.
 */

/** The paste card, which reads the page again after a save. */
export function WeekPaste(props: {
  runId: string;
  weekId: string;
  weekNumber: number;
  blockWeek: boolean;
  endpoint?: string;
  saveLabel?: string;
  title?: string;
  lede?: string;
  idSuffix?: string;
}) {
  const router = useRouter();
  return <WeekBlocksLoader {...props} onSaved={() => router.refresh()} />;
}

/** "Owner": the programme's lead or one of the run's helpers. */
export function WeekOwnerField({
  runId,
  weekId,
  owners,
  value,
}: {
  runId: string;
  weekId: string;
  owners: WeekOwner[];
  /** The uid the week is shown as owned by. */
  value: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function choose(uid: string) {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/owner`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUid: uid || null }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "That didn’t save. Try again.");
      router.refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const id = `week-owner-${weekId}`;
  return (
    <Field id={id} label={OWNER_LABEL} hint={OWNER_HINT} error={problem}>
      <Select
        id={id}
        value={value}
        onChange={(event) => void choose(event.target.value)}
        disabled={!hydrated || busy || owners.length === 0}
      >
        {owners.map((owner) => (
          <option key={owner.uid} value={owner.uid}>
            {owner.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** "This week is In person / Online", for every group of the run that week. */
export function WeekModeField({
  runId,
  weekId,
  state,
  partly,
}: {
  runId: string;
  weekId: string;
  /** How the groups meeting that week meet now. */
  state: "all" | "some" | "none";
  /** The line under the buttons when only some groups meet online, or null. */
  partly: string | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: "done" | "error"; lines: string[] } | null>(null);

  async function press(online: boolean) {
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/mode`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; left?: string[] };
      if (!res.ok) throw new Error(body.error ?? "That didn’t save. Try again.");
      setSaid({ tone: "done", lines: [body.message ?? "", ...(body.left ?? [])].filter(Boolean) });
      router.refresh();
    } catch (err) {
      setSaid({ tone: "error", lines: [err instanceof Error ? err.message : "That didn’t save. Try again."] });
    } finally {
      setBusy(false);
    }
  }

  const off = !hydrated || busy;
  return (
    <div className={styles.setting}>
      <p className={styles.settingLabel} id={`week-mode-${weekId}`}>
        {THIS_WEEK_IS}
      </p>
      <div className={styles.segmented} role="group" aria-labelledby={`week-mode-${weekId}`}>
        <button
          type="button"
          className={`${styles.segment} ${state === "none" ? styles.segmentOn : ""}`}
          aria-pressed={state === "none"}
          onClick={() => void press(false)}
          disabled={off}
        >
          {IN_PERSON}
        </button>
        <button
          type="button"
          className={`${styles.segment} ${state === "all" ? styles.segmentOn : ""}`}
          aria-pressed={state === "all"}
          onClick={() => void press(true)}
          disabled={off}
        >
          {ONLINE}
        </button>
      </div>
      {partly && <p className={styles.muted}>{partly}</p>}
      <p className={styles.muted}>{ONLINE_HINT}</p>
      {said &&
        said.lines.map((line) => (
          <p key={line} className={said.tone === "error" ? styles.problem : styles.done} role={said.tone === "error" ? "alert" : "status"}>
            {line}
          </p>
        ))}
    </div>
  );
}

/** One of the run's groups, as the "for one group" card offers it. */
export type GroupChoice = {
  id: string;
  name: string;
  /** "Tuesdays at 6pm", or null. */
  when: string | null;
  /** The group's own copy of the week: the day it was made, in words, and whether it is written as blocks. Null while it reads the run's. */
  copy: { since: string | null; blockWeek: boolean } | null;
};

/**
 * A WEEK FOR ONE GROUP (Q39), on the week's page: pick one of the run's
 * groups, copy its week as Markdown, change it and paste it back. Every read
 * and save goes through the group's own route
 * (`/api/courses/groups/[groupId]/weeks/[weekId]/blocks`), which makes the
 * group's copy on the first save and never touches the run's week or another
 * group's.
 */
export function GroupWeekPaste({
  runId,
  weekId,
  weekNumber,
  groups,
  runBlockWeek,
  previewHref,
}: {
  runId: string;
  weekId: string;
  weekNumber: number;
  groups: GroupChoice[];
  /** The run's own week is written as blocks: a group with no copy has something to copy. */
  runBlockWeek: boolean;
  /** The preview's address, before `?group=`. */
  previewHref: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const group = groups.find((candidate) => candidate.id === groupId) ?? groups[0] ?? null;
  if (!group) return <p className={styles.muted}>{NO_GROUPS_YET}</p>;
  const pickId = `one-group-${weekId}`;
  return (
    <section className={styles.panel} aria-labelledby={`${pickId}-title`}>
      <h3 id={`${pickId}-title`} className={styles.subheading}>
        {oneGroupTitle(weekNumber)}
      </h3>
      <Field id={pickId} label={GROUP_LABEL}>
        <Select id={pickId} value={group.id} onChange={(event) => setGroupId(event.target.value)} disabled={!hydrated}>
          {groups.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.when ? `${candidate.name} · ${candidate.when}` : candidate.name}
            </option>
          ))}
        </Select>
      </Field>
      <p className={styles.muted}>{groupCopyLine(group.name, weekNumber, group.copy)}</p>
      <WeekBlocksLoader
        key={group.id}
        runId={runId}
        weekId={weekId}
        weekNumber={weekNumber}
        blockWeek={group.copy ? group.copy.blockWeek : runBlockWeek}
        endpoint={`/api/courses/groups/${encodeURIComponent(group.id)}/weeks/${encodeURIComponent(weekId)}/blocks`}
        saveLabel={saveForWords(group.name)}
        title={`Paste ${group.name}’s week, then check it`}
        lede={groupPasteLede(group.name)}
        idSuffix={`-${group.id}`}
        onSaved={() => router.refresh()}
      />
      {(group.copy ? group.copy.blockWeek : runBlockWeek) && (
        <p>
          <Link href={`${previewHref}?group=${encodeURIComponent(group.id)}`} className={styles.inlineLink}>
            {previewForWords(group.name)}
          </Link>
        </p>
      )}
    </section>
  );
}

/** Mark ready and Not ready, through the one route that stores Ready. */
export function WeekReady({ runId, weekId, ready }: { runId: string; weekId: string; ready: boolean }) {
  const router = useRouter();
  return (
    <MarkReady
      runId={runId}
      weekId={weekId}
      ready={ready}
      onDone={() => router.refresh()}
      classes={{ control: styles.readyControl, button: `${styles.button} ${ready ? "" : styles.buttonPrimary}`, problem: styles.problem }}
    />
  );
}
