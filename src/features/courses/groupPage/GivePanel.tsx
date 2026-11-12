"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { RunFacilitatorsPayload } from "@/app/api/courses/runs/[runId]/facilitators/route";
import Button from "@/components/ui/Button";
import PersonSelector from "@/components/ui/PersonSelector";
import { useHydrated } from "@/hooks/useHydrated";
import type { GroupPageView, GroupPageWeek } from "@/lib/courses/groupPage/model";
import * as W from "@/lib/courses/groupPage/words";
import { coverCandidatesOf, firstWordOf } from "@/lib/courses/registerCover/pageModel";
import {
  CHOOSE_SOMEBODY,
  OFF_UNLESS_TICKED,
  READING_PEOPLE,
  SOMEONE_ELSE_IS_COVERING,
  WHOS_COVERING,
  emailToWords,
  gaveWords,
  givenAlreadyWords,
  giveButtonWords,
  giveLede,
  giveWhatTheyGet,
  tellGroupWords,
} from "@/lib/courses/registerCover/pageWords";
import { UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import { normalizeUser, type UserDoc } from "@/lib/firestore/users";
import styles from "./GroupPage.module.css";

/**
 * SOMEONE ELSE IS COVERING: one session of the group given to somebody, for
 * that session only, until midnight (`POST .../attendance/cover` with a
 * `person`). Who (the person picker the Facilitators view uses to add a
 * facilitator, from the same list, narrowed to the people the route admits:
 * admins, the committee, the programme's leads and its facilitators,
 * `coverCandidatesOf`), who has the session already (the preview's
 * `replaces`), what
 * they get and for how long (the preview's `until`), the tick to tell the
 * group (off unless ticked, with its count), the email to them as the
 * preview returns it, and one button that says what it sends and to how
 * many. The count is checked again at the press: a 409 shows the new count
 * and asks again. Nothing here holds an address or a meeting link.
 */

type Preview = {
  until: string | null;
  replaces: { kind: "self" | "given"; byUid: string; name: string; live: boolean } | null;
  person: { uid: string; name: string; emailed: number } | null;
  email: { subject: string; lines: string[]; button: string } | null;
  notice: { subject: string; lines: string[]; emails: number; refused: boolean } | null;
};

async function postJson(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> | null } | null> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return null;
  }
}

export default function GivePanel({
  view,
  week,
  onClose,
  onDone,
}: {
  view: GroupPageView;
  week: GroupPageWeek;
  onClose: () => void;
  onDone: (said: string) => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const [people, setPeople] = useState<RunFacilitatorsPayload | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [answered, setAnswered] = useState<{ uid: string; preview: Preview | null; error: string | null } | null>(null);
  const [tell, setTell] = useState(false);
  const [emailsSaid, setEmailsSaid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const url = `/api/courses/groups/${encodeURIComponent(view.groupId)}/attendance/cover`;

  // Anybody with an approved account, as the Facilitators view lists them.
  useEffect(() => {
    let stale = false;
    fetch(`/api/courses/runs/${encodeURIComponent(view.runId)}/facilitators`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (RunFacilitatorsPayload & { error?: string }) | null;
        if (!response.ok || !body || !Array.isArray(body.people)) throw new Error(body?.error ?? UNKNOWN_OUTCOME);
        if (!stale) setPeople(body);
      })
      .catch((err: unknown) => {
        if (!stale) setReading(err instanceof Error ? err.message : UNKNOWN_OUTCOME);
      });
    return () => {
      stale = true;
    };
  }, [view.runId]);

  // The people the route admits, never the group's own facilitators (they take the register as usual).
  const users: UserDoc[] = useMemo(
    () =>
      coverCandidatesOf({
        people: people?.people ?? [],
        groups: people?.groups ?? [],
        leadUids: view.coverLeadUids,
        groupId: view.groupId,
      }).map((person) => normalizeUser(person.uid, { displayName: person.name, role: person.role })),
    [people, view.coverLeadUids, view.groupId],
  );

  // What a press would do, for the person chosen: the route's own preview.
  useEffect(() => {
    if (!chosen) return;
    let stale = false;
    void postJson(url, { weekNumber: week.weekNumber, person: chosen, preview: true }).then((answer) => {
      if (stale) return;
      const said = typeof answer?.body?.error === "string" ? answer.body.error : null;
      if (!answer || answer.status !== 200 || answer.body?.ok !== true) {
        setAnswered({ uid: chosen, preview: null, error: said ?? UNKNOWN_OUTCOME });
        return;
      }
      setAnswered({ uid: chosen, preview: answer.body.preview as Preview, error: null });
    });
    return () => {
      stale = true;
    };
  }, [chosen, url, week.weekNumber]);

  const preview = answered && answered.uid === chosen ? answered.preview : null;
  const refused = answered && answered.uid === chosen ? answered.error : null;
  const first = preview?.person ? firstWordOf(preview.person.name) || preview.person.name : "";
  const groupEmails = emailsSaid ?? preview?.notice?.emails ?? 0;
  const canTell = Boolean(preview?.notice && !preview.notice.refused && groupEmails > 0);
  const telling = tell && canTell;
  const today = week.dateKey === view.todayKey;
  // The same session given to the same person again sends nothing: the route answers 409, so the button is not offered.
  const alreadyTheirs = Boolean(preview?.replaces && preview.replaces.kind === "given" && preview.replaces.live && preview.replaces.byUid === chosen);
  const off = !hydrated || busy;

  async function press() {
    if (!chosen || !preview?.person) return;
    setBusy(true);
    setProblem(null);
    const answer = await postJson(url, {
      weekNumber: week.weekNumber,
      person: chosen,
      tell: telling,
      ...(telling ? { emailCount: groupEmails } : {}),
    });
    setBusy(false);
    if (!answer) return setProblem(UNKNOWN_OUTCOME);
    const said = typeof answer.body?.error === "string" ? answer.body.error : null;
    if (answer.status === 409 && typeof answer.body?.emails === "number") {
      // The group changed since this was opened: the new count, and press again. Nothing changed.
      setEmailsSaid(answer.body.emails);
      return setProblem(said ?? UNKNOWN_OUTCOME);
    }
    if (answer.status !== 200 || answer.body?.ok !== true) return setProblem(said ?? UNKNOWN_OUTCOME);
    const notice = answer.body.notice as { sent?: number } | null;
    onDone(gaveWords(first, answer.body.email === "sent", notice?.sent ?? 0));
  }

  return (
    <section className={styles.panel} aria-labelledby={`${ids}-title`} data-testid="give-panel">
      <div className={styles.panelHead}>
        <h2 id={`${ids}-title`} className={styles.panelTitle}>
          {SOMEONE_ELSE_IS_COVERING}
        </h2>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {W.CLOSE}
        </Button>
      </div>
      <p className={styles.panelLede}>{giveLede(view.groupName, week.dateKey, week.hhmm, week.room, view.todayKey)}</p>

      <div className={styles.field}>
        <span className={styles.fieldLabel} id={`${ids}-who`}>
          {WHOS_COVERING}
        </span>
        {people ? (
          <PersonSelector
            users={users}
            selected={chosen ? [chosen] : []}
            onChange={(uids) => {
              setChosen(uids[uids.length - 1] ?? null);
              setTell(false);
              setEmailsSaid(null);
              setProblem(null);
            }}
            label={WHOS_COVERING}
            role="facilitator"
            max={1}
          />
        ) : (
          <p className={styles.fieldHint} role="status">
            {reading ?? READING_PEOPLE}
          </p>
        )}
        <p className={styles.fieldHint}>{giveWhatTheyGet(preview?.until ?? null)}</p>
      </div>

      {preview?.replaces && (
        <p className={styles.panelNote}>
          {givenAlreadyWords(preview.replaces, alreadyTheirs)}
        </p>
      )}
      {!chosen && week.cover && <p className={styles.panelNote}>{givenAlreadyWords({ name: week.cover.byName, kind: week.cover.kind, live: week.cover.live }, false)}</p>}
      {!chosen && <p className={styles.previewNote}>{CHOOSE_SOMEBODY}</p>}
      {chosen && !preview && !refused && <p className={styles.previewNote}>{W.CHECKING}</p>}
      {refused && <p className={styles.previewRefused}>{refused}</p>}

      {preview?.person && preview.notice && (
        <label className={styles.tick}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={telling}
            disabled={off || !canTell}
            onChange={(event) => setTell(event.target.checked)}
          />
          <span className={styles.optionText}>
            <span className={styles.optionName}>{tellGroupWords(view.groupName, first, today, week.dateKey, groupEmails)}</span>
            <span className={styles.optionHint}>{OFF_UNLESS_TICKED}</span>
          </span>
        </label>
      )}

      {preview?.email && (
        <div className={styles.notice}>
          <p className={styles.noticeTo}>{emailToWords(first)}</p>
          <p className={styles.noticeSubject}>{preview.email.subject}</p>
          {preview.email.lines.map((line) => (
            <p key={line} className={styles.noticeLine}>
              {line}
            </p>
          ))}
        </div>
      )}
      {telling && preview?.notice && (
        <div className={styles.notice}>
          <p className={styles.noticeTo}>{`To ${view.groupName}`}</p>
          <p className={styles.noticeSubject}>{preview.notice.subject}</p>
          {preview.notice.lines.map((line) => (
            <p key={line} className={styles.noticeLine}>
              {line}
            </p>
          ))}
        </div>
      )}

      {problem && (
        <p className={styles.problem} role="status">
          {problem}
        </p>
      )}

      <div className={styles.panelActions}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {W.CANCEL}
        </Button>
        <Button type="button" onClick={() => void press()} disabled={off || !preview?.person || alreadyTheirs}>
          {busy ? W.SAVING : preview?.person ? giveButtonWords(first, preview.person.emailed, telling ? groupEmails : 0) : SOMEONE_ELSE_IS_COVERING}
        </Button>
      </div>
    </section>
  );
}
