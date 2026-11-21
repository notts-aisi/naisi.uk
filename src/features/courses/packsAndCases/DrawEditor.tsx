"use client";

import { useEffect, useId, useRef, useState } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { caseOptions, type DrawTalk } from "@/lib/courses/packsAndCases/model";
import {
  CANCEL,
  DRAW_NOT_SAVED,
  LEAVE_WITHOUT_SAVING,
  NOT_GIVEN_YET,
  READY_TAKEN_BACK,
  SAVE,
  SAVE_ANYWAY,
  SWAP_LABEL,
  SWAP_THEM,
  SWAP_TWO_PEOPLE,
  SWAP_WITH,
  choosePackFirstWords,
  leavingUnsavedWords,
  savedDrawWords,
  swappedWords,
} from "@/lib/courses/packsAndCases/words";
import type { DrawSaved } from "@/app/api/courses/groups/[groupId]/draw/route";
import { DRAW_LEAVE_EVENT } from "./DrawWeekPicker";
import facilitator from "../facilitator/facilitator.module.css";
import styles from "./packsAndCases.module.css";

/**
 * THE DRAW'S FORM: a row per person with a select
 * per Choose one given out ("Pathway") and per talk given out ("Case"), "Swap
 * two people" over them, and Save under them with "Each person sees theirs
 * on their week 3 page. No email."
 *
 *  - "Not given yet" is offered while a person has nothing saved, as the
 *    board draws it for Sam.
 *  - A case list offers only the cases of the person's pack when the cases
 *    are grouped by pack, and "Choose a pathway first" until they have one;
 *    a case with a content note is never offered (`caseOptions`, the route's
 *    own rule). Changing somebody's pathway takes back a case their new
 *    pathway does not offer.
 *  - "Swap two people" swaps everything two people have; Save keeps it.
 *  - Save sends only what changed, and is held until the page has hydrated:
 *    before then nothing is listening to it. Saved, it says how many have
 *    everything the week gives out: "Saved. 6 of 8 have a pathway and a
 *    case. Each person sees theirs on their week 3 page."
 *  - A WEEK THAT HAS MET, or the week people are working on now (`late`):
 *    Save first asks "Changing a case takes back that person’s Ready for my
 *    talk.", and the save carries the yes (`confirmed`), which the route
 *    requires. A save the route refuses for want of it (the session started
 *    after the page opened) asks the same.
 *  - LEAVING WITH CHANGES NOT SAVED (a link, the Week picker): asked first,
 *    "You’ve changed 2 people and haven’t saved.", with Save and Leave
 *    without saving; closing or reloading the tab gets the browser's own ask.
 *  - READ ONLY once the programme has closed (`readOnly`): the lists are
 *    shown, nothing can be changed and there is no Save.
 *
 * Handed the fields it draws, never the week: names, the packs' ids and
 * names, and the talks as the draw needs them (`DrawTalk`).
 */

type Person = { uid: string; name: string; firstName: string };
type PackBlock = { id: string; title: string; packs: Array<{ id: string; name: string }> };
type Holding = { packs: Record<string, string>; cases: Record<string, string> };

type Props = {
  groupId: string;
  weekId: string;
  weekNumber: number;
  people: Person[];
  packs: PackBlock[];
  talks: DrawTalk[];
  caseLabel: string;
  initial: Record<string, Holding>;
  foot: string;
  /** What each person is given: "a pathway and a case". */
  holding: string;
  /** The week's session has started or been held: Save asks first. */
  late: boolean;
  /** The programme has closed: nothing changes. */
  readOnly: boolean;
};

/** What Save is asking before it goes on: whether to leave unsaved, or to save into a week that has met. */
type Ask = { kind: "leave"; href: string } | { kind: "confirm"; then: string | null } | null;

function copy(holding: Holding | undefined): Holding {
  return { packs: { ...(holding?.packs ?? {}) }, cases: { ...(holding?.cases ?? {}) } };
}

export default function DrawEditor({
  groupId,
  weekId,
  weekNumber,
  people,
  packs,
  talks,
  caseLabel,
  initial,
  foot,
  holding,
  late: lateAtOpen,
  readOnly,
}: Props) {
  const formId = useId();
  const hydrated = useHydrated();
  const [saved, setSaved] = useState<Record<string, Holding>>(() =>
    Object.fromEntries(people.map((person) => [person.uid, copy(initial[person.uid])])),
  );
  const [values, setValues] = useState<Record<string, Holding>>(() =>
    Object.fromEntries(people.map((person) => [person.uid, copy(initial[person.uid])])),
  );
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapA, setSwapA] = useState(people[0]?.uid ?? "");
  const [swapB, setSwapB] = useState(people[1]?.uid ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [late, setLate] = useState(lateAtOpen);
  const [ask, setAsk] = useState<Ask>(null);
  const askRef = useRef<HTMLDivElement>(null);
  // Set once the facilitator has chosen to go, so the tab's own ask does not follow.
  const going = useRef(false);

  /** Opens another address, past the ask about changes not saved. */
  function go(href: string) {
    going.current = true;
    window.location.assign(href);
  }

  const titleOf = new Map(packs.map((block) => [block.id, block.title]));
  const nameOf = new Map(people.map((person) => [person.uid, person.firstName || person.name]));

  /** What changed since the last save, as the route takes it. */
  const changes = people.flatMap((person) => {
    const now = values[person.uid];
    const was = saved[person.uid];
    return [
      ...packs
        .filter((block) => (now?.packs[block.id] ?? "") !== (was?.packs[block.id] ?? ""))
        .map((block) => ({ uid: person.uid, blockId: block.id, value: now?.packs[block.id] || null })),
      ...talks
        .filter((talk) => (now?.cases[talk.id] ?? "") !== (was?.cases[talk.id] ?? ""))
        .map((talk) => ({ uid: person.uid, blockId: talk.id, value: now?.cases[talk.id] || null })),
    ];
  });

  const changedPeople = new Set(changes.map((change) => change.uid)).size;
  const dirty = !readOnly && changes.length > 0;

  // Leaving with changes not saved: a link, the Week picker, or the tab itself.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (going.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const to = new URL(link.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      event.preventDefault();
      setAsk({ kind: "leave", href: to.pathname + to.search + to.hash });
    };
    const onLeave = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (!href) return;
      event.preventDefault();
      setAsk({ kind: "leave", href });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener(DRAW_LEAVE_EVENT, onLeave);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(DRAW_LEAVE_EVENT, onLeave);
    };
  }, [dirty]);

  // What Save is asking comes into view, and takes the focus.
  useEffect(() => {
    if (!ask) return;
    askRef.current?.scrollIntoView?.({ block: "nearest" });
    askRef.current?.focus();
  }, [ask]);

  function setPack(uid: string, blockId: string, packId: string) {
    setMessage(null);
    setError(null);
    setValues((prev) => {
      const next = copy(prev[uid]);
      if (packId) next.packs[blockId] = packId;
      else delete next.packs[blockId];
      // A case the new pack does not offer is taken back.
      for (const talk of talks) {
        if (talk.keyedBy !== blockId || !next.cases[talk.id]) continue;
        const options = caseOptions(talk, (id) => next.packs[id] ?? null);
        if (options.kind !== "cases" || !options.cases.some((item) => item.id === next.cases[talk.id])) delete next.cases[talk.id];
      }
      return { ...prev, [uid]: next };
    });
  }

  function setCase(uid: string, talkId: string, caseId: string) {
    setMessage(null);
    setError(null);
    setValues((prev) => {
      const next = copy(prev[uid]);
      if (caseId) next.cases[talkId] = caseId;
      else delete next.cases[talkId];
      return { ...prev, [uid]: next };
    });
  }

  function swap() {
    if (!swapA || !swapB || swapA === swapB) return;
    setValues((prev) => ({ ...prev, [swapA]: copy(prev[swapB]), [swapB]: copy(prev[swapA]) }));
    setError(null);
    setMessage(swappedWords(nameOf.get(swapA) ?? "", nameOf.get(swapB) ?? ""));
    setSwapOpen(false);
  }

  /** Save, asking first on a week that has met; `then` is where to go once saved. */
  function requestSave(then: string | null) {
    if (changes.length === 0 || saving || readOnly) return;
    if (late) {
      setAsk({ kind: "confirm", then });
      return;
    }
    void save(false, then);
  }

  async function save(confirmed: boolean, then: string | null) {
    if (changes.length === 0 || saving || readOnly) return;
    setSaving(true);
    setAsk(null);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/draw`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, entries: changes, ...(confirmed ? { confirmed: true } : {}) }),
      });
      const answer = (await res.json().catch(() => null)) as (DrawSaved & { error?: string; confirm?: boolean }) | null;
      if (res.status === 409 && answer?.confirm === true) {
        // The week's session started after the page opened: ask, as for a week that has met.
        setLate(true);
        setAsk({ kind: "confirm", then });
        return;
      }
      if (!res.ok || !answer?.ok) throw new Error(answer?.error || DRAW_NOT_SAVED);
      const kept = Object.fromEntries(people.map((person) => [person.uid, copy(values[person.uid])]));
      setSaved(kept);
      const have = people.filter((person) => {
        const now = kept[person.uid];
        return packs.every((block) => Boolean(now?.packs[block.id])) && talks.every((talk) => Boolean(now?.cases[talk.id]));
      }).length;
      setMessage(savedDrawWords(weekNumber, have, people.length, holding));
      if (then) go(then);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : DRAW_NOT_SAVED);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.draw}>
      {people.length > 1 && !readOnly && (
        <div className={styles.swap}>
          {!swapOpen ? (
            <button type="button" className={`${facilitator.buttonGhost} ${styles.swapButton}`} onClick={() => setSwapOpen(true)}>
              {SWAP_TWO_PEOPLE}
            </button>
          ) : (
            <div className={styles.swapPanel} role="group" aria-label={SWAP_TWO_PEOPLE}>
              <div className={styles.drawField}>
                <label className={styles.drawLabel} htmlFor={`${formId}-swap-a`}>
                  {SWAP_LABEL}
                </label>
                <Select id={`${formId}-swap-a`} value={swapA} onChange={(event) => setSwapA(event.target.value)}>
                  {people.map((person) => (
                    <option key={person.uid} value={person.uid}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className={styles.drawField}>
                <label className={styles.drawLabel} htmlFor={`${formId}-swap-b`}>
                  {SWAP_WITH}
                </label>
                <Select id={`${formId}-swap-b`} value={swapB} onChange={(event) => setSwapB(event.target.value)}>
                  {people.map((person) => (
                    <option key={person.uid} value={person.uid}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className={styles.swapActions}>
                <button type="button" className={facilitator.button} onClick={swap} disabled={!swapA || !swapB || swapA === swapB}>
                  {SWAP_THEM}
                </button>
                <button type="button" className={facilitator.buttonGhost} onClick={() => setSwapOpen(false)}>
                  {CANCEL}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ul className={styles.drawPeople} role="list">
        {people.map((person) => {
          const now = values[person.uid] ?? { packs: {}, cases: {} };
          const was = saved[person.uid] ?? { packs: {}, cases: {} };
          return (
            <li key={person.uid}>
              <fieldset className={styles.drawPerson}>
                <legend className={styles.drawPersonHead}>
                  <InitialsChip name={person.name} uid={person.uid} size="md" />
                  <span className={styles.drawName}>{person.name}</span>
                </legend>
                {packs.map((block) => {
                  const current = now.packs[block.id] ?? "";
                  const id = `${formId}-${person.uid}-${block.id}`;
                  return (
                    <div key={block.id} className={styles.drawField}>
                      <label className={styles.drawLabel} htmlFor={id}>
                        {block.title}
                      </label>
                      <Select id={id} value={current} disabled={readOnly} onChange={(event) => setPack(person.uid, block.id, event.target.value)}>
                        {(!was.packs[block.id] || !current) && <option value="">{NOT_GIVEN_YET}</option>}
                        {block.packs.map((pack) => (
                          <option key={pack.id} value={pack.id}>
                            {pack.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
                {talks.map((talk) => {
                  const options = caseOptions(talk, (chooseOneId) => now.packs[chooseOneId] ?? null);
                  const current = now.cases[talk.id] ?? "";
                  const offered = options.kind === "cases" && options.cases.some((item) => item.id === current);
                  const id = `${formId}-${person.uid}-${talk.id}`;
                  return (
                    <div key={talk.id} className={styles.drawField}>
                      <label className={styles.drawLabel} htmlFor={id}>
                        {caseLabel}
                      </label>
                      {options.kind === "pack-first" ? (
                        <Select id={id} value="" disabled onChange={() => undefined}>
                          <option value="">{choosePackFirstWords(titleOf.get(options.chooseOneId) ?? "Pack")}</option>
                        </Select>
                      ) : (
                        <Select
                          id={id}
                          value={offered ? current : ""}
                          disabled={readOnly}
                          onChange={(event) => setCase(person.uid, talk.id, event.target.value)}
                        >
                          {(!was.cases[talk.id] || !offered) && <option value="">{NOT_GIVEN_YET}</option>}
                          {options.cases.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                  );
                })}
              </fieldset>
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <div className={styles.drawFoot}>
          {ask && (
            <div ref={askRef} tabIndex={-1} className={styles.drawAsk} role="group" aria-label={ask.kind === "leave" ? LEAVE_WITHOUT_SAVING : SAVE}>
              <p className={styles.drawAskLine}>{ask.kind === "leave" ? leavingUnsavedWords(changedPeople) : READY_TAKEN_BACK}</p>
              <div className={styles.swapActions}>
                {ask.kind === "leave" ? (
                  <>
                    <button type="button" className={facilitator.buttonPrimary} onClick={() => requestSave(ask.href)} disabled={saving}>
                      {SAVE}
                    </button>
                    <button
                      type="button"
                      className={facilitator.buttonGhost}
                      onClick={() => {
                        const href = ask.href;
                        setAsk(null);
                        go(href);
                      }}
                    >
                      {LEAVE_WITHOUT_SAVING}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={facilitator.buttonPrimary} onClick={() => void save(true, ask.then)} disabled={saving}>
                      {SAVE_ANYWAY}
                    </button>
                    <button type="button" className={facilitator.buttonGhost} onClick={() => setAsk(null)}>
                      {CANCEL}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          {message && (
            <p className={styles.line} role="status">
              {message}
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className={`${facilitator.buttonPrimary} ${styles.saveButton}`}
            onClick={() => requestSave(null)}
            disabled={!hydrated || saving || changes.length === 0}
          >
            {SAVE}
          </button>
          <p className={styles.drawFootLine}>{foot}</p>
        </div>
      )}
    </div>
  );
}
