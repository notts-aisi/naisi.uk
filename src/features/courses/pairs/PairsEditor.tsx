"use client";

import { useId, useState } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import Select from "@/components/ui/Select";
import Switch from "@/components/ui/Switch";
import { useHydrated } from "@/hooks/useHydrated";
import { NO_ENTRY, pairNumbersFor, pairsView, type PairEntry } from "@/lib/courses/pairs/model";
import {
  BRINGING_A_LAPTOP,
  NOT_PAIRED_YET,
  PAIR,
  SAVE,
  pairNumberWords,
  savedPairsWords,
} from "@/lib/courses/pairs/words";
import type { PairsSaved } from "@/app/api/courses/groups/[groupId]/pairs/route";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import draw from "@/features/courses/packsAndCases/packsAndCases.module.css";
import PairsList from "./PairsList";

/**
 * THE PAIRS' FORM (Technical AI Safety's hands-on night; no board draws it):
 * the pairs as they stand, with the check that every pair has a laptop and
 * what a save would refuse; then a row per person in the group's pairs (its
 * people taking part and its facilitators, who take part too) with a "Pair"
 * select and, on a week that asks, a "Bringing a laptop" switch; then Save,
 * with what each person sees and that nobody is emailed.
 *
 *  - Pair numbers: one for every two people, and any already in use. Two or
 *    three people given one number are a pair.
 *  - At least one laptop per pair is a check, never a refusal: the list says
 *    which pairs have none yet, and Save still saves.
 *  - Save sends only what changed, and is held until the page has hydrated:
 *    before then nothing is listening to it.
 *
 * Handed the fields it draws, never a record: names, uids and each person's
 * entry.
 */

type Person = { uid: string; name: string; firstName: string };

type Props = {
  groupId: string;
  weekId: string;
  weekNumber: number;
  blockId: string;
  laptops: boolean;
  people: Person[];
  initial: Record<string, PairEntry>;
  foot: string;
};

function entryOf(map: Record<string, PairEntry>, uid: string): PairEntry {
  return map[uid] ?? NO_ENTRY;
}

export default function PairsEditor({ groupId, weekId, weekNumber, blockId, laptops, people, initial, foot }: Props) {
  const formId = useId();
  const hydrated = useHydrated();
  const [saved, setSaved] = useState<Record<string, PairEntry>>(() =>
    Object.fromEntries(people.map((person) => [person.uid, entryOf(initial, person.uid)])),
  );
  const [values, setValues] = useState<Record<string, PairEntry>>(() =>
    Object.fromEntries(people.map((person) => [person.uid, entryOf(initial, person.uid)])),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const view = pairsView(people, (uid) => values[uid], laptops);
  const numbers = pairNumbersFor(
    people.length,
    people.flatMap((person) => {
      const pair = entryOf(values, person.uid).pair;
      return pair === null ? [] : [pair];
    }),
  );

  /** What changed since the last save, as the route takes it. */
  const changes = people.flatMap((person) => {
    const now = entryOf(values, person.uid);
    const was = entryOf(saved, person.uid);
    return now.pair === was.pair && now.laptop === was.laptop ? [] : [{ uid: person.uid, pair: now.pair, laptop: now.laptop }];
  });

  function set(uid: string, next: Partial<PairEntry>) {
    setMessage(null);
    setError(null);
    setValues((prev) => ({ ...prev, [uid]: { ...entryOf(prev, uid), ...next } }));
  }

  async function save() {
    if (changes.length === 0 || saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/courses/groups/${encodeURIComponent(groupId)}/pairs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, blockId, entries: changes }),
      });
      const answer = (await res.json().catch(() => null)) as (PairsSaved & { error?: string }) | null;
      if (!res.ok || !answer?.ok) throw new Error(answer?.error || "Couldn’t save the pairs just now. Try again.");
      setSaved(Object.fromEntries(people.map((person) => [person.uid, entryOf(values, person.uid)])));
      setMessage(savedPairsWords(weekNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save the pairs just now. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={draw.draw}>
      <PairsList view={view} laptops={laptops} headingId={`${formId}-pairs`} />

      <ul className={draw.drawPeople} role="list">
        {people.map((person) => {
          const now = entryOf(values, person.uid);
          const selectId = `${formId}-${person.uid}-pair`;
          return (
            <li key={person.uid}>
              <fieldset className={draw.drawPerson}>
                <legend className={draw.drawPersonHead}>
                  <InitialsChip name={person.name} uid={person.uid} size="md" />
                  <span className={draw.drawName}>{person.name}</span>
                </legend>
                <div className={draw.drawField}>
                  <label className={draw.drawLabel} htmlFor={selectId}>
                    {PAIR}
                  </label>
                  <Select
                    id={selectId}
                    value={now.pair === null ? "" : String(now.pair)}
                    onChange={(event) => set(person.uid, { pair: event.target.value ? Number(event.target.value) : null })}
                  >
                    <option value="">{NOT_PAIRED_YET}</option>
                    {numbers.map((number) => (
                      <option key={number} value={String(number)}>
                        {pairNumberWords(number)}
                      </option>
                    ))}
                  </Select>
                </div>
                {laptops && (
                  <div className={facilitator.pairsLaptopRow}>
                    <Switch
                      id={`${formId}-${person.uid}-laptop`}
                      checked={now.laptop}
                      onChange={(next) => set(person.uid, { laptop: next })}
                      label={BRINGING_A_LAPTOP}
                    />
                  </div>
                )}
              </fieldset>
            </li>
          );
        })}
      </ul>

      <div className={draw.drawFoot}>
        {message && (
          <p className={draw.line} role="status">
            {message}
          </p>
        )}
        {error && (
          <p className={draw.error} role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className={`${facilitator.buttonPrimary} ${draw.saveButton}`}
          onClick={() => void save()}
          disabled={!hydrated || saving || changes.length === 0}
        >
          {SAVE}
        </button>
        <p className={draw.drawFootLine}>{foot}</p>
      </div>
    </div>
  );
}
