"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useState } from "react";
import type { RunFacilitatorsPayload } from "@/app/api/courses/runs/[runId]/facilitators/route";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import InitialsChip from "@/components/ui/InitialsChip";
import PersonSelector from "@/components/ui/PersonSelector";
import { setGroupFacilitators } from "@/features/courses/courseMutations";
import { useHydrated } from "@/hooks/useHydrated";
import { own } from "@/lib/applications/keys";
import type { FacilitatorsModel, ViewChip, ViewGroup, ViewPerson } from "@/lib/courses/facilitatorAsks/load";
import {
  ASKED,
  ASK_BUTTON,
  ASK_GROUP_LABEL,
  ASK_PERSON_LABEL,
  ASK_REPLY_DATE_LABEL,
  ASK_REPLY_TIME_LABEL,
  ASK_REPLY_TO,
  ASK_SOMEONE_ELSE,
  CHANGE_EMAILS_NOBODY,
  EMAILS_ONE,
  EMAIL_FIELDS,
  EMAIL_FROM,
  FORM_NEVER_ASKED,
  NOBODY_ASKED_YET,
  NOT_ANSWERED,
  NO_TRAINING_SET,
  SEND_TEST,
  TABLE_COLUMNS,
  ASK_AFTER_DECISIONS,
  askButtonName,
  askHeading,
  askSendLabel,
  askSomeoneElseHeading,
  changeSavedWords,
  clockIn,
  composeAskEmail,
  dayIn,
  emailCardTitle,
  nobodyWouldWords,
  remindLabel,
  tableHeading,
  tableLine,
  testFirstWords,
  testWords,
  type AskEmail,
} from "@/lib/courses/facilitatorAsks/words";
import { GROUP_FIELD_LIMITS } from "@/lib/firestore/courseGroups";
import { normalizeUser, type UserDoc } from "@/lib/firestore/users";
import styles from "./GroupFacilitators.module.css";

/**
 * THE FACILITATORS VIEW of a programme's Groups tab (board st-facilitators),
 * for the programme's lead and admins: each group with who facilitates it and
 * who has been asked, the email the last person asked got, and the people who
 * said on the form they would like to facilitate, each with where they stand
 * and, where it is allowed, "Ask to facilitate…".
 *
 * Read from `GET /api/courses/runs/[runId]/facilitators/asking` (names, the
 * form's facilitator answers and the email as it went: never an address).
 * Asking, reminding and "Send a test to me" go through the programme's own
 * routes, which decide again who may and what is true. Every button that
 * emails says how many it reaches. After each press the view is read again,
 * so what is on the screen is what is stored.
 *
 * "Change" staffs a group by hand, as before asking existed, through the
 * group's own facilitators route (the run editor's), and emails nobody: an
 * incubator's lead takes its register that way, and somebody who said yes
 * and then cannot do it is taken off that way.
 */

type Props = { runId: string };

type Said = { tone: "ok" | "problem"; text: string };

/** What the ask panel is open for: one person from the list, or another person for a group's place. */
type Asking =
  | { mode: "person"; uid: string }
  | { mode: "seat"; groupId: string; seat: string };

const COULD_NOT_READ = "The groups could not be read. Reload the page to try again.";
const COULD_NOT_REACH = "We couldn’t reach the site, so nothing was sent. Check your connection and try again.";

async function post(url: string, body: unknown): Promise<{ ok: boolean; answer: Record<string, unknown> | null }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, answer };
}

function chipTone(chip: ViewChip): "success" | "warning" | "neutral" {
  return chip.tone === "yes" ? "success" : chip.tone === "asked" ? "warning" : "neutral";
}

function StatusChip({ chip }: { chip: ViewChip | null }) {
  if (!chip) return null;
  return (
    <Chip tone={chipTone(chip)} size="sm" dot={chip.tone !== "quiet"} className={styles.chip}>
      {chip.words}
    </Chip>
  );
}

/** The email, as a letter: the card beside the groups, and the preview in the ask. */
function Letter({ email, to }: { email: AskEmail; to: string }) {
  return (
    <div className={styles.letter}>
      <dl className={styles.letterHead}>
        <div className={styles.letterField}>
          <dt>{EMAIL_FIELDS.from}</dt>
          <dd>{EMAIL_FROM}</dd>
        </div>
        <div className={styles.letterField}>
          <dt>{EMAIL_FIELDS.replyTo}</dt>
          <dd>{ASK_REPLY_TO}</dd>
        </div>
        <div className={styles.letterField}>
          <dt>{EMAIL_FIELDS.to}</dt>
          <dd>{to}</dd>
        </div>
        <div className={styles.letterField}>
          <dt>{EMAIL_FIELDS.subject}</dt>
          <dd className={styles.letterSubject}>{email.subject}</dd>
        </div>
      </dl>
      <div className={styles.letterBody}>
        <p>{email.greeting}</p>
        {email.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {/* The button as the email draws it. Not a link here: it opens the person's own page. */}
        <span className={styles.letterButton}>{email.button.label}</span>
        <p className={styles.letterSign}>
          {email.signOff.name}
          {email.signOff.role ? (
            <>
              <br />
              <span className={styles.letterRole}>{email.signOff.role}</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export default function GroupFacilitators({ runId }: Props) {
  const hydrated = useHydrated();
  const ids = useId();
  const [model, setModel] = useState<FacilitatorsModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // State is set only when a read lands, never in the effect's own body.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses/runs/${encodeURIComponent(runId)}/facilitators/asking`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (FacilitatorsModel & { error?: string }) | null;
        if (!response.ok || !body || !Array.isArray(body.groups)) throw new Error(body?.error ?? COULD_NOT_READ);
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setModel(body);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : COULD_NOT_READ);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, nonce]);

  // ---- Change, by hand -----------------------------------------------------
  const [candidates, setCandidates] = useState<RunFacilitatorsPayload["people"] | null>(null);
  const [editing, setEditing] = useState<{ groupId: string; uids: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || candidates) return;
    let cancelled = false;
    fetch(`/api/courses/runs/${encodeURIComponent(runId)}/facilitators`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (RunFacilitatorsPayload & { error?: string }) | null;
        if (!response.ok || !body || !Array.isArray(body.people)) throw new Error(body?.error ?? COULD_NOT_READ);
        return body.people;
      })
      .then((people) => {
        if (!cancelled) setCandidates(people);
      })
      .catch((err: unknown) => {
        if (!cancelled) setProblem(err instanceof Error ? err.message : COULD_NOT_READ);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, candidates, runId]);

  const users: UserDoc[] = useMemo(
    () => (candidates ?? []).map((person) => normalizeUser(person.uid, { displayName: person.name, role: person.role })),
    [candidates],
  );

  async function saveChange() {
    if (!editing) return;
    setSaving(true);
    setProblem(null);
    try {
      const { placed } = await setGroupFacilitators(editing.groupId, editing.uids);
      const name = model?.groups.find((group) => group.id === editing.groupId)?.name || "The group";
      setEditing(null);
      setSaved(changeSavedWords(name, placed));
      reload();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---- Asking ---------------------------------------------------------------
  const [asking, setAsking] = useState<Asking | null>(null);
  const [askGroup, setAskGroup] = useState("");
  const [askWho, setAskWho] = useState("");
  const [replyDate, setReplyDate] = useState("");
  const [replyTime, setReplyTime] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  const [groupSaid, setGroupSaid] = useState<{ groupId: string; said: Said } | null>(null);
  const [openAnswers, setOpenAnswers] = useState<ReadonlySet<string>>(new Set());

  const base = model
    ? `/api/admissions/forms/${encodeURIComponent(model.roundId)}/programmes/${encodeURIComponent(model.programmeId)}/facilitators`
    : "";

  function openAsk(next: Asking) {
    setAsking(next);
    setSaid(null);
    setGroupSaid(null);
    setAskWho(next.mode === "person" ? next.uid : "");
    setAskGroup(next.mode === "seat" ? next.groupId : "");
  }

  const askUid = asking?.mode === "person" ? asking.uid : askWho;
  const person = model?.people.find((each) => each.uid === askUid) ?? null;
  const group = model?.groups.find((each) => each.id === askGroup) ?? null;
  const replyBy = replyDate && replyTime ? { dateKey: replyDate, time: replyTime } : null;
  const tested =
    model?.test.state === "fresh" &&
    replyBy !== null &&
    model.test.replyBy?.dateKey === replyBy.dateKey &&
    model.test.replyBy?.time === replyBy.time;

  const preview: AskEmail | null =
    model && person && group && replyBy
      ? composeAskEmail({
          firstName: person.firstName,
          shortName: model.shortName,
          programmeName: model.programmeName,
          groupName: group.name,
          meets: group.meets ?? "",
          where: group.where,
          weeks: group.weeks,
          firstSession: group.firstSession ?? "",
          capacity: group.capacity,
          training: model.training,
          replyBy: { day: dayIn(replyBy.dateKey) ?? "", time: clockIn(replyBy.time) ?? "" },
          leadName: model.leadName,
          link: "#",
        })
      : null;

  const off = !hydrated || busy !== null;
  const replyByWords = replyBy ? `${dayIn(replyBy.dateKey)} at ${clockIn(replyBy.time)}` : "";

  async function sendTest() {
    if (!person || !group || !replyBy) return;
    setBusy("test");
    setSaid(null);
    try {
      const { ok, answer } = await post(`${base}/ask/test`, { uid: person.uid, groupId: group.id, replyBy });
      const delivery = answer?.delivery as "sent" | "held" | "suppressed" | undefined;
      if (ok && delivery) setSaid({ tone: delivery === "sent" ? "ok" : "problem", text: testWords(delivery, replyByWords) });
      else setSaid({ tone: "problem", text: String(answer?.error ?? COULD_NOT_REACH) });
      reload();
    } catch {
      setSaid({ tone: "problem", text: COULD_NOT_REACH });
    } finally {
      setBusy(null);
    }
  }

  async function sendAsk() {
    if (!person || !group || !replyBy || !asking) return;
    setBusy("ask");
    setSaid(null);
    try {
      const { ok, answer } = await post(`${base}/ask`, {
        uid: person.uid,
        groupId: group.id,
        replyBy,
        emails: 1,
        seat: asking.mode === "seat" ? asking.seat : null,
      });
      if (ok) {
        setAsking(null);
        setGroupSaid({ groupId: group.id, said: { tone: "ok", text: String(answer?.said ?? "") } });
      } else {
        setSaid({ tone: "problem", text: String(answer?.error ?? COULD_NOT_REACH) });
      }
      reload();
    } catch {
      setSaid({ tone: "problem", text: COULD_NOT_REACH });
    } finally {
      setBusy(null);
    }
  }

  async function remind(groupId: string, askId: string) {
    setBusy(`remind:${askId}`);
    setGroupSaid(null);
    try {
      const { ok, answer } = await post(`${base}/remind`, { askId, emails: 1 });
      setGroupSaid({
        groupId,
        said: ok
          ? { tone: "ok", text: String(answer?.said ?? "") }
          : { tone: "problem", text: String(answer?.error ?? COULD_NOT_REACH) },
      });
      reload();
    } catch {
      setGroupSaid({ groupId, said: { tone: "problem", text: COULD_NOT_REACH } });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <p className={styles.problem} role="alert">
        {loadError}
      </p>
    );
  }
  if (!model) {
    return (
      <p className={styles.muted} role="status">
        Reading the groups…
      </p>
    );
  }

  const askable = model.people.filter((each) => each.status.ask === "button");
  const closed = model.columns.filter((column) => column.look === "plain");
  const written = model.columns.filter((column) => column.look === "quote");
  const span = 3 + closed.length;
  const cannotSend = !model.siteAddress;

  // ---- The ask panel ---------------------------------------------------------
  const panel = asking ? (
    <section className={styles.ask} role="group" aria-labelledby={`${ids}-ask`}>
      <h3 id={`${ids}-ask`} className={styles.askTitle}>
        {asking.mode === "person"
          ? askHeading(person?.name ?? "")
          : askSomeoneElseHeading(model.groups.find((each) => each.id === asking.groupId)?.name ?? "")}
      </h3>
      <div className={styles.askFields}>
        {asking.mode === "seat" ? (
          <fieldset className={styles.choices}>
            <legend className={styles.fieldLabel}>{ASK_PERSON_LABEL}</legend>
            {askable.map((each) => (
              <label key={each.uid} className={styles.choice}>
                <input
                  type="radio"
                  name={`${ids}-who`}
                  value={each.uid}
                  checked={askWho === each.uid}
                  disabled={off}
                  onChange={() => {
                    setSaid(null);
                    setAskWho(each.uid);
                  }}
                />
                <span>{each.name}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <fieldset className={styles.choices}>
            <legend className={styles.fieldLabel}>{ASK_GROUP_LABEL}</legend>
            {model.groups
              .filter((each) => each.askable)
              .map((each) => (
                <label key={each.id} className={styles.choice}>
                  <input
                    type="radio"
                    name={`${ids}-group`}
                    value={each.id}
                    checked={askGroup === each.id}
                    disabled={off}
                    onChange={() => {
                      setSaid(null);
                      setAskGroup(each.id);
                    }}
                  />
                  <span>{each.short ? `${each.name}, ${each.short}` : each.name}</span>
                </label>
              ))}
          </fieldset>
        )}
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`${ids}-date`}>
            {ASK_REPLY_DATE_LABEL}
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            className={styles.input}
            min={model.today}
            value={replyDate}
            disabled={off}
            onChange={(event) => {
              setSaid(null);
              setReplyDate(event.target.value);
            }}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`${ids}-time`}>
            {ASK_REPLY_TIME_LABEL}
          </label>
          <input
            id={`${ids}-time`}
            type="time"
            className={styles.input}
            value={replyTime}
            disabled={off}
            onChange={(event) => {
              setSaid(null);
              setReplyTime(event.target.value);
            }}
          />
        </div>
      </div>

      {preview && person ? (
        <Letter email={preview} to={person.name} />
      ) : (
        <p className={styles.muted}>
          {!person
            ? "Choose who to ask, and the email they will get shows here."
            : !group
              ? `Choose the group the email asks ${person.firstName} to facilitate.`
              : !replyBy
                ? "Choose the day and time to answer by."
                : `${group.name} has no session still to come, so no email can name its time.`}
        </p>
      )}
      {!model.training && preview ? <p className={styles.muted}>{NO_TRAINING_SET}</p> : null}

      <div className={styles.askActions}>
        <Button variant="secondary" disabled={off || !preview || cannotSend} onClick={() => void sendTest()}>
          {busy === "test" ? "Sending the test…" : SEND_TEST}
        </Button>
        <Button disabled={off || !preview || !tested || cannotSend} onClick={() => void sendAsk()}>
          {busy === "ask" ? "Asking…" : askSendLabel(person?.firstName ?? "")}
        </Button>
        <span className={styles.emails}>{EMAILS_ONE}</span>
        <Button variant="ghost" disabled={busy !== null} onClick={() => setAsking(null)}>
          Cancel
        </Button>
      </div>
      {preview && !tested ? <p className={styles.muted}>{testFirstWords(replyByWords)}</p> : null}
      {said ? (
        <p className={said.tone === "ok" ? styles.saidOk : styles.problem} role="status">
          {said.text}
        </p>
      ) : null}
    </section>
  ) : null;

  // ---- The groups card --------------------------------------------------------
  const groupBlock = (each: ViewGroup) => {
    const open = editing?.groupId === each.id;
    const canAskElse = model.decisionsSent && askable.length > 0;
    return (
      <li key={each.id} className={styles.group}>
        <div className={styles.groupHead}>
          <strong className={styles.groupName}>{each.name || "Untitled group"}</strong>
          <span className={styles.muted}>{each.short ?? "No day and time yet"}</span>
        </div>
        <div className={styles.groupBody}>
          {open ? (
            <>
              {candidates ? (
                <PersonSelector
                  users={users}
                  selected={editing.uids}
                  onChange={(uids) => setEditing({ groupId: each.id, uids })}
                  label={`Facilitators of ${each.name}`}
                  role="facilitator"
                  max={GROUP_FIELD_LIMITS.maxFacilitators}
                />
              ) : (
                <p className={styles.muted} role="status">
                  Reading who could facilitate…
                </p>
              )}
              {problem && (
                <p className={styles.problem} role="alert">
                  {problem}
                </p>
              )}
              <div className={styles.actions}>
                <Button onClick={() => void saveChange()} disabled={saving || !candidates}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(null);
                    setProblem(null);
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              {each.facilitators.length === 0 && each.asks.length === 0 ? (
                <p className={styles.muted}>Nobody facilitates it yet.</p>
              ) : (
                <ul className={styles.people}>
                  {each.facilitators.map((facilitator) => (
                    <li key={facilitator.uid} className={styles.person}>
                      <span className={styles.personName}>
                        <InitialsChip name={facilitator.name} uid={facilitator.uid} size="sm" />
                        <span>{facilitator.name}</span>
                      </span>
                      <StatusChip chip={facilitator.chip} />
                    </li>
                  ))}
                  {each.asks.map((ask) => (
                    // Each ask with what can be done about it, under its own row:
                    // a group can wait on more than one person.
                    <li key={ask.id} className={styles.askItem}>
                      <span className={styles.person}>
                        <span className={styles.personName}>
                          <InitialsChip name={ask.name} uid={ask.uid} size="sm" />
                          <span>{ask.name}</span>
                        </span>
                        <StatusChip chip={ask.chip} />
                      </span>
                      {ask.canRemind || ask.reminded || canAskElse ? (
                        <span className={styles.groupActions}>
                          {ask.canRemind ? (
                            <>
                              <Button
                                variant="secondary"
                                disabled={off || cannotSend}
                                onClick={() => void remind(each.id, ask.id)}
                              >
                                {busy === `remind:${ask.id}` ? "Reminding…" : remindLabel(ask.firstName)}
                              </Button>
                              <span className={styles.emails}>{EMAILS_ONE}</span>
                            </>
                          ) : ask.reminded ? (
                            <span className={styles.emails}>{ask.reminded}</span>
                          ) : null}
                          {canAskElse ? (
                            <button
                              type="button"
                              className={styles.linkButton}
                              disabled={off}
                              onClick={() => openAsk({ mode: "seat", groupId: each.id, seat: ask.seat })}
                            >
                              {ASK_SOMEONE_ELSE}
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {groupSaid?.groupId === each.id ? (
                <p className={groupSaid.said.tone === "ok" ? styles.saidOk : styles.problem} role="status">
                  {groupSaid.said.text}
                </p>
              ) : null}
              {asking?.mode === "seat" && asking.groupId === each.id ? panel : null}
              <Button
                variant="secondary"
                size="sm"
                className={styles.change}
                aria-label={`Change ${each.name}’s facilitators`}
                onClick={() => {
                  setSaved(null);
                  setProblem(null);
                  setEditing({ groupId: each.id, uids: [...each.facilitatorUids] });
                }}
                disabled={editing !== null}
              >
                Change
              </Button>
            </>
          )}
        </div>
      </li>
    );
  };

  const personRow = (each: ViewPerson) => {
    const answersOpen = openAnswers.has(each.uid);
    const long = written.some((column) => (own(each.answers, column.key) ?? "").length > 90);
    return (
      <Fragment key={each.uid}>
        <tr className={styles.row}>
          <th scope="row" className={styles.personCell}>
            <span className={styles.personName}>
              <InitialsChip name={each.name} uid={each.uid} size="sm" />
              <span className={styles.personText}>
                <span className={styles.name}>{each.name}</span>
                {each.detail ? <span className={styles.detail}>{each.detail}</span> : null}
              </span>
            </span>
          </th>
          {closed.map((column) => (
            <td key={column.key} className={styles.answerCell}>
              {own(each.answers, column.key) || <span className={styles.muted}>{NOT_ANSWERED}</span>}
            </td>
          ))}
          <td className={styles.statusCell}>
            <StatusChip chip={each.status.chip} />
            {each.status.note ? <span className={styles.note}>{each.status.note}</span> : null}
          </td>
          <td className={styles.askCell}>
            {each.status.ask === "asked" ? (
              <span className={styles.asked}>{ASKED}</span>
            ) : each.status.ask === "button" ? (
              <Button
                variant="secondary"
                aria-label={askButtonName(each.name)}
                disabled={off || cannotSend}
                onClick={() => openAsk({ mode: "person", uid: each.uid })}
              >
                {ASK_BUTTON}
              </Button>
            ) : null}
          </td>
        </tr>
        {written.length > 0 ? (
          <tr className={styles.writtenRow}>
            <td colSpan={span}>
              <dl className={answersOpen ? `${styles.written} ${styles.writtenOpen}` : styles.written}>
                {written.map((column) => {
                  const answer = own(each.answers, column.key);
                  return (
                    <div key={column.key} className={styles.writtenItem}>
                      <dt className={styles.writtenQuestion} title={column.header}>
                        {column.header}
                      </dt>
                      <dd className={styles.writtenAnswer}>
                        {answer ? `“${answer}”` : <span className={styles.muted}>{NOT_ANSWERED}</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {long ? (
                <button
                  type="button"
                  className={styles.linkButton}
                  aria-expanded={answersOpen}
                  onClick={() => {
                    const next = new Set(openAnswers);
                    if (answersOpen) next.delete(each.uid);
                    else next.add(each.uid);
                    setOpenAnswers(next);
                  }}
                >
                  {answersOpen ? "Show less" : `Read all of ${each.firstName}’s answers`}
                </button>
              ) : null}
            </td>
          </tr>
        ) : null}
        {asking?.mode === "person" && asking.uid === each.uid ? (
          <tr className={styles.askRow}>
            <td colSpan={span}>{panel}</td>
          </tr>
        ) : null}
      </Fragment>
    );
  };

  return (
    <div className={styles.view}>
      <div className={styles.top}>
        <section className={styles.card} aria-labelledby="facilitators-title">
          <h2 id="facilitators-title" className={styles.title}>
            {model.headline}
          </h2>
          {model.groups.length === 0 ? (
            <p className={styles.muted}>An admin adds the run’s groups in the run editor, and they appear here to staff.</p>
          ) : (
            <ul className={styles.groups}>{model.groups.map(groupBlock)}</ul>
          )}
          <p className={styles.foot} role="status">
            {saved ?? CHANGE_EMAILS_NOBODY}
          </p>
        </section>

        <aside className={styles.side} aria-labelledby={`${ids}-email`}>
          <h2 id={`${ids}-email`} className={styles.eyebrow}>
            {model.email ? emailCardTitle(model.email.firstName) : "The email"}
          </h2>
          {model.email ? (
            <Letter email={model.email.sent} to={model.email.toName} />
          ) : (
            <p className={styles.muted}>{NOBODY_ASKED_YET}</p>
          )}
        </aside>
      </div>

      <section className={styles.card} aria-labelledby={`${ids}-people`}>
        <h2 id={`${ids}-people`} className={styles.title}>
          {tableHeading(model.shortName, model.people.length)}
        </h2>
        {!model.asksFacilitating ? (
          <p className={styles.muted}>{FORM_NEVER_ASKED}</p>
        ) : (
          <>
            <p className={styles.lede}>{tableLine(model.shortName)}</p>
            {!model.decisionsSent ? <p className={styles.muted}>{ASK_AFTER_DECISIONS}</p> : null}
            {model.people.length === 0 ? (
              <p className={styles.muted}>{nobodyWouldWords(model.shortName)}</p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col" className={styles.th}>
                        {TABLE_COLUMNS.person}
                      </th>
                      {closed.map((column) => (
                        <th key={column.key} scope="col" className={styles.th}>
                          {column.header}
                        </th>
                      ))}
                      <th scope="col" className={styles.th}>
                        {TABLE_COLUMNS.status}
                      </th>
                      <th scope="col" className={styles.th}>
                        <span className={styles.hidden}>{TABLE_COLUMNS.ask}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>{model.people.map(personRow)}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
