"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import * as E from "@/lib/courses/termRoomsEmail/words";
import type { TermSection } from "@/lib/courses/weekRooms/model";
import styles from "./WeekRooms.module.css";

/**
 * TELLING EACH GROUP WHERE ITS SESSIONS ARE, on the term's rooms page: a
 * button a group ("Email Group C its rooms"), with when it was last emailed
 * and by whom, and one for every group shown. Each opens a dialog that asks
 * the route (`POST /api/courses/groups/[groupId]/rooms-email`) who the email
 * goes to and shows one email exactly as it goes; the press sends the count
 * shown and a key the dialog made when it opened, so the route works the
 * count out again and a second press of the same dialog sends nothing.
 * Nothing on this page sends it otherwise: saving the grid emails nobody.
 */

type Preview = {
  emails: number;
  sessions: number;
  fewer: number;
  sample: { firstName: string; subject: string; html: string } | null;
  none: string | null;
  limit: string | null;
};

type Group = { groupId: string; groupName: string };

/** One group in the dialog: what the route said, and what the press did. */
type Asked = Group & {
  key: string;
  preview: Preview | null;
  error: string | null;
  outcome: { ok: boolean; text: string } | null;
};

type LastEmailed = { when: string; byName: string } | null;

async function postJson(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> | null } | null> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return null;
  }
}

const urlOf = (groupId: string) => `/api/courses/groups/${encodeURIComponent(groupId)}/rooms-email`;

/** A key for one press, made when its dialog opens. */
function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Pressable: an email goes, and no limit stands in the way. */
const pressable = (each: Asked) => Boolean(each.preview && each.preview.emails > 0 && !each.preview.limit && !each.outcome?.ok);

/** A frame that grows to the email inside it, which runs no script. */
function EmailFrame({ subject, html }: { subject: string; html: string }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const fit = useCallback(() => {
    const tall = frame.current?.contentDocument?.documentElement?.scrollHeight ?? 0;
    if (tall > 0) setHeight(tall);
  }, []);
  return (
    <iframe
      ref={frame}
      srcDoc={html}
      title={`${E.PREVIEW_TITLE}: ${subject}`}
      className={styles.emailFrame}
      style={height ? { height: `${height}px` } : undefined}
      sandbox="allow-same-origin"
      onLoad={fit}
    />
  );
}

function EmailDialog({ groups, onClose }: { groups: Group[]; onClose: () => void }) {
  const router = useRouter();
  const [asked, setAsked] = useState<Asked[]>(() => groups.map((group) => ({ ...group, key: newKey(), preview: null, error: null, outcome: null })));
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // While emails are going, the browser asks before the page is left.
  useEffect(() => {
    if (!busy) return;
    const hold = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [busy]);

  // Ask the route about each group, one at a time.
  useEffect(() => {
    let live = true;
    void (async () => {
      for (const group of groups) {
        const answer = await postJson(urlOf(group.groupId), { preview: true });
        if (!live) return;
        const preview = answer?.status === 200 ? ((answer.body?.preview as Preview | undefined) ?? null) : null;
        const error = preview ? null : typeof answer?.body?.error === "string" ? answer.body.error : E.UNKNOWN_OUTCOME;
        setAsked((now) => now.map((each) => (each.groupId === group.groupId ? { ...each, preview, error } : each)));
      }
      if (live) setChecking(false);
    })();
    return () => {
      live = false;
    };
  }, [groups]);

  const toPress = asked.filter(pressable);
  const people = toPress.reduce((sum, each) => sum + (each.preview?.emails ?? 0), 0);
  const sampled = asked.find((each) => each.preview?.sample) ?? null;
  const single = groups.length === 1;
  const leftOut = asked.filter((each) => each.preview && (each.preview.none || each.preview.limit));

  async function send() {
    if (busy || toPress.length === 0) return;
    setBusy(true);
    for (const each of toPress) {
      const answer = await postJson(urlOf(each.groupId), { emailCount: each.preview?.emails ?? 0, pressKey: each.key });
      const ok = answer?.status === 200;
      const text = !answer
        ? E.UNKNOWN_OUTCOME
        : ok
          ? String(answer.body?.said ?? "")
          : typeof answer.body?.error === "string"
            ? answer.body.error
            : E.UNKNOWN_OUTCOME;
      setAsked((now) => now.map((one) => (one.groupId === each.groupId ? { ...one, outcome: { ok, text } } : one)));
    }
    setBusy(false);
    setDone(true);
    router.refresh();
  }

  const title = single ? E.emailGroupWords(groups[0].groupName) : E.EMAIL_EVERY_GROUP;
  return (
    <Modal open onClose={busy ? () => {} : onClose} ariaLabel={title} width="md">
      <div className={styles.emailDialog}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {checking ? <p className={styles.note}>{E.CHECKING}</p> : null}
        <ul className={styles.emailList}>
          {asked.map((each) => (
            <li key={each.groupId}>
              {single ? null : <strong>{each.groupName}: </strong>}
              {each.outcome ? (
                <span className={each.outcome.ok ? styles.done : styles.problem} role="status">
                  {each.outcome.text}
                </span>
              ) : each.error ? (
                <span className={styles.problem}>{each.error}</span>
              ) : !each.preview ? null : each.preview.none ? (
                <span>{each.preview.none}</span>
              ) : (
                <>
                  <span>{E.goesToWords(each.preview.emails, each.groupName)}</span>
                  {each.preview.fewer > 0 ? <span> {E.fewerLinesWords(each.preview.fewer)}</span> : null}
                  {each.preview.limit ? <span className={styles.problem}> {each.preview.limit}</span> : null}
                </>
              )}
            </li>
          ))}
        </ul>
        {!single && leftOut.length > 0 && !checking && !done ? <p className={styles.note}>{E.leftOutWords(leftOut.length)}</p> : null}
        {sampled?.preview?.sample && !done ? (
          <div className={styles.emailSample}>
            <p className={styles.note}>
              {single ? null : `${sampled.groupName}. `}
              {E.sampleWords(sampled.preview.emails, sampled.preview.sample.firstName)}
            </p>
            <EmailFrame subject={sampled.preview.sample.subject} html={sampled.preview.sample.html} />
          </div>
        ) : null}
        <div className={styles.emailActions}>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            {done ? E.CLOSE : E.CANCEL}
          </Button>
          {done ? null : (
            <Button type="button" variant="primary" disabled={checking || busy || toPress.length === 0} onClick={() => void send()}>
              {busy ? E.SENDING : single ? E.emailPeopleWords(people) : E.emailGroupsWords(toPress.length, people)}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function TermRoomsEmail({
  sections,
  emailing,
}: {
  sections: TermSection[];
  emailing: { incubators: string[]; last: Record<string, LastEmailed> };
}) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState<Group[] | null>(null);
  const incubators = new Set(emailing.incubators);
  const every: Group[] = sections
    .filter((section) => !incubators.has(section.programmeId))
    .flatMap((section) => section.rows.map((row) => ({ groupId: row.groupId, groupName: row.groupName })));

  return (
    <section className={styles.section} aria-labelledby="rooms-email">
      <h2 id="rooms-email" className={styles.sectionTitle}>
        {E.EMAIL_HEADING}
      </h2>
      <p className={styles.note}>{E.EMAIL_LEDE}</p>
      {every.length > 1 ? (
        <div className={styles.toolbar}>
          <Button type="button" variant="secondary" disabled={!hydrated} onClick={() => setOpen(every)}>
            {E.EMAIL_EVERY_GROUP}
          </Button>
        </div>
      ) : null}
      {sections.map((section) => (
        <div key={section.programmeId} className={styles.emailProgramme}>
          {sections.length > 1 ? <h3 className={styles.emailProgrammeName}>{section.programmeName}</h3> : null}
          {incubators.has(section.programmeId) ? (
            <p className={styles.note}>{E.INCUBATOR_NO_EMAIL}</p>
          ) : (
            <ul className={styles.emailGroups}>
              {section.rows.map((row) => {
                const last = emailing.last[row.groupId] ?? null;
                return (
                  <li key={row.groupId} className={styles.emailGroup}>
                    <span className={styles.emailGroupName}>{row.groupName}</span>
                    <span className={styles.note}>{last ? E.lastEmailedWords(last.when, last.byName) : E.NEVER_EMAILED}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!hydrated}
                      onClick={() => setOpen([{ groupId: row.groupId, groupName: row.groupName }])}
                    >
                      {E.emailGroupWords(row.groupName)}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
      {open ? <EmailDialog groups={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
