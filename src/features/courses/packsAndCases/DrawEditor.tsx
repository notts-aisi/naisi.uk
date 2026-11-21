"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import { caseOptions, drawCaseOf, notedCasesFor, type DrawTalk } from "@/lib/courses/packsAndCases/model";
import { swapRefusedWords } from "@/lib/courses/packsAndCases/swap";
import { safeReturnPath } from "@/lib/safeReturnPath";
import {
  ASKED_FOR_THIS_ONE,
  CANCEL,
  DRAW_NOT_SAVED,
  LEAVE_WITHOUT_SAVING,
  NOT_GIVEN_YET,
  NO_CASE_TO_GIVE,
  PICKS_THEIR_OWN,
  SAVE,
  SAVE_ANYWAY,
  SWAP_LABEL,
  SWAP_THEM,
  SWAP_TWO_PEOPLE,
  SWAP_WITH,
  THEIR_PICK,
  THEIR_PICK_CHANGED,
  askAfterRefusal,
  choosePackFirstWords,
  everyCaseNotedWords,
  leavingUnsavedWords,
  notPickedYetWords,
  notedCaseOptionWords,
  notedCasesWords,
  ownCaseGivenByWords,
  pickChangedLineWords,
  picksOnWeekPageWords,
  savedDrawWords,
  swappedWords,
  waitsForPackWords,
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
 *    are grouped by pack, and until they have one says "Choose Chloe’s
 *    pathway first." (`caseOptions`, the route's own rule). Changing
 *    somebody's pathway takes back a case their new pathway does not offer.
 *  - A PACK EACH PERSON PICKS (`picked`, `picks`) is shown as words with
 *    "Their pick", never a list; until they pick, the case list "Waits for a
 *    pathway". A pick that changed after its case was given says "Their pick
 *    changed", and the case they hold stays in the list until it is put
 *    right. A facilitator's own pick on a co-facilitator's page (`hidden`)
 *    is "Picks their own", with no case list.
 *  - A case with a content note is in no list until the row's "Asked for
 *    this one" is ticked; then it is offered, its note shown under the list
 *    once chosen, and the save carries the tick (`asked`), which the route
 *    requires. The tick is not kept: a row holding such a case opens ticked.
 *  - "Swap two people" swaps what a facilitator gives two people, never a
 *    pick: across two people who have not picked the same pathway, or a
 *    case with a content note going to somebody who has not asked for one,
 *    it is refused in a sentence. Save keeps it.
 *  - Save sends only what changed, and is held until the page has hydrated:
 *    before then nothing is listening to it. Saved, it says how many have
 *    everything the week gives out: "Saved. 6 of 8 have a pathway and a
 *    case. Each person sees theirs on their week 3 page."
 *  - A WEEK WHOSE SESSION HAS STARTED OR BEEN HELD (`ask`, the page's lines):
 *    Save first asks, which week it is first ("Week 3 is the week people are
 *    working on now. Its session has started."), then what the save changes
 *    ("Changing a case takes back that person’s Ready for my talk." on a week
 *    that gives out cases), and the save carries the yes (`confirmed`), which
 *    the route requires. A save the route refuses for want of it (the
 *    session started after the page opened) asks the route's own lines
 *    (`askAfterRefusal`), which week it is first, never the page's.
 *  - Once saved, the route's data is fetched again (`router.refresh()`), so
 *    the browser's Back never brings back what the page held before.
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
/** Whether each person asked for a case with a content note, by talk. */
type Asked = Record<string, Record<string, boolean>>;

type Props = {
  groupId: string;
  weekId: string;
  weekNumber: number;
  people: Person[];
  /** The Choose ones a facilitator gives out. */
  packs: PackBlock[];
  /** The Choose ones each person picks that the cases follow: shown, never typed. */
  picked: PackBlock[];
  talks: DrawTalk[];
  caseLabel: string;
  initial: Record<string, Holding>;
  /** Each person's pick in each of `picked`, as this viewer may see it. */
  picks: Record<string, Record<string, string>>;
  /** The people whose own pick this viewer does not read: their row says only that it is theirs. */
  hidden: string[];
  foot: string;
  /** What each person is given: "a pathway and a case". */
  holding: string;
  /** The week's session has started or been held: what Save asks first, which week it is first. Null for a week to come. */
  ask: string[] | null;
  /** The programme has closed: nothing changes. */
  readOnly: boolean;
};

/** What Save is asking before it goes on: whether to leave unsaved, or to save into a week that has met. */
type Ask = { kind: "leave"; href: string } | { kind: "confirm"; lines: string[]; then: string | null } | null;

function copy(holding: Holding | undefined): Holding {
  return { packs: { ...(holding?.packs ?? {}) }, cases: { ...(holding?.cases ?? {}) } };
}

export default function DrawEditor({
  groupId,
  weekId,
  weekNumber,
  people,
  packs,
  picked,
  talks,
  caseLabel,
  initial,
  picks,
  hidden,
  foot,
  holding,
  ask: askAtOpen,
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
  // A row holding a case with a content note opens ticked: it was given because they asked.
  const [asked, setAsked] = useState<Asked>(() =>
    Object.fromEntries(
      people.map((person) => [
        person.uid,
        Object.fromEntries(talks.map((talk) => [talk.id, drawCaseOf(talk, initial[person.uid]?.cases[talk.id] ?? null)?.drawable === false])),
      ]),
    ),
  );
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapA, setSwapA] = useState(people[0]?.uid ?? "");
  const [swapB, setSwapB] = useState(people[1]?.uid ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const askId = useId();
  const [ask, setAsk] = useState<Ask>(null);
  const askRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // Set once the facilitator has chosen to go, so neither ask follows them out.
  const going = useRef(false);

  /** Opens another address, past the ask about changes not saved. */
  function go(href: string) {
    going.current = true;
    router.push(href);
  }

  const titleOf = new Map([...packs, ...picked].map((block) => [block.id, block.title]));
  const nameOf = new Map(people.map((person) => [person.uid, person.firstName || person.name]));
  const pickedById = new Map(picked.map((block) => [block.id, block]));
  const hiddenSet = new Set(hidden);
  /** A talk whose cases follow a pack each person picks. */
  const followsPick = (talk: DrawTalk) => talk.keyedBy !== null && pickedById.has(talk.keyedBy);
  /** A person's pack in a Choose one: the one they were given, else the one they picked. */
  const packOfFor = (uid: string, holding: Holding | undefined) => (chooseOneId: string) =>
    holding?.packs[chooseOneId] ?? picks[uid]?.[chooseOneId] ?? null;
  const askedOf = (uid: string, talkId: string) => asked[uid]?.[talkId] === true;

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
        .map((talk) => ({
          uid: person.uid,
          blockId: talk.id,
          value: now?.cases[talk.id] || null,
          // The row's tick travels with the save, which needs it for a case with a content note.
          ...(askedOf(person.uid, talk.id) ? { asked: true } : {}),
        })),
    ];
  });

  const changedPeople = new Set(changes.map((change) => change.uid)).size;

  // Under the people: each group's cases with a content note, which are in no list until a row is ticked.
  const notedLines = [
    ...new Set(
      talks.flatMap((talk) =>
        talk.groups
          .map((group) => ({ group, count: group.cases.filter((item) => !item.drawable).length }))
          .filter(({ count }) => count > 0)
          .map(({ group, count }) => notedCasesWords(count, talk.keyedBy && group.packId ? group.name : "")),
      ),
    ),
  ];
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
      if (going.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      // Only a path on this site is asked about (`safeReturnPath`, the one place that is decided); any other link goes as it would.
      const href = safeReturnPath(link.getAttribute("href"));
      if (!href) return;
      event.preventDefault();
      setAsk({ kind: "leave", href });
    };
    const onLeave = (event: Event) => {
      if (going.current) return;
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
        const options = caseOptions(talk, packOfFor(uid, next), { asked: askedOf(uid, talk.id) });
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

  /** Ticks or unticks a row's "Asked for this one"; unticked, a case with a content note is taken back. */
  function setAskedFor(uid: string, talkId: string, on: boolean) {
    setMessage(null);
    setError(null);
    setAsked((prev) => ({ ...prev, [uid]: { ...(prev[uid] ?? {}), [talkId]: on } }));
    if (on) return;
    const talk = talks.find((candidate) => candidate.id === talkId);
    setValues((prev) => {
      const held = talk ? drawCaseOf(talk, prev[uid]?.cases[talkId] ?? null) : null;
      if (!held || held.drawable) return prev;
      const next = copy(prev[uid]);
      delete next.cases[talkId];
      return { ...prev, [uid]: next };
    });
  }

  function swap() {
    if (!swapA || !swapB || swapA === swapB) return;
    const refused = swapRefusedWords(swapA, swapB, {
      talks,
      pickedIds: new Set(pickedById.keys()),
      titleOf: (chooseOneId) => titleOf.get(chooseOneId) ?? "Pack",
      nameOf: (uid) => nameOf.get(uid) ?? "",
      caseOf: (uid, talkId) => values[uid]?.cases[talkId] ?? null,
      pickOf: (uid, chooseOneId) => picks[uid]?.[chooseOneId] ?? null,
      askedOf,
      hidden: (uid) => hiddenSet.has(uid),
    });
    if (refused) {
      setSwapError(refused);
      return;
    }
    // What a facilitator gives moves; a pick stays with its person.
    setValues((prev) => ({ ...prev, [swapA]: copy(prev[swapB]), [swapB]: copy(prev[swapA]) }));
    setError(null);
    setSwapError(null);
    setMessage(swappedWords(nameOf.get(swapA) ?? "", nameOf.get(swapB) ?? ""));
    setSwapOpen(false);
  }

  /** Save, asking first on a week that has met; `then` is where to go once saved. */
  function requestSave(then: string | null) {
    if (changes.length === 0 || saving || readOnly) return;
    if (askAtOpen && askAtOpen.length > 0) {
      setAsk({ kind: "confirm", lines: askAtOpen, then });
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
      const answer = (await res.json().catch(() => null)) as (DrawSaved & { error?: string; confirm?: boolean; ask?: unknown }) | null;
      if (res.status === 409 && answer?.confirm === true) {
        // The week's session started after the page opened: ask what the route says, which week it is first.
        setAsk({ kind: "confirm", lines: askAfterRefusal(answer), then });
        return;
      }
      if (!res.ok || !answer?.ok) throw new Error(answer?.error || DRAW_NOT_SAVED);
      const kept = Object.fromEntries(people.map((person) => [person.uid, copy(values[person.uid])]));
      setSaved(kept);
      // Counted over the rows this page gives out to: a row whose case it is not shown is in neither number.
      const counted = people.filter((person) => !hiddenSet.has(person.uid) || !talks.some(followsPick));
      const have = counted.filter((person) => {
        const now = kept[person.uid];
        return packs.every((block) => Boolean(now?.packs[block.id])) && talks.every((talk) => Boolean(now?.cases[talk.id]));
      }).length;
      setMessage(savedDrawWords(weekNumber, have, counted.length, holding));
      if (then) go(then);
      // What the server holds now, so Back never brings back what the page held before the save.
      else router.refresh();
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
                <Select
                  id={`${formId}-swap-a`}
                  value={swapA}
                  onChange={(event) => {
                    setSwapA(event.target.value);
                    setSwapError(null);
                  }}
                >
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
                <Select
                  id={`${formId}-swap-b`}
                  value={swapB}
                  onChange={(event) => {
                    setSwapB(event.target.value);
                    setSwapError(null);
                  }}
                >
                  {people.map((person) => (
                    <option key={person.uid} value={person.uid}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </div>
              {swapError && (
                <p className={styles.error} role="alert">
                  {swapError}
                </p>
              )}
              <div className={styles.swapActions}>
                <button type="button" className={facilitator.button} onClick={swap} disabled={!swapA || !swapB || swapA === swapB}>
                  {SWAP_THEM}
                </button>
                <button
                  type="button"
                  className={facilitator.buttonGhost}
                  onClick={() => {
                    setSwapOpen(false);
                    setSwapError(null);
                  }}
                >
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
                {picked.map((block) => {
                  const pick = hiddenSet.has(person.uid) ? null : (picks[person.uid]?.[block.id] ?? null);
                  const name = block.packs.find((pack) => pack.id === pick)?.name ?? null;
                  // Holding a case from a pack they have since left.
                  const changed =
                    name !== null &&
                    talks.some((talk) => {
                      if (talk.keyedBy !== block.id) return false;
                      const held = drawCaseOf(talk, was.cases[talk.id] ?? null);
                      return held !== null && held.packId !== null && held.packId !== pick;
                    });
                  return (
                    <div key={block.id} className={styles.drawField}>
                      <span className={styles.drawLabel}>{block.title}</span>
                      {hiddenSet.has(person.uid) ? (
                        <p className={`${styles.drawPick} ${styles.drawPickMuted}`}>{PICKS_THEIR_OWN}</p>
                      ) : name ? (
                        <p className={styles.drawPick}>
                          <span>{name}</span>
                          <span className={styles.chip}>{changed ? THEIR_PICK_CHANGED : THEIR_PICK}</span>
                        </p>
                      ) : (
                        <p className={`${styles.drawPick} ${styles.drawPickMuted}`}>{notPickedYetWords(block.title)}</p>
                      )}
                    </div>
                  );
                })}
                {talks.map((talk) => {
                  const id = `${formId}-${person.uid}-${talk.id}`;
                  const first = nameOf.get(person.uid) ?? person.name;
                  if (followsPick(talk) && hiddenSet.has(person.uid)) {
                    return (
                      <div key={talk.id} className={styles.drawField}>
                        <span className={styles.drawLabel}>{caseLabel}</span>
                        <p className={`${styles.drawPick} ${styles.drawPickMuted}`}>{ownCaseGivenByWords(first)}</p>
                      </div>
                    );
                  }
                  const packOf = packOfFor(person.uid, now);
                  const ticked = askedOf(person.uid, talk.id);
                  const options = caseOptions(talk, packOf, { asked: ticked });
                  const current = now.cases[talk.id] ?? "";
                  const offered = options.kind === "cases" && options.cases.some((item) => item.id === current);
                  const keyTitle = talk.keyedBy ? (titleOf.get(talk.keyedBy) ?? "Pack") : "Pack";
                  if (options.kind === "pack-first") {
                    const waits = followsPick(talk);
                    return (
                      <div key={talk.id} className={styles.drawField}>
                        <label className={styles.drawLabel} htmlFor={id}>
                          {caseLabel}
                        </label>
                        <Select id={id} value="" disabled onChange={() => undefined}>
                          <option value="">{waits ? waitsForPackWords(keyTitle) : NOT_GIVEN_YET}</option>
                        </Select>
                        <p className={styles.drawFieldLine}>
                          {waits ? picksOnWeekPageWords(first, weekNumber) : choosePackFirstWords(keyTitle, first)}
                        </p>
                      </div>
                    );
                  }
                  const noted = notedCasesFor(talk, packOf);
                  const held = drawCaseOf(talk, current || null);
                  // A pick that changed after its case was given: the case they hold stays shown until it is put right.
                  const stale =
                    followsPick(talk) && held !== null && !offered && current === (was.cases[talk.id] ?? "") ? held : null;
                  const shown = offered || stale !== null;
                  const pack = talk.keyedBy ? packOf(talk.keyedBy) : null;
                  const groupName = talk.groups.find((group) => talk.keyedBy !== null && group.packId === pack)?.name ?? "";
                  const nothingUnasked = options.cases.length === 0 && noted.length > 0 && !ticked && !stale;
                  const notedIds = new Set(noted.map((item) => item.id));
                  return (
                    <div key={talk.id} className={styles.drawField}>
                      <label className={styles.drawLabel} htmlFor={id}>
                        {caseLabel}
                      </label>
                      {nothingUnasked ? (
                        <Select id={id} value="" disabled onChange={() => undefined}>
                          <option value="">{NO_CASE_TO_GIVE}</option>
                        </Select>
                      ) : (
                        <Select
                          id={id}
                          value={shown ? current : ""}
                          disabled={readOnly}
                          onChange={(event) => setCase(person.uid, talk.id, event.target.value)}
                        >
                          {(!was.cases[talk.id] || !shown) && <option value="">{NOT_GIVEN_YET}</option>}
                          {stale && <option value={stale.id}>{stale.title}</option>}
                          {options.cases.map((item) => (
                            <option key={item.id} value={item.id}>
                              {notedIds.has(item.id) ? notedCaseOptionWords(item.title) : item.title}
                            </option>
                          ))}
                        </Select>
                      )}
                      {stale && <p className={styles.drawFieldLine}>{pickChangedLineWords(keyTitle)}</p>}
                      {nothingUnasked && <p className={styles.drawFieldLine}>{everyCaseNotedWords(groupName, first)}</p>}
                      {shown && held && !held.drawable && held.note && (
                        <p className={`${styles.caseNote} ${styles.drawCaseNote}`}>{held.note}</p>
                      )}
                      {noted.length > 0 && !readOnly && (
                        <label className={styles.drawAsked}>
                          <input
                            type="checkbox"
                            className={styles.drawAskedBox}
                            checked={ticked}
                            onChange={(event) => setAskedFor(person.uid, talk.id, event.currentTarget.checked)}
                          />
                          <span>{ASKED_FOR_THIS_ONE}</span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </fieldset>
            </li>
          );
        })}
      </ul>

      {notedLines.length > 0 && (
        <div className={styles.drawNotes}>
          {notedLines.map((line) => (
            <p key={line} className={styles.line}>
              {line}
            </p>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className={styles.drawFoot}>
          {ask && (
            <div
              ref={askRef}
              tabIndex={-1}
              className={styles.drawAsk}
              role="group"
              // Announced by its own sentences, never by a button's word.
              aria-labelledby={(ask.kind === "leave" ? [`${askId}-0`] : ask.lines.map((_, index) => `${askId}-${index}`)).join(" ")}
            >
              {(ask.kind === "leave" ? [leavingUnsavedWords(changedPeople)] : ask.lines).map((line, index) => (
                <p key={line} id={`${askId}-${index}`} className={styles.drawAskLine}>
                  {line}
                </p>
              ))}
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
