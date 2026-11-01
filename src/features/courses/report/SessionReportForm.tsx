"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import OptionRow from "@/components/ui/OptionRow";
import { useHydrated } from "@/hooks/useHydrated";
import {
  HOW_TOP,
  SESSION_REPORT_LIMITS,
  SOMETHING_ELSE,
  type ReportPart,
  type SessionReportAnswers,
} from "@/lib/firestore/courseSessionReports";
import {
  REPORT_REFUSAL,
  REPORT_WORDS,
  aWordAboutLabel,
  forLeadLabel,
  sentLine,
  standOutLabel,
} from "@/lib/courses/sessionReports/words";
import styles from "./sessionReport.module.css";

/**
 * A FACILITATOR'S SESSION REPORT, the form (board S-fac-report's questions,
 * in its order): how the session went, what went well, what didn't, what
 * seemed unclear, who engaged well and why, who seemed not to have done the
 * readings, who might need a hand and a word about each, and anything for the
 * lead or admins. Two minutes on a phone, straight after the register.
 *
 * PEOPLE ARE PICKED, NEVER TYPED: each person is a pill holding a real
 * checkbox, from the lists the server worked out off the session's register,
 * and is sent by account. Picking somebody who engaged well, or who might
 * need a hand, opens a line about them under the list.
 *
 * Every box is left to the browser (`defaultValue`, `defaultChecked`) and
 * read from the form when Send is pressed, so nothing typed before the page's
 * script arrives is lost, and Send waits for the script. "How did the session
 * go?" needs an answer; the rest may be left empty. Each press sends the
 * whole report, and the route keeps the writer's one report per session.
 *
 * Handed only what it draws: the group's id, the session's key, the people's
 * names and uids, the week's parts and this writer's own answers.
 */

type Person = { uid: string; name: string; firstName: string };

type Props = {
  groupId: string;
  sessionKey: string;
  leadFirstName: string;
  came: Person[];
  inGroup: Person[];
  parts: ReportPart[];
  answers: SessionReportAnswers | null;
  sent: string;
  changeUntil: string;
};

function Tick() {
  return (
    <svg className={styles.chipTick} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The uids ticked in one checkbox group of the form. */
function ticked(form: HTMLFormElement, name: string): string[] {
  return new FormData(form).getAll(name).filter((value): value is string => typeof value === "string");
}

/** One free-text box's words, as typed. */
function typedIn(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : "";
}

export default function SessionReportForm({
  groupId,
  sessionKey,
  leadFirstName,
  came,
  inGroup,
  parts,
  answers,
  sent: sentAtFirst,
  changeUntil,
}: Props) {
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const howRef = useRef<HTMLFieldSetElement>(null);
  const [engaged, setEngaged] = useState<string[]>(() => answers?.engaged.map((pick) => pick.uid) ?? []);
  const [needsHand, setNeedsHand] = useState<string[]>(() => answers?.needsHand.map((pick) => pick.uid) ?? []);
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [howBlank, setHowBlank] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const [sent, setSent] = useState(sentAtFirst);

  // A box ticked before the script arrived is ticked in the form but not in
  // the state that opens its line: read the form once, now it is live.
  useEffect(() => {
    if (!formRef.current) return;
    setEngaged(ticked(formRef.current, "engaged"));
    setNeedsHand(ticked(formRef.current, "needsHand"));
  }, []);

  const savedNote = (list: SessionReportAnswers["engaged"] | undefined, uid: string) =>
    list?.find((pick) => pick.uid === uid)?.note ?? "";
  const savedHow = answers?.how ?? null;
  const unclearSaved = new Set(answers?.unclear ?? []);
  const engagedSaved = new Set(answers?.engaged.map((pick) => pick.uid) ?? []);
  const notReadSaved = new Set(answers?.notRead ?? []);
  const needsSaved = new Set(answers?.needsHand.map((pick) => pick.uid) ?? []);

  function onPick(setter: (next: string[]) => void, name: string) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const form = event.currentTarget.form;
      if (form) setter(ticked(form, name));
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (state !== "idle" || !form) return;
    setError("");
    setSaid("");
    const howValue = Number(new FormData(form).get("how"));
    if (!Number.isInteger(howValue) || howValue < 1 || howValue > HOW_TOP) {
      setHowBlank(true);
      howRef.current?.scrollIntoView({ block: "center" });
      howRef.current?.querySelector("input")?.focus({ preventScroll: true });
      return;
    }
    setHowBlank(false);
    const notes = (prefix: string, uids: string[]) => uids.map((uid) => ({ uid, note: typedIn(form, `${prefix}-${uid}`) }));
    const body = {
      sessionKey,
      answers: {
        how: howValue,
        wentWell: typedIn(form, "wentWell"),
        didnt: typedIn(form, "didnt"),
        unclear: ticked(form, "unclear"),
        engaged: notes("engagedNote", ticked(form, "engaged")),
        notRead: ticked(form, "notRead"),
        needsHand: notes("needsHandNote", ticked(form, "needsHand")),
        forLead: typedIn(form, "forLead"),
      },
    };
    setState("sending");
    try {
      const response = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/session-report`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; updatedAt?: string };
      if (!response.ok) {
        setError(result.error ?? REPORT_WORDS.failed);
      } else {
        setSaid(REPORT_WORDS.sent);
        if (result.updatedAt) setSent(sentLine(new Date(result.updatedAt)));
      }
    } catch {
      setError(REPORT_WORDS.failed);
    } finally {
      setState("idle");
    }
  }

  const picked = (list: string[], people: Person[]) => people.filter((person) => list.includes(person.uid));

  return (
    <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
      <fieldset
        ref={howRef}
        className={styles.question}
        aria-describedby={howBlank ? "report-how-ends report-how-blank" : "report-how-ends"}
      >
        <legend className={styles.legend}>{REPORT_WORDS.how}</legend>
        <div className={styles.points}>
          {Array.from({ length: HOW_TOP }, (_, at) => at + 1).map((point) => (
            <label key={point} className={styles.point}>
              <input
                type="radio"
                name="how"
                value={String(point)}
                defaultChecked={savedHow === point}
                className={styles.pointInput}
                onChange={() => setHowBlank(false)}
              />
              <span className={styles.pointFace}>{point}</span>
            </label>
          ))}
        </div>
        <p id="report-how-ends" className={styles.ends}>
          <span>{REPORT_WORDS.howLow}</span>
          <span>{REPORT_WORDS.howHigh}</span>
        </p>
        {howBlank && (
          <p id="report-how-blank" className={styles.blank} role="alert">
            {REPORT_REFUSAL.how}
          </p>
        )}
      </fieldset>

      <div className={styles.question}>
        <label htmlFor="report-went-well" className={styles.label}>
          {REPORT_WORDS.wentWell}
        </label>
        <Textarea
          id="report-went-well"
          name="wentWell"
          rows={3}
          maxLength={SESSION_REPORT_LIMITS.text}
          defaultValue={answers?.wentWell ?? ""}
          className={styles.short}
        />
      </div>

      <div className={styles.question}>
        <label htmlFor="report-didnt" className={styles.label}>
          {REPORT_WORDS.didnt}
        </label>
        <Textarea
          id="report-didnt"
          name="didnt"
          rows={3}
          maxLength={SESSION_REPORT_LIMITS.text}
          defaultValue={answers?.didnt ?? ""}
          className={styles.short}
        />
      </div>

      {parts.length > 0 && (
        <fieldset className={styles.question}>
          <legend className={styles.legend}>{REPORT_WORDS.unclear}</legend>
          <div className={styles.rows}>
            {parts.map((part) => (
              <OptionRow key={part.id} plain name="unclear" value={part.id} defaultChecked={unclearSaved.has(part.id)}>
                {part.title}
              </OptionRow>
            ))}
            <OptionRow plain name="unclear" value={SOMETHING_ELSE} defaultChecked={unclearSaved.has(SOMETHING_ELSE)}>
              {REPORT_WORDS.somethingElse}
            </OptionRow>
          </div>
        </fieldset>
      )}

      <fieldset className={styles.question}>
        <legend className={styles.legend}>{REPORT_WORDS.engaged}</legend>
        {came.length === 0 ? (
          <p className={styles.empty}>{REPORT_WORDS.nobodyHere}</p>
        ) : (
          <div className={styles.chips}>
            {came.map((person) => (
              <label key={person.uid} className={styles.chip}>
                <input
                  type="checkbox"
                  name="engaged"
                  value={person.uid}
                  defaultChecked={engagedSaved.has(person.uid)}
                  className={styles.chipInput}
                  onChange={onPick(setEngaged, "engaged")}
                />
                <span className={styles.chipBox} aria-hidden="true">
                  <Tick />
                </span>
                <span className={styles.chipName}>{person.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {picked(engaged, came).map((person) => (
        <div key={person.uid} className={styles.aboutOne}>
          <label htmlFor={`report-engaged-${person.uid}`} className={styles.label}>
            {standOutLabel(person.firstName)}
          </label>
          <Input
            id={`report-engaged-${person.uid}`}
            name={`engagedNote-${person.uid}`}
            maxLength={SESSION_REPORT_LIMITS.aboutOne}
            defaultValue={savedNote(answers?.engaged, person.uid)}
          />
        </div>
      ))}

      <fieldset className={styles.question}>
        <legend className={styles.legend}>{REPORT_WORDS.notRead}</legend>
        {came.length === 0 ? (
          <p className={styles.empty}>{REPORT_WORDS.nobodyHere}</p>
        ) : (
          <div className={styles.chips}>
            {came.map((person) => (
              <label key={person.uid} className={styles.chip}>
                <input
                  type="checkbox"
                  name="notRead"
                  value={person.uid}
                  defaultChecked={notReadSaved.has(person.uid)}
                  className={styles.chipInput}
                />
                <span className={styles.chipBox} aria-hidden="true">
                  <Tick />
                </span>
                <span className={styles.chipName}>{person.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className={styles.question}>
        <legend className={styles.legend}>{REPORT_WORDS.needsHand}</legend>
        {inGroup.length === 0 ? (
          <p className={styles.empty}>{REPORT_WORDS.nobodyInGroup}</p>
        ) : (
          <div className={styles.chips}>
            {inGroup.map((person) => (
              <label key={person.uid} className={styles.chip}>
                <input
                  type="checkbox"
                  name="needsHand"
                  value={person.uid}
                  defaultChecked={needsSaved.has(person.uid)}
                  className={styles.chipInput}
                  onChange={onPick(setNeedsHand, "needsHand")}
                />
                <span className={styles.chipBox} aria-hidden="true">
                  <Tick />
                </span>
                <span className={styles.chipName}>{person.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {picked(needsHand, inGroup).map((person) => (
        <div key={person.uid} className={styles.aboutOne}>
          <label htmlFor={`report-hand-${person.uid}`} className={styles.label}>
            {aWordAboutLabel(person.firstName)}
          </label>
          <Input
            id={`report-hand-${person.uid}`}
            name={`needsHandNote-${person.uid}`}
            maxLength={SESSION_REPORT_LIMITS.aboutOne}
            defaultValue={savedNote(answers?.needsHand, person.uid)}
          />
        </div>
      ))}

      <div className={styles.question}>
        <label htmlFor="report-for-lead" className={styles.label}>
          {forLeadLabel(leadFirstName)}
        </label>
        <Textarea
          id="report-for-lead"
          name="forLead"
          rows={3}
          maxLength={SESSION_REPORT_LIMITS.text}
          placeholder={REPORT_WORDS.optional}
          defaultValue={answers?.forLead ?? ""}
          className={styles.short}
        />
      </div>

      <div className={styles.foot}>
        <button type="submit" className={styles.send} disabled={!hydrated || state === "sending"}>
          {state === "sending" ? REPORT_WORDS.sending : REPORT_WORDS.send}
        </button>
        {said && !error && (
          <p className={styles.said} role="status">
            {said}
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {sent && <p className={styles.note}>{sent}</p>}
        <p className={styles.note}>{changeUntil}</p>
      </div>
    </form>
  );
}
