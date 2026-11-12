"use client";

import { useEffect, useId, useState } from "react";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { GROUP_CAMPUSES, type GroupCampus } from "@/lib/courses/campus";
import { CAMPUS_LABEL } from "@/lib/courses/campusWords";
import {
  callsOffMarkedDraft,
  defaultRegularStart,
  didNotHappenChoicesOf,
  lengthOptions,
  moveDays,
  oneWeekButtonWords,
  oneWeekChoicesOf,
  oneWeekPreviewLines,
  regularButtonWords,
  regularPreviewLines,
  regularStartWeeks,
  sentWords,
  startTimeOptions,
  toldWho,
  waitingButtonWords,
  weekAfter,
  type GroupPageView,
  type GroupPageWeek,
  type OneWeekKind,
  type OneWeekPreview,
  type PreviewLine,
  type PushBlock,
  type RegularPreview,
} from "@/lib/courses/groupPage/model";
import * as W from "@/lib/courses/groupPage/words";
import { pushHasRecordsHint } from "@/lib/courses/registerCover/words";
import {
  DRAFT_DIDNT_HAPPEN_LINE,
  KEEP_PACE,
  PUSH_THE_REST_BACK,
  WHAT_HAPPENS_AFTER,
  didNotHappenLines,
  didntHappenLede,
  didntHappenTitle,
  emailGroupWords,
} from "@/lib/courses/registerCover/pageWords";
import { lengthWords, SESSION_LENGTH_PRESETS } from "@/lib/courses/sessionLength";
import { changedWords, clockWords, dayWords, notToldWords, UNKNOWN_OUTCOME } from "@/lib/courses/sessionChange/words";
import { weekdaysWords } from "@/lib/courses/regularTime/words";
import { postedWords } from "@/lib/courses/updates/words";
import styles from "./GroupPage.module.css";

/**
 * CHANGE, AS ONE PANEL WITH TWO CLEAR CHOICES: just one week (any week, past
 * ones too, so a session that did not take place can be put right), or from
 * a week onwards (a new regular day, time, length or room; the programme's
 * lead and admins only). The facilitator's page opens it with the one-week
 * choices alone.
 *
 * WHAT WILL HAPPEN is the routes' own answer: every change of a field asks
 * the change route again with `preview: true` (after a short pause, the last
 * question winning), and the lines are drawn from what it answers
 * (`oneWeekPreviewLines`, `regularPreviewLines`). A refusal is drawn where
 * the preview would be, in the route's words, so the panel is refused in the
 * words a press would be.
 *
 * ONE BUTTON, which names what happens and how many it emails, the count
 * being the preview's (the send's own count, never the presser). The route
 * checks it again before anything changes: a 409 with a new count shows the
 * new count and asks again. A one-week change answers with the update's
 * words, which are then posted to the group through the updates route WITH
 * `withFacilitators`, the one lane an update and its email go through; if
 * the change went through and the update did not, the panel says so and
 * offers to tell the group again. A new regular time sends its own notice.
 *
 * Every fact drawn is the server's (`GroupPageView`). Nothing here holds an
 * address or a meeting link.
 */

export type ChangeStart = {
  choice: "one" | "regular";
  weekNumber: number | null;
};

type Preview =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "one"; data: OneWeekPreview }
  | { status: "regular"; data: RegularPreview }
  | { status: "refused"; error: string };

/** A preview, with the question it answered: only an answer to the question the panel asks now is drawn. */
type Answered = { asked: string; preview: Preview };

type PendingUpdate = { groupId: string; title: string; message: string; emailCount: number; withFacilitators: boolean };

/** Why "Push the rest back a week" is not offered, in the panel's words; "" when it is. */
function pushBlockWords(block: PushBlock, weekNumber: number): string {
  if (block === "later-met") return W.PUSH_BACK_LATER_MET;
  if (block === "records") return pushHasRecordsHint(weekNumber);
  return "";
}

/** The fields a choice of week starts from: the week's own session. */
function fieldsOf(week: GroupPageWeek | null, view: GroupPageView) {
  return {
    day: week?.dateKey ?? "",
    start: week?.hhmm || view.meets.hhmm || "18:00",
    minutes: week?.minutes || view.meets.minutes || 120,
    room: week?.room ?? view.meets.room,
    tbc: week ? !week.room : !view.meets.room,
  };
}

async function postJson(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> | null } | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: response.status, body: json };
  } catch {
    return null;
  }
}

export default function ChangePanel({
  view,
  start,
  oneWeekOnly,
  didNotHappen = false,
  onClose,
  onDone,
}: {
  view: GroupPageView;
  start: ChangeStart;
  /** The facilitator's page: the one-week choices alone. */
  oneWeekOnly: boolean;
  /**
   * "It didn't happen", from the group's page: the week the start names and
   * its two cancels alone (keep pace, or push the rest back a week), with
   * what calling a session off after it started does, and the notice to the
   * group as a tick with its count.
   */
  didNotHappen?: boolean;
  onClose: () => void;
  /** The change went through: what to say about it. */
  onDone: (said: string) => void;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const weeks = view.weeks;
  const allowedStarts = new Set(regularStartWeeks(weeks));

  const [choice, setChoice] = useState<"one" | "regular">(oneWeekOnly || didNotHappen || !view.canChangeRegular ? "one" : start.choice);
  const firstWeek = start.weekNumber ?? view.openWeek ?? weeks[0]?.weekNumber ?? null;
  const [weekNumber, setWeekNumber] = useState<number | null>(firstWeek);
  const [fromWeek, setFromWeek] = useState<number | null>(
    start.choice === "regular" && start.weekNumber !== null && allowedStarts.has(start.weekNumber)
      ? start.weekNumber
      : defaultRegularStart(weeks),
  );
  const week = weeks.find((each) => each.weekNumber === weekNumber) ?? null;
  const choices = week ? oneWeekChoicesOf(week, weeks) : null;
  // A started week whose register is a draft somebody marked, not finished:
  // it counts as met for every other change, and may still be called off with
  // the two cancels, through the same route and preview as "It didn't happen".
  const draftCalledOff = Boolean(!didNotHappen && week && choices?.met && callsOffMarkedDraft(week));
  const calledOff = didNotHappen || draftCalledOff;
  // The two cancels, with push back worked out from LATER weeks and the week's own records only.
  const cancels = week && calledOff ? didNotHappenChoicesOf(week, weeks) : null;

  const [kind, setKind] = useState<OneWeekKind | null>(choices?.putRight && !didNotHappen ? "move" : null);
  const [met, setMet] = useState<boolean>(Boolean(choices?.putRight) && !didNotHappen);
  const initial = fieldsOf(week, view);
  const [day, setDay] = useState(initial.day);
  const [weekday, setWeekday] = useState(view.meets.weekday);
  const [startAt, setStartAt] = useState(choice === "regular" ? view.meets.hhmm || "18:00" : initial.start);
  const [minutes, setMinutes] = useState(choice === "regular" ? view.meets.minutes || 120 : initial.minutes);
  const [room, setRoom] = useState(choice === "regular" ? view.meets.room : initial.room);
  const [tbc, setTbc] = useState(choice === "regular" ? !view.meets.room : initial.tbc);
  const [campus, setCampus] = useState<GroupCampus | "">("");
  const [reason, setReason] = useState("");
  const [tellAnyway, setTellAnyway] = useState(false);

  const [answered, setAnswered] = useState<Answered>({ asked: "", preview: { status: "idle" } });
  const [emailsSaid, setEmailsSaid] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<{ update: PendingUpdate; changed: string } | null>(null);

  /** A new week for one week's change: its own session fills the fields. */
  function chooseWeek(next: number) {
    const chosen = weeks.find((each) => each.weekNumber === next) ?? null;
    const fields = fieldsOf(chosen, view);
    const its = chosen ? oneWeekChoicesOf(chosen, weeks) : null;
    setWeekNumber(next);
    setKind(its?.putRight ? "move" : null);
    setMet(Boolean(its?.putRight));
    setDay(fields.day);
    setStartAt(fields.start);
    setMinutes(fields.minutes);
    setRoom(fields.room);
    setTbc(fields.tbc);
    setCampus("");
    setTellAnyway(false);
    setEmailsSaid(null);
    setProblem(null);
  }

  /** One of the two choices: each starts from the group's or the week's own session. */
  function chooseSessions(next: "one" | "regular") {
    setChoice(next);
    setEmailsSaid(null);
    setProblem(null);
    if (next === "regular") {
      setWeekday(view.meets.weekday);
      setStartAt(view.meets.hhmm || "18:00");
      setMinutes(view.meets.minutes || 120);
      setRoom(view.meets.room);
      setTbc(!view.meets.room);
      setCampus("");
    } else if (weekNumber !== null) {
      chooseWeek(weekNumber);
    }
  }

  // The days a move may land on: today or later, or today or earlier when it met at another time.
  const days = week ? moveDays(week, view.todayKey, met) : [];
  const dayValue = days.includes(day) ? day : (days[0] ?? "");

  // The question a press would put, as the preview asks it. Null while there is nothing to ask.
  const body = ((): { url: string; regular: boolean; body: Record<string, unknown> } | null => {
    const roomFields = { room: tbc ? "" : room.trim(), roomToBeConfirmed: tbc };
    if (choice === "regular") {
      if (fromWeek === null) return null;
      return {
        url: `/api/courses/groups/${encodeURIComponent(view.groupId)}/session/regular`,
        regular: true,
        body: {
          fromWeek,
          weekday,
          time: startAt,
          length: minutes,
          ...roomFields,
          ...(campus ? { campus } : {}),
          reason: reason.trim(),
        },
      };
    }
    if (!week || !kind || !week.dateKey) return null;
    return {
      url: `/api/courses/groups/${encodeURIComponent(view.groupId)}/session/change`,
      regular: false,
      body: {
        week: week.weekNumber,
        dateKey: week.dateKey,
        kind,
        ...(kind === "move"
          ? { move: { dateKey: dayValue, time: startAt, length: minutes, ...roomFields, ...(campus ? { campus } : {}) } }
          : {}),
        ...(met && kind === "move" ? { metAtAnotherTime: true } : {}),
        reason: reason.trim(),
      },
    };
  })();

  // Ask what a press would do, a moment after the last change; the newest question wins.
  const question = body ? JSON.stringify(body) : "";
  useEffect(() => {
    if (!question) return;
    const asked = question;
    const { url, regular, body: fields } = JSON.parse(question) as { url: string; regular: boolean; body: Record<string, unknown> };
    let stale = false;
    const timer = window.setTimeout(async () => {
      const answer = await postJson(url, { ...fields, preview: true });
      if (stale) return;
      if (!answer) return setAnswered({ asked, preview: { status: "refused", error: UNKNOWN_OUTCOME } });
      const said = typeof answer.body?.error === "string" ? answer.body.error : null;
      if (answer.status !== 200 || answer.body?.ok !== true) {
        return setAnswered({ asked, preview: { status: "refused", error: said ?? UNKNOWN_OUTCOME } });
      }
      const data = answer.body.preview;
      setAnswered({
        asked,
        preview: regular ? { status: "regular", data: data as RegularPreview } : { status: "one", data: data as OneWeekPreview },
      });
    }, 350);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
    // `question` carries every field the body is made of; `nonce` asks again after a count changed.
  }, [question, nonce]);

  // The answer to the question asked now; until it comes, the panel is working it out.
  const preview: Preview = answered.asked === question && question ? answered.preview : body ? { status: "loading" } : { status: "idle" };

  // Who it tells, and the count on the button: the preview's, or the route's newer one.
  const told = preview.status === "one" || preview.status === "regular" ? preview.data.told : null;
  const emails = emailsSaid ?? told?.emails ?? 0;
  const canTell = Boolean(told && !told.refused && (told.people > 0 || told.emails > 0));
  // Called off after it started, the notice is the tick's to send; any other one-week change tells the group.
  const tell = canTell && (choice === "regular" ? emails > 0 : met || calledOff ? tellAnyway : true);
  const buttonEmails = tell ? emails : 0;

  const lines: PreviewLine[] =
    preview.status === "one"
      ? [
          // A session called off after it started: what else follows, from the route's own preview.
          ...(preview.data.didNotHappen ? didNotHappenLines(preview.data.didNotHappen, preview.data.weekNumber, preview.data.kind) : []),
          ...oneWeekPreviewLines({ preview: preview.data, metAtAnotherTime: met, tell, groupName: view.groupName, incubator: view.incubator }),
        ]
      : preview.status === "regular"
        ? regularPreviewLines({ preview: preview.data, groupName: view.groupName, incubator: view.incubator, todayKey: view.todayKey })
        : [];

  const reasonNeeded = choice === "one";
  const ready =
    (preview.status === "one" || preview.status === "regular") && !(reasonNeeded && !reason.trim()) && pending === null;
  const off = !hydrated || busy;

  // The count is the preview's: until it has answered, the button names what happens and no count.
  const buttonWords = !told
    ? waitingButtonWords({
        kind,
        weekNumber: week?.weekNumber ?? null,
        metAtAnotherTime: met && kind === "move",
        regular: choice === "regular",
        groupName: view.groupName,
      })
    : choice === "regular"
      ? regularButtonWords(view.groupName, buttonEmails)
      : kind && week
        ? oneWeekButtonWords(kind, week.weekNumber, buttonEmails, met && kind === "move")
        : W.CHANGE;

  async function postUpdate(update: PendingUpdate, changed: string) {
    const answer = await postJson(`/api/courses/runs/${encodeURIComponent(view.runId)}/updates`, {
      to: "group",
      groupId: update.groupId,
      title: update.title,
      message: update.message,
      email: update.emailCount > 0,
      ...(update.emailCount > 0 ? { emailCount: update.emailCount } : {}),
      // A change to the group's sessions reaches its facilitators too.
      withFacilitators: update.withFacilitators,
    });
    if (!answer) {
      setPending({ update, changed });
      setProblem(`${changed} ${notToldWords("we couldn’t tell whether the update went through.")}`);
      return;
    }
    const said = typeof answer.body?.error === "string" ? answer.body.error : null;
    if (answer.status === 409 && typeof answer.body?.emails === "number") {
      const next = { ...update, emailCount: answer.body.emails };
      setEmailsSaid(answer.body.emails);
      setPending({ update: next, changed });
      setProblem(`${changed} ${notToldWords(said ?? "the number of people it emails has changed.")}`);
      return;
    }
    if (answer.status !== 200 || answer.body?.ok !== true) {
      setPending({ update, changed });
      setProblem(`${changed} ${notToldWords(said ?? "the update didn’t go through.")}`);
      return;
    }
    const tally = answer.body.email as { sent?: number; held?: number; suppressed?: number; failed?: number } | null;
    onDone(
      `${changed} ${postedWords(
        tally ? { sent: tally.sent ?? 0, held: tally.held ?? 0, suppressed: tally.suppressed ?? 0, failed: tally.failed ?? 0 } : null,
      )}`,
    );
  }

  async function press() {
    if (!body || !ready) return;
    setBusy(true);
    setProblem(null);
    const answer = await postJson(body.url, { ...body.body, tell, ...(tell ? { emailCount: buttonEmails } : {}) });
    if (!answer) {
      setBusy(false);
      setProblem(UNKNOWN_OUTCOME);
      return;
    }
    const said = typeof answer.body?.error === "string" ? answer.body.error : null;
    if (answer.status === 409 && typeof answer.body?.emails === "number") {
      // The count on the button no longer holds: show the new one, and ask again. Nothing changed.
      setEmailsSaid(answer.body.emails);
      setNonce((n) => n + 1);
      setBusy(false);
      setProblem(said ?? UNKNOWN_OUTCOME);
      return;
    }
    if (answer.status !== 200 || answer.body?.ok !== true) {
      setBusy(false);
      setProblem(said ?? UNKNOWN_OUTCOME);
      return;
    }
    if (choice === "regular") {
      const tally = answer.body.email as { sent: number; held: number; suppressed: number; failed: number } | null;
      const subject = preview.status === "regular" ? preview.data.notice.subject : "";
      setBusy(false);
      onDone([subject ? `${subject}.` : "", sentWords(tally)].filter(Boolean).join(" "));
      return;
    }
    const change = answer.body.change as { kind?: string; dateKey?: string } | undefined;
    const changed = changedWords(kind ?? "move", String(change?.dateKey ?? week?.dateKey ?? ""));
    const update = answer.body.update as PendingUpdate | null;
    if (update) await postUpdate({ ...update, withFacilitators: update.withFacilitators === true }, changed);
    else onDone(`${changed} Nobody was emailed.`);
    setBusy(false);
  }

  async function tellAgain() {
    if (!pending) return;
    setBusy(true);
    setProblem(null);
    await postUpdate(pending.update, pending.changed);
    setBusy(false);
  }

  const title =
    didNotHappen && week ? didntHappenTitle(week.weekNumber) : oneWeekOnly && week ? W.changeWeekTitle(week.weekNumber) : W.changePanelTitle(view.groupName);
  const titleId = `${ids}-title`;
  const nextWeek = week ? weekAfter(weeks, week.weekNumber) : null;
  const fromWeekData = weeks.find((each) => each.weekNumber === fromWeek) ?? null;

  const radio = (
    name: string,
    value: string,
    checked: boolean,
    onPick: () => void,
    label: string,
    hint: string,
    disabled = false,
  ) => (
    <label className={[styles.option, checked ? styles.optionChosen : "", disabled ? styles.optionOff : ""].filter(Boolean).join(" ")}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={off || disabled || pending !== null}
        onChange={onPick}
        className={styles.radio}
      />
      <span className={styles.optionText}>
        <span className={styles.optionName}>{label}</span>
        {hint && <span className={styles.optionHint}>{hint}</span>}
      </span>
    </label>
  );

  const timeFields = (startedLabel: boolean) => (
    <div className={styles.fieldRow}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`${ids}-day`}>
          {W.DAY}
        </label>
        {choice === "regular" ? (
          <Select id={`${ids}-day`} value={String(weekday)} disabled={off || pending !== null} onChange={(e) => setWeekday(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 0].map((each) => (
              <option key={each} value={String(each)}>
                {weekdaysWords(each)}
              </option>
            ))}
          </Select>
        ) : (
          <Select id={`${ids}-day`} value={dayValue} disabled={off || pending !== null || days.length === 0} onChange={(e) => setDay(e.target.value)}>
            {days.map((each) => (
              <option key={each} value={each}>
                {dayWords(each)}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`${ids}-start`}>
          {startedLabel ? W.STARTED : W.STARTS}
        </label>
        <Select id={`${ids}-start`} value={startAt} disabled={off || pending !== null} onChange={(e) => setStartAt(e.target.value)}>
          {startTimeOptions(startAt).map((each) => (
            <option key={each} value={each}>
              {clockWords(each)}
            </option>
          ))}
        </Select>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`${ids}-length`}>
          {W.LENGTH}
        </label>
        <Select id={`${ids}-length`} value={String(minutes)} disabled={off || pending !== null} onChange={(e) => setMinutes(Number(e.target.value))}>
          {lengthOptions(SESSION_LENGTH_PRESETS, minutes).map((each) => (
            <option key={each} value={String(each)}>
              {lengthWords(each)}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );

  const roomFields = (
    <>
      <div className={styles.fieldRow}>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label className={styles.fieldLabel} htmlFor={`${ids}-room`}>
            {W.ROOM_FIELD}
          </label>
          <Input
            id={`${ids}-room`}
            type="text"
            autoComplete="off"
            maxLength={200}
            value={tbc ? "" : room}
            disabled={off || tbc || pending !== null}
            onChange={(e) => setRoom(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`${ids}-campus`}>
            {W.CAMPUS_FIELD}
          </label>
          <Select
            id={`${ids}-campus`}
            value={campus}
            disabled={off || pending !== null}
            onChange={(e) => setCampus((e.target.value || "") as GroupCampus | "")}
          >
            <option value="">{W.KEEP_GROUP_CAMPUS}</option>
            {GROUP_CAMPUSES.map((each) => (
              <option key={each} value={each}>
                {CAMPUS_LABEL[each]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <label className={styles.tick}>
        <input
          type="checkbox"
          checked={tbc}
          disabled={off || pending !== null}
          onChange={(e) => setTbc(e.target.checked)}
          className={styles.checkbox}
        />
        <span className={styles.optionText}>
          <span className={styles.optionName}>{W.ROOM_TBC}</span>
          {choice === "regular" && <span className={styles.optionHint}>{W.ROOM_TBC_HINT}</span>}
        </span>
      </label>
    </>
  );

  /** The two cancels for a session that did not happen: keep pace, or push the rest back a week where it can be. */
  const cancelsFieldset = (each: GroupPageWeek) => (
    <fieldset className={styles.options}>
      <legend className={styles.legend}>{WHAT_HAPPENS_AFTER}</legend>
      {radio(`${ids}-kind`, "cancel", kind === "cancel", () => {
        setKind("cancel");
        setMet(false);
        setTellAnyway(false);
      }, KEEP_PACE, W.keepPaceHintWords(nextWeek))}
      {radio(
        `${ids}-kind`,
        "push",
        kind === "push",
        () => {
          setKind("push");
          setMet(false);
          // Pushing the rest back moves every later week: the group is told unless the tick is taken off.
          setTellAnyway(true);
        },
        PUSH_THE_REST_BACK,
        cancels?.push ? W.PUSH_BACK_HINT : pushBlockWords(cancels?.pushBlock ?? null, each.weekNumber),
        !cancels?.push,
      )}
    </fieldset>
  );

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.panelTitle}>
          {title}
        </h2>
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
          {W.CLOSE}
        </Button>
      </div>

      {oneWeekOnly && !didNotHappen && <p className={styles.panelLede}>{W.facilitatorCanLine(view.leadFirstName)}</p>}
      {didNotHappen && week && <p className={styles.panelLede}>{didntHappenLede(view.groupName, week.dateKey, week.hhmm)}</p>}

      {didNotHappen && week ? cancelsFieldset(week) : null}

      {!oneWeekOnly && !didNotHappen && view.canChangeRegular && (
        <fieldset className={styles.options}>
          <legend className={styles.legend}>{W.WHICH_SESSIONS}</legend>
          {radio(`${ids}-which`, "one", choice === "one", () => chooseSessions("one"), W.JUST_ONE_WEEK, W.JUST_ONE_WEEK_HINT)}
          {radio(
            `${ids}-which`,
            "regular",
            choice === "regular",
            () => chooseSessions("regular"),
            W.FROM_A_WEEK_ONWARDS,
            W.FROM_A_WEEK_ONWARDS_HINT,
            allowedStarts.size === 0,
          )}
        </fieldset>
      )}

      {didNotHappen ? null : choice === "one" ? (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${ids}-week`}>
              {W.WHICH_WEEK}
            </label>
            <Select
              id={`${ids}-week`}
              value={weekNumber === null ? "" : String(weekNumber)}
              disabled={off || pending !== null}
              onChange={(e) => chooseWeek(Number(e.target.value))}
            >
              {weeks.map((each) => (
                <option
                  key={each.weekNumber}
                  value={String(each.weekNumber)}
                  disabled={(each.taken && !callsOffMarkedDraft(each)) || !each.dateKey}
                >
                  {W.weekOptionWords(each.weekNumber, each.dateKey, each.hhmm, each.state)}
                </option>
              ))}
            </Select>
            {!oneWeekOnly && <p className={styles.fieldHint}>{W.WHICH_WEEK_HINT}</p>}
          </div>

          {week && choices?.met && !draftCalledOff && <p className={styles.panelNote}>{W.MET_LINE}</p>}
          {week && draftCalledOff && (
            <>
              <p className={styles.panelNote}>{DRAFT_DIDNT_HAPPEN_LINE}</p>
              {cancelsFieldset(week)}
            </>
          )}

          {week && choices && !choices.met && (
            <fieldset className={styles.options}>
              <legend className={styles.legend}>{choices.putRight ? W.WHAT_HAPPENED : W.whatsHappeningTo(week.weekNumber)}</legend>
              {choices.putRight ? (
                <>
                  {radio(`${ids}-kind`, "met", kind === "move" && met, () => {
                    setKind("move");
                    setMet(true);
                  }, W.MET_AT_ANOTHER_TIME, W.MET_AT_ANOTHER_TIME_HINT)}
                  {radio(`${ids}-kind`, "move", kind === "move" && !met, () => {
                    setKind("move");
                    setMet(false);
                  }, W.HASNT_MET_YET, W.HASNT_MET_YET_HINT)}
                </>
              ) : (
                <>
                  {radio(`${ids}-kind`, "move", kind === "move", () => {
                    setKind("move");
                    setMet(false);
                  }, W.MOVE_IT, W.MOVE_IT_HINT)}
                  {radio(
                    `${ids}-kind`,
                    "online",
                    kind === "online",
                    () => {
                      setKind("online");
                      setMet(false);
                    },
                    W.HOLD_IT_ONLINE,
                    week.hasLink ? W.HOLD_IT_ONLINE_HINT : W.noLinkForWeekHint(week.weekNumber),
                    !choices.online,
                  )}
                </>
              )}
              {radio(`${ids}-kind`, "cancel", kind === "cancel", () => {
                setKind("cancel");
                setMet(false);
              }, W.CANCEL_KEEP_PACE, choices.putRight ? "" : W.keepPaceHintWords(nextWeek))}
              {radio(
                `${ids}-kind`,
                "push",
                kind === "push",
                () => {
                  setKind("push");
                  setMet(false);
                },
                W.CANCEL_PUSH_BACK,
                // Once a later week has met, or this one has a check-in or a report, the rest can't move: the reason, in place of the hint.
                !choices.push ? pushBlockWords(choices.pushBlock, week.weekNumber) : choices.putRight ? "" : W.PUSH_BACK_HINT,
                !choices.push,
              )}
              {choices.restore &&
                radio(`${ids}-kind`, "restore", kind === "restore", () => {
                  setKind("restore");
                  setMet(false);
                }, W.PUT_IT_BACK, W.PUT_BACK_HINT)}
            </fieldset>
          )}

          {week && kind === "move" && (
            <>
              {timeFields(met)}
              {roomFields}
            </>
          )}
        </>
      ) : (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${ids}-from`}>
              {W.FROM_WHICH_WEEK}
            </label>
            <Select
              id={`${ids}-from`}
              value={fromWeek === null ? "" : String(fromWeek)}
              disabled={off}
              onChange={(e) => {
                setFromWeek(Number(e.target.value));
                setEmailsSaid(null);
              }}
            >
              {weeks.map((each) => (
                <option key={each.weekNumber} value={String(each.weekNumber)} disabled={!allowedStarts.has(each.weekNumber)}>
                  {W.weekOptionWords(each.weekNumber, each.dateKey, each.hhmm, each.state)}
                </option>
              ))}
            </Select>
          </div>
          {fromWeekData?.state === "no-register" && (
            <p className={styles.panelWarn}>{W.startsPassedWords(fromWeekData.weekNumber, fromWeekData.dateKey)}</p>
          )}
          {timeFields(false)}
          {roomFields}
        </>
      )}

      {(choice === "regular" || (week && kind)) && (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`${ids}-reason`}>
            {choice === "regular" ? W.REASON_OPTIONAL : met ? W.REASON_KEPT : W.REASON_NEEDED}
          </label>
          <Input
            id={`${ids}-reason`}
            type="text"
            autoComplete="off"
            maxLength={200}
            value={reason}
            disabled={off || pending !== null}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}

      {body && (
        <div className={styles.preview} aria-live="polite">
          <h3 className={styles.previewTitle}>{W.WHAT_WILL_HAPPEN}</h3>
          {preview.status === "loading" && <p className={styles.previewNote}>{W.CHECKING}</p>}
          {preview.status === "refused" && <p className={styles.previewRefused}>{preview.error}</p>}
          {lines.length > 0 && (
            <dl className={styles.previewLines}>
              {lines.map((line) => (
                <div key={line.label} className={styles.previewLine}>
                  <dt className={styles.previewLabel}>{line.label}</dt>
                  <dd className={styles.previewText}>{line.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {preview.status === "one" && tell && (
        <div className={styles.notice}>
          <p className={styles.noticeTo}>
            {W.noticeToWords({
              groupName: view.groupName,
              incubator: view.incubator,
              people: preview.data.told.people,
              facilitatorNames: preview.data.told.facilitatorNames,
            })}
          </p>
          <p className={styles.noticeSubject}>{preview.data.notice.title}</p>
          {preview.data.notice.message
            .split("\n\n")
            .filter(Boolean)
            .map((line) => (
              <p key={line} className={styles.noticeLine}>
                {line}
              </p>
            ))}
        </div>
      )}
      {preview.status === "regular" && tell && (
        <div className={styles.notice}>
          <p className={styles.noticeTo}>{`Notice to ${toldWho(preview.data.told, view.groupName, view.incubator) || view.groupName}`}</p>
          <p className={styles.noticeSubject}>{preview.data.notice.subject}</p>
          {preview.data.notice.before.map((line) => (
            <p key={line} className={styles.noticeLine}>
              {line}
            </p>
          ))}
          {preview.data.notice.asks && <p className={styles.noticeLine}>{W.CAN_YOU_MAKE_IT}</p>}
          {preview.data.notice.after.map((line) => (
            <p key={line} className={styles.noticeLine}>
              {line}
            </p>
          ))}
        </div>
      )}

      {calledOff && kind && canTell && (
        <label className={styles.tick}>
          <input
            type="checkbox"
            checked={tellAnyway}
            disabled={off || pending !== null}
            onChange={(e) => setTellAnyway(e.target.checked)}
            className={styles.checkbox}
          />
          <span className={styles.optionText}>
            <span className={styles.optionName}>{emailGroupWords(view.groupName, emails)}</span>
            <span className={styles.optionHint}>{W.emailAnywayLine(tellAnyway, emails)}</span>
          </span>
        </label>
      )}

      {met && kind === "move" && canTell && (
        <label className={styles.tick}>
          <input
            type="checkbox"
            checked={tellAnyway}
            disabled={off || pending !== null}
            onChange={(e) => setTellAnyway(e.target.checked)}
            className={styles.checkbox}
          />
          <span className={styles.optionText}>
            <span className={styles.optionName}>{W.emailAnywayWords(view.groupName)}</span>
            <span className={styles.optionHint}>{W.emailAnywayLine(tellAnyway, emails)}</span>
          </span>
        </label>
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
        {pending ? (
          <Button type="button" onClick={() => void tellAgain()} disabled={off}>
            {busy ? W.SAVING : W.tellAgainWords(pending.update.emailCount)}
          </Button>
        ) : (
          <Button type="button" onClick={() => void press()} disabled={off || !ready}>
            {busy ? W.SAVING : buttonWords}
          </Button>
        )}
      </div>
    </section>
  );
}
