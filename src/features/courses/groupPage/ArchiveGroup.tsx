"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import * as W from "@/lib/courses/groupPage/words";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import styles from "./GroupPage.module.css";

/**
 * ARCHIVING A GROUP FROM ITS PAGE, and putting an archived one back, through
 * the same route as the run editor's switch
 * (`PATCH /api/courses/groups/[groupId]/archive`), which asks again who the
 * caller is and refuses, in one sentence, an archive that would lose
 * something or a restore that would break a rule. The sentence is shown
 * where the button is; nothing is written. Once it goes through the page is
 * read again: an archived group's page offers only Restore, and a restored
 * group's page is the whole page again.
 */
async function pressArchive(groupId: string, archived: boolean): Promise<string | null> {
  try {
    const response = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (response.ok && body?.ok === true) return null;
    return typeof body?.error === "string" ? body.error : UNKNOWN_OUTCOME;
  } catch {
    return UNKNOWN_OUTCOME;
  }
}

function useArchivePress(groupId: string, archived: boolean) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function press() {
    setBusy(true);
    setProblem(null);
    const refused = await pressArchive(groupId, archived);
    if (refused) {
      setProblem(refused);
      setBusy(false);
      return;
    }
    router.refresh();
  }
  return { off: !hydrated || busy, busy, problem, press };
}

/** The last part of "How Group B meets": what archiving does and keeps, then one button. */
export function ArchiveItem({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { off, busy, problem, press } = useArchivePress(groupId, true);
  return (
    <div className={styles.meetsItem}>
      <dt className={styles.meetsLabel}>{W.ARCHIVE}</dt>
      <dd className={styles.meetsValue}>{W.ARCHIVE_LINE}</dd>
      {problem && (
        <dd className={styles.problem} role="status">
          {problem}
        </dd>
      )}
      <dd className={styles.meetsAction}>
        <button type="button" className={styles.button} disabled={off} onClick={() => void press()}>
          {busy ? W.ARCHIVING : W.archiveButtonWords(groupName)}
        </button>
      </dd>
    </div>
  );
}

/** An archived group's page: its name, that it is archived, Restore, and the way back to the Groups tab. */
export function ArchivedGroup({ groupId, groupName, groupsHref }: { groupId: string; groupName: string; groupsHref: string }) {
  const { off, busy, problem, press } = useArchivePress(groupId, false);
  return (
    <section className={styles.card} aria-labelledby="group-archived" data-testid="group-archived">
      <p>
        <Link href={groupsHref} className={styles.personLink}>
          {W.GROUPS}
        </Link>
      </p>
      <h1 id="group-archived" className={styles.cardTitle}>
        {groupName}
      </h1>
      <p className={styles.cardLine}>{W.ARCHIVED_LINE}</p>
      {problem && (
        <p className={styles.problem} role="status">
          {problem}
        </p>
      )}
      <div className={styles.meetsAction}>
        <button type="button" className={styles.buttonPrimary} disabled={off} onClick={() => void press()}>
          {busy ? W.RESTORING : W.restoreButtonWords(groupName)}
        </button>
      </div>
    </section>
  );
}
