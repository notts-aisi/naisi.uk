"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  COURSE_FIELD_LIMITS,
  pitchSettingsError,
  type CourseWeekDoc,
  type RunPitchSettings,
} from "@/lib/firestore/courses";
import type { WeekPlanEntry } from "@/lib/courses/weekPlan";
import { normalizeTeamsFrom, type TeamsFrom } from "@/lib/courses/teams/model";
import { updateRun } from "../courseMutations";
import styles from "./PitchSettingsEditor.module.css";

/**
 * PITCHING WEEK'S SETTINGS, in the run editor beside the run's others.
 *
 * Which week is pitching week is not set here: it is a tick on that week's
 * own details ("This is pitching week"), so this section only says which
 * week is ticked. What is set here is the run's part (`RunPitchSettings`):
 * how many pitches a person may pick, how small and how large a team may be,
 * and the day the teams are made. Each is blank until somebody types it, and
 * a blank one is left out of what people are shown.
 *
 * Beside them, how the run's teams are made (`CourseRunDoc.teamsFrom`): from
 * the pitches, or from the agenda the application form asked people to rank.
 * The programme page's Teams tab makes them that way. It has no default, and
 * the sizes and the day above are the teams' whichever way they are made.
 *
 * Saved client-direct through `updateRun`, like every other run setting on
 * this page, by whoever may edit the run.
 */

type Props = {
  runId: string;
  settings: RunPitchSettings;
  /** How the run's teams are made, or null while nobody has said. */
  teamsFrom: TeamsFrom | null;
  weekPlan: WeekPlanEntry[];
  /** The run's week documents, for which of them is ticked. */
  weeks: CourseWeekDoc[];
  runAction: (
    action: () => Promise<void>,
    messages: { savingMessage: string; successMessage: string },
  ) => Promise<unknown>;
  onSaved: () => void;
};

/** The taught week numbers whose own document is ticked, lowest first. */
function tickedWeekNumbers(weekPlan: WeekPlanEntry[], weeks: CourseWeekDoc[]): number[] {
  const ticked = new Set(weeks.filter((week) => week.pitching).map((week) => week.id));
  const numbers: number[] = [];
  for (const entry of weekPlan) {
    if (entry.kind !== "week") continue;
    const id = `w${String(entry.weekNumber).padStart(2, "0")}`;
    if (ticked.has(id)) numbers.push(entry.weekNumber);
  }
  return numbers.sort((a, b) => a - b);
}

/** "3", "3 and 5", "3, 5 and 7". */
function listNumbers(numbers: number[]): string {
  if (numbers.length <= 1) return numbers.join("");
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

function text(value: number | null): string {
  return value === null ? "" : String(value);
}

/** A typed box as a whole number, null when blank, NaN when it is not one. */
function wholeOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export default function PitchSettingsEditor({
  runId,
  settings,
  teamsFrom,
  weekPlan,
  weeks,
  runAction,
  onSaved,
}: Props) {
  const [pickLimit, setPickLimit] = useState(text(settings.pickLimit));
  const [teamMin, setTeamMin] = useState(text(settings.teamSize?.min ?? null));
  const [teamMax, setTeamMax] = useState(text(settings.teamSize?.max ?? null));
  const [teamsMadeOn, setTeamsMadeOn] = useState(settings.teamsMadeOn ?? "");
  const [madeFrom, setMadeFrom] = useState<string>(teamsFrom ?? "");
  const [error, setError] = useState<string | null>(null);

  // Reseed the boxes whenever the saved settings are read again (adjusted
  // during render, the RunEditor precedent).
  const [synced, setSynced] = useState(settings);
  const [syncedFrom, setSyncedFrom] = useState(teamsFrom);
  if (teamsFrom !== syncedFrom) {
    setSyncedFrom(teamsFrom);
    setMadeFrom(teamsFrom ?? "");
  }
  if (settings !== synced) {
    setSynced(settings);
    setPickLimit(text(settings.pickLimit));
    setTeamMin(text(settings.teamSize?.min ?? null));
    setTeamMax(text(settings.teamSize?.max ?? null));
    setTeamsMadeOn(settings.teamsMadeOn ?? "");
    setError(null);
  }

  const ticked = tickedWeekNumbers(weekPlan, weeks);

  async function save() {
    const limit = wholeOrNull(pickLimit);
    const min = wholeOrNull(teamMin);
    const max = wholeOrNull(teamMax);
    if ((min === null) !== (max === null)) {
      setError("Give the smallest and the largest team together, or leave both blank.");
      return;
    }
    const next: RunPitchSettings = {
      pickLimit: limit,
      teamSize: min !== null && max !== null ? { min, max } : null,
      teamsMadeOn: teamsMadeOn.trim() || null,
    };
    const problem = pitchSettingsError(next);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    let ok = false;
    await runAction(
      async () => {
        await updateRun(runId, { pitchSettings: next, teamsFrom: normalizeTeamsFrom(madeFrom) });
        ok = true;
      },
      { savingMessage: "Saving pitching week…", successMessage: "Pitching week saved" },
    );
    if (ok) onSaved();
  }

  return (
    <Card padding="lg">
      <h3 className={styles.title}>Pitching week</h3>
      <p className={styles.hint}>
        {ticked.length === 0
          ? "No week is pitching week. Tick “This is pitching week” in a week’s details to make it one."
          : ticked.length === 1
            ? `Week ${ticked[0]} is pitching week. People pitch and pick until their group’s session that week starts.`
            : `Weeks ${listNumbers(ticked)} are ticked as pitching week. Week ${ticked[0]} is the one that counts: untick the others.`}
      </p>

      <div className={styles.fields}>
        <Field
          id="teams-made-from"
          label="Teams are made from"
          hint="How the programme page’s Teams tab makes this run’s teams. The sizes and the day below are the teams’ either way."
        >
          <Select id="teams-made-from" value={madeFrom} onChange={(event) => setMadeFrom(event.target.value)}>
            <option value="">Not set yet</option>
            <option value="pitches">The pitches from pitching week</option>
            <option value="agenda">The agenda people ranked on the application form</option>
          </Select>
        </Field>

        <Field
          id="pitch-pick-limit"
          label="Pitches a person may pick"
          hint={`How many pitches each person may say they’d join. Leave it blank and nobody can pick. At most ${COURSE_FIELD_LIMITS.maxPitchPicks}.`}
        >
          <Input
            id="pitch-pick-limit"
            type="number"
            inputMode="numeric"
            min={1}
            max={COURSE_FIELD_LIMITS.maxPitchPicks}
            step={1}
            value={pickLimit}
            onChange={(event) => setPickLimit(event.target.value)}
          />
        </Field>

        <div className={styles.pair}>
          <Field id="pitch-team-min" label="Smallest team" hint="People in a team, at least.">
            <Input
              id="pitch-team-min"
              type="number"
              inputMode="numeric"
              min={1}
              max={COURSE_FIELD_LIMITS.maxTeamSize}
              step={1}
              value={teamMin}
              onChange={(event) => setTeamMin(event.target.value)}
            />
          </Field>
          <Field id="pitch-team-max" label="Largest team" hint="People in a team, at most.">
            <Input
              id="pitch-team-max"
              type="number"
              inputMode="numeric"
              min={1}
              max={COURSE_FIELD_LIMITS.maxTeamSize}
              step={1}
              value={teamMax}
              onChange={(event) => setTeamMax(event.target.value)}
            />
          </Field>
        </div>

        <Field
          id="pitch-teams-made-on"
          label="Teams are made on"
          hint="The day the teams are made. People are told it in pitching week, with the programme lead’s first name."
        >
          {/* A native date input: the setting is a London civil date, the
              shape the run's own start date takes. */}
          <Input
            id="pitch-teams-made-on"
            type="date"
            value={teamsMadeOn}
            onChange={(event) => setTeamsMadeOn(event.target.value)}
          />
        </Field>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button type="button" onClick={save}>
          Save pitching week
        </Button>
      </div>
    </Card>
  );
}
