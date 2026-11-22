"use client";

import Link from "next/link";
import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import type { ArchiveFix } from "@/lib/courses/groupArchive/plan";
import * as A from "@/lib/courses/groupArchive/words";
import * as W from "@/lib/courses/groupPage/words";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import styles from "./GroupPage.module.css";

/**
 * ARCHIVING A GROUP FROM ITS PAGE, and restoring an archived one: each a
 * question in a panel (a sheet on a phone, as the page's other panels are),
 * through `PATCH /api/courses/groups/[groupId]/archive`, which asks again
 * who the caller is (an admin or the programme's lead) and refuses, in one
 * sentence with the way to put it right, an archive that would lose
 * something or a restore that would break a rule. The sentence stands in
 * the panel and nothing is written. Nobody is emailed either way.
 *
 * Once it goes through: an archived group's page sends the reader to the
 * Groups tab's All groups view, which says "Group E is archived. Nobody was
 * emailed." from the address, once; a restored group's page is read again,
 * saying "Group F is back. Nobody was emailed." the same way. All groups
 * asks the same restore question from the archived groups at its foot.
 */

/** Where each way to put a refusal right goes, as the page knows them. */
export type ArchiveFixLinks = {
  /** People in groups. */
  people: string;
  /** The group's register under its page, before `?session=`; null where there is none. */
  register: string | null;
  /** The programme's people, before the person. */
  person: string;
  /** The group's own page, before `?week=`. */
  self: string;
};

type Answer = { ok: true } | { ok: false; error: string; fix: ArchiveFix | null };

async function press(groupId: string, archived: boolean): Promise<Answer> {
  try {
    const response = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; fix?: ArchiveFix | null } | null;
    if (response.ok && body?.ok === true) return { ok: true };
    // Never the route's bare "Forbidden": a sentence that says what happened.
    if (response.status === 401) return { ok: false, error: A.ARCHIVE_SIGNED_OUT, fix: null };
    if (response.status === 403) return { ok: false, error: A.ARCHIVE_NOT_YOURS, fix: null };
    return { ok: false, error: typeof body?.error === "string" ? body.error : UNKNOWN_OUTCOME, fix: body?.fix ?? null };
  } catch {
    return { ok: false, error: UNKNOWN_OUTCOME, fix: null };
  }
}

/** The link beside a refusal, or nothing where nothing on the page puts it right. */
function fixLink(fix: ArchiveFix | null, links: ArchiveFixLinks): { href: string; label: string } | null {
  if (!fix) return null;
  switch (fix.kind) {
    case "people":
      return { href: links.people, label: A.OPEN_PEOPLE_IN_GROUPS };
    case "register":
      return links.register ? { href: `${links.register}?session=${encodeURIComponent(fix.sessionKey)}`, label: A.openRegisterWords(fix.weekNumber) } : null;
    case "person":
      // Their visit's page, where it is called off.
      return { href: `${links.person}/${encodeURIComponent(fix.uid)}/visit`, label: A.openPersonWords(fix.firstName) };
    case "week":
      return { href: `${links.self}?week=${fix.weekNumber}`, label: A.changeWeekWords(fix.weekNumber) };
    default:
      return null;
  }
}

function Refused({ problem, links }: { problem: { error: string; fix: ArchiveFix | null }; links: ArchiveFixLinks }) {
  const link = fixLink(problem.fix, links);
  return (
    <div className={styles.problem} role="status">
      <p className={styles.refusedLine}>{problem.error}</p>
      {link && (
        <Link href={link.href} className={styles.fixLink}>
          {link.label}
        </Link>
      )}
    </div>
  );
}

/** Under the six rows: "Archive Group C…", which opens the question, and what it does and keeps. */
export function ArchiveFoot({ groupName, onOpen }: { groupName: string; onOpen: () => void }) {
  const hydrated = useHydrated();
  return (
    <div className={styles.archiveFoot}>
      <button type="button" className={styles.archiveLink} disabled={!hydrated} onClick={onOpen}>
        {A.archiveLinkWords(groupName)}
      </button>
      <p className={styles.cardLine}>{A.archiveLineWords(groupName)}</p>
    </div>
  );
}

/** The question before a group is archived. */
export function ArchivePanel({
  groupId,
  groupName,
  links,
  onClose,
  onDone,
}: {
  groupId: string;
  groupName: string;
  links: ArchiveFixLinks;
  onClose: () => void;
  /** Once archived: where the page goes next is the page's. */
  onDone: () => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ error: string; fix: ArchiveFix | null } | null>(null);

  async function archive() {
    setBusy(true);
    setProblem(null);
    const answer = await press(groupId, true);
    if (answer.ok) {
      onDone();
      return;
    }
    setProblem(answer);
    setBusy(false);
  }

  const titleId = `${ids}-title`;
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.panelTitle}>
          {A.archiveQuestionTitle(groupName)}
        </h2>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {W.CLOSE}
        </Button>
      </div>
      <p className={styles.panelLede}>{A.archiveQuestionBody(groupName)}</p>
      <p className={styles.panelNote}>{A.NOBODY_IS_EMAILED}</p>
      {problem && <Refused problem={problem} links={links} />}
      <div className={`${styles.panelActions} ${styles.panelActionsSheet}`}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {A.keepButtonWords(groupName)}
        </Button>
        <Button type="button" variant="danger" onClick={() => void archive()} disabled={!hydrated || busy}>
          {busy ? A.ARCHIVING : A.archiveButtonWords(groupName)}
        </Button>
      </div>
    </section>
  );
}

/** The question before an archived group is restored, saying beforehand who it comes back without. */
export function RestorePanel({
  groupId,
  groupName,
  body,
  note,
  links,
  onClose,
  onDone,
}: {
  groupId: string;
  groupName: string;
  /** "Group F comes back on the board, All groups and reminders, as it was when it was archived: …". */
  body: string;
  /** Who it comes back without, or "". */
  note: string;
  links: ArchiveFixLinks;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ error: string; fix: ArchiveFix | null } | null>(null);

  async function restore() {
    setBusy(true);
    setProblem(null);
    const answer = await press(groupId, false);
    if (answer.ok) {
      onDone();
      return;
    }
    setProblem(answer);
    setBusy(false);
  }

  const titleId = `${ids}-title`;
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.panelTitle}>
          {A.restoreQuestionTitle(groupName)}
        </h2>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {W.CLOSE}
        </Button>
      </div>
      <p className={styles.panelLede}>{body}</p>
      {note && <p className={styles.panelNote}>{note}</p>}
      <p className={styles.panelNote}>{A.NOBODY_IS_EMAILED}</p>
      {problem && <Refused problem={problem} links={links} />}
      <div className={`${styles.panelActions} ${styles.panelActionsSheet}`}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {A.KEEP_IT_ARCHIVED}
        </Button>
        <Button type="button" onClick={() => void restore()} disabled={!hydrated || busy}>
          {busy ? A.RESTORING : A.restoreButtonWords(groupName)}
        </Button>
      </div>
    </section>
  );
}
