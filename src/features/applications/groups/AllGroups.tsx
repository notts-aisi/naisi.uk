"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import shared from "@/features/applications/editor/editor.module.css";
import { RestorePanel, type ArchiveFixLinks } from "@/features/courses/groupPage/ArchiveGroup";
import groupStyles from "@/features/courses/groupPage/GroupPage.module.css";
import type { AllGroupsView, ArchivedGroupRow } from "@/lib/courses/allGroups/load";
import * as W from "@/lib/courses/allGroups/words";
import { ARCHIVE_NOT_YOURS, ARCHIVE_SIGNED_OUT, restoreLinkWords, restoreQuestionTitle, restoredSaidWords } from "@/lib/courses/groupArchive/words";
import { groupPagePath } from "@/lib/courses/groupPage/words";
import { NO_GROUPS_YET, UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import { useHydrated } from "@/hooks/useHydrated";
import { NO_FACILITATOR_YET, NO_ROOM_YET } from "./peopleInGroupsWords";
import styles from "./AllGroups.module.css";

/**
 * ALL GROUPS, a view of a programme's Groups tab: the card of groups, one row
 * per live group (its name opening the group's page, when it meets, its room,
 * its facilitators, how many are in it, and its session in the programme's
 * week), with the two rooms links and "Add a group" (Times' own) above it;
 * then the archived groups at the foot, closed until opened, each with what
 * it was, when and by whom it was archived, whether anybody is in it, the way
 * to its page and "Restore Group F…", which opens the same restore question
 * the archived group's page asks (`RestorePanel`), its words read for that
 * one group as it is pressed (`GET /api/courses/groups/[groupId]/archive`,
 * the press's own gate). Nothing about a group is changed here but restoring
 * it.
 *
 * THE LINE AFTER ARCHIVING ("Group E is archived. Nobody was emailed.") is
 * the server's, read from the address while it is true. Once drawn, the
 * address loses it (`history.replaceState`, which reads nothing again), so a
 * reload or a second visit does not say it again.
 *
 * Everything drawn is the server's (`loadAllGroups`); the state here is
 * whether the archived groups are open, which restore question is open and
 * what the last restore said.
 */
export default function AllGroups({
  roundId,
  programmeId,
  view,
  said: saidFirst,
  links,
}: {
  roundId: string;
  programmeId: string;
  view: AllGroupsView;
  /** The line after archiving, read by the server from the address while it is so. */
  said: string | null;
  links: {
    /** "The week’s rooms" and "The term’s rooms", already filtered to the programme. */
    weekRooms: { href: string; label: string };
    termRooms: { href: string; label: string };
    /** Times, opening its own Add a group; null while Times draws none (before decisions go out). */
    addGroup: { href: string; label: string } | null;
    /** People in groups, for a refusal's way to put it right. */
    people: string;
    /** The programme's people, before the person, for a refusal's "Open Agnes’s page". */
    person: string;
  };
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [said, setSaid] = useState<string | null>(saidFirst);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [restoring, setRestoring] = useState<(ArchivedGroupRow & { body: string; note: string }) | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; error: string } | null>(null);
  const [opened, setOpened] = useState(0);

  /** The restore question's words for one group, read as its Restore is pressed. */
  async function askRestore(row: ArchivedGroupRow) {
    setSaid(null);
    setProblem(null);
    setAsking(row.id);
    try {
      const response = await fetch(`/api/courses/groups/${encodeURIComponent(row.id)}/archive`);
      const body = (await response.json().catch(() => null)) as { archived?: boolean; body?: string; note?: string } | null;
      if (response.ok && body?.archived === true && typeof body.body === "string") {
        setOpened((n) => n + 1);
        setRestoring({ ...row, body: body.body, note: typeof body.note === "string" ? body.note : "" });
      } else if (response.ok) {
        // Restored somewhere else meanwhile: the list is read again.
        router.refresh();
      } else {
        setProblem({ id: row.id, error: response.status === 401 ? ARCHIVE_SIGNED_OUT : response.status === 403 ? ARCHIVE_NOT_YOURS : UNKNOWN_OUTCOME });
      }
    } catch {
      setProblem({ id: row.id, error: UNKNOWN_OUTCOME });
    } finally {
      setAsking(null);
    }
  }

  // Said once: the address loses the line's mark, so a reload says nothing.
  useEffect(() => {
    if (!saidFirst) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("archived")) return;
    url.searchParams.delete("archived");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [saidFirst]);

  const fixLinksOf = (groupId: string): ArchiveFixLinks => {
    const self = groupPagePath(roundId, programmeId, groupId);
    return { people: links.people, register: `${self}/register`, person: links.person, self };
  };

  return (
    <>
      {said && (
        <p className={groupStyles.said} role="status">
          {said}
        </p>
      )}

      <section className={shared.card} aria-labelledby="all-groups-heading">
        <div className={styles.head}>
          <h2 id="all-groups-heading" className={shared.cardTitle}>
            {W.GROUPS_HEADING}
          </h2>
          <div className={styles.headLinks}>
            <Link href={links.weekRooms.href} className={styles.textLink}>
              {links.weekRooms.label}
            </Link>
            <Link href={links.termRooms.href} className={styles.textLink}>
              {links.termRooms.label}
            </Link>
            {links.addGroup && (
              <Link href={links.addGroup.href} className={shared.btn}>
                {links.addGroup.label}
              </Link>
            )}
          </div>
        </div>
        <p className={shared.cardNote}>{W.NAMES_OPEN_PAGES}</p>
        {view.rows.length === 0 ? (
          <p className={styles.blank}>{NO_GROUPS_YET}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{W.COLUMN.group}</th>
                  <th scope="col">{W.COLUMN.meets}</th>
                  <th scope="col">{W.COLUMN.room}</th>
                  <th scope="col">{W.COLUMN.facilitators}</th>
                  <th scope="col">{W.COLUMN.people}</th>
                  {view.week !== null && <th scope="col">{view.week}</th>}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" data-label={W.COLUMN.group}>
                      <Link href={groupPagePath(roundId, programmeId, row.id)} className={styles.nameLink}>
                        {row.name}
                      </Link>
                    </th>
                    <td data-label={W.COLUMN.meets}>{row.meets}</td>
                    <td data-label={W.COLUMN.room}>{row.room ?? <span className={styles.chipWarn}>{NO_ROOM_YET}</span>}</td>
                    <td data-label={W.COLUMN.facilitators}>
                      {row.facilitators ?? <span className={styles.chipWarn}>{NO_FACILITATOR_YET}</span>}
                    </td>
                    <td data-label={W.COLUMN.people}>{row.people}</td>
                    {view.week !== null && <td data-label={view.week}>{row.week}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {view.archived.length > 0 && (
        <section className={shared.card} aria-labelledby="archived-groups-heading">
          <div className={styles.head}>
            <h2 id="archived-groups-heading" className={shared.cardTitle}>
              {W.archivedGroupsHeading(view.archived.length)}
            </h2>
            <button
              type="button"
              className={shared.btn}
              aria-expanded={archivedOpen}
              aria-controls="archived-groups-list"
              onClick={() => setArchivedOpen((open) => !open)}
            >
              {archivedOpen ? W.HIDE : W.SHOW}
            </button>
          </div>
          {/* Always there, so the button's aria-controls names it; hidden until opened. */}
          <div id="archived-groups-list" hidden={!archivedOpen}>
            <p className={shared.cardNote}>{W.ARCHIVED_GROUPS_LINE}</p>
            <ul className={styles.archived}>
              {view.archived.map((row) => (
                <li key={row.id} className={styles.archivedRow}>
                  <div className={styles.archivedMain}>
                    <Link href={groupPagePath(roundId, programmeId, row.id)} className={styles.nameLink}>
                      {row.name}
                    </Link>
                    <p className={styles.archivedLine}>{row.line}</p>
                  </div>
                  <button
                    type="button"
                    className={shared.btn}
                    disabled={!hydrated || asking !== null}
                    onClick={() => void askRestore(row)}
                  >
                    {restoreLinkWords(row.name)}
                  </button>
                  {problem?.id === row.id && (
                    <p className={styles.archivedProblem} role="status">
                      {problem.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <Modal
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        ariaLabel={restoring ? restoreQuestionTitle(restoring.name) : ""}
        side
      >
        {(dismiss) =>
          restoring ? (
            <RestorePanel
              key={opened}
              groupId={restoring.id}
              groupName={restoring.name}
              body={restoring.body}
              note={restoring.note}
              links={fixLinksOf(restoring.id)}
              onClose={dismiss}
              onDone={() => {
                // The list is read again, the group among the live ones, and the line says it.
                setRestoring(null);
                setSaid(restoredSaidWords(restoring.name));
                router.refresh();
              }}
            />
          ) : null
        }
      </Modal>
    </>
  );
}
