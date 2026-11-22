"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import {
  LARGEST_TEAM,
  MADE_FROM_CHOICES,
  NO_PITCHING_WEEK_NEEDED,
  PICKS_EACH,
  PICKS_ONLY_HERE,
  PITCHING_WEEK,
  SAVE_PITCHING_WEEK,
  SMALLEST_TEAM,
  TEAMS_MADE_FROM,
  TEAMS_MADE_ON,
  TEAMS_SHOW,
  bodyOf,
  inputFromBoxes,
} from "@/lib/courses/pitching/settings";
import { COURSE_FIELD_LIMITS } from "@/lib/firestore/courses";
import styles from "./PitchingWeekCard.module.css";

/**
 * PITCHING WEEK'S SETTINGS, the card above a programme's pitches on Groups,
 * Pitches: which week it is (said, from the tick in that week's settings on
 * the Weeks tab: the lowest week ticked, as the pitching pages read it), how
 * the teams are made, how many pitches each person may pick, the smallest and
 * largest team, and the day teams are made. Saved through one route
 * (`PUT .../pitching-week`), which checks what the run editor's Pitching
 * week section checked and writes the same fields.
 *
 * A programme with no teams (not an incubator) is offered only how many
 * pitches each person may pick, and one whose teams are made from the agenda
 * with no pitching week is not offered that, since nobody pitches there; what
 * the card does not draw is sent as it is stored, so a save changes nothing
 * else. Nothing works before the
 * page's script has arrived (`useHydrated`). Nobody is emailed.
 */

type Stored = ReturnType<typeof bodyOf>;

const text = (value: string | number | null) => (value === null ? "" : String(value));

export default function PitchingWeekCard({
  roundId,
  programmeId,
  chip,
  stored,
  hasTeams,
  noWeekNeeded,
}: {
  roundId: string;
  programmeId: string;
  /** "Week 4 · Wed 25 Nov", or null with no pitching week. */
  chip: string | null;
  stored: Stored;
  hasTeams: boolean;
  /** Teams are made from the agenda and no week is pitching week. */
  noWeekNeeded: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [madeFrom, setMadeFrom] = useState(text(stored.teamsFrom));
  const [pickLimit, setPickLimit] = useState(text(stored.pickLimit));
  const [teamMin, setTeamMin] = useState(text(stored.teamSizeMin));
  const [teamMax, setTeamMax] = useState(text(stored.teamSizeMax));
  const [teamsMadeOn, setTeamsMadeOn] = useState(text(stored.teamsMadeOn));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: "done" | "error"; text: string } | null>(null);

  // The boxes follow what is stored when the page is read again (adjusted
  // during render, the RunEditor precedent).
  const [seed, setSeed] = useState(stored);
  if (stored !== seed) {
    setSeed(stored);
    setMadeFrom(text(stored.teamsFrom));
    setPickLimit(text(stored.pickLimit));
    setTeamMin(text(stored.teamSizeMin));
    setTeamMax(text(stored.teamSizeMax));
    setTeamsMadeOn(text(stored.teamsMadeOn));
  }

  // Where nobody pitches (teams from the agenda and no pitching week), no
  // box for picks is drawn; the stored value is sent as it is.
  const picksHere = !noWeekNeeded;

  async function save() {
    const read = inputFromBoxes(
      hasTeams
        ? { madeFrom, pickLimit: picksHere ? pickLimit : text(stored.pickLimit), teamMin, teamMax, teamsMadeOn }
        : {
            madeFrom: text(stored.teamsFrom),
            pickLimit,
            teamMin: text(stored.teamSizeMin),
            teamMax: text(stored.teamSizeMax),
            teamsMadeOn: text(stored.teamsMadeOn),
          },
    );
    if (!read.ok) {
      setSaid({ tone: "error", text: read.error });
      return;
    }
    setBusy(true);
    setSaid(null);
    try {
      const response = await fetch(
        `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/pitching-week`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyOf(read.input)) },
      );
      const body = (await response.json().catch(() => ({}))) as { message?: unknown; error?: unknown };
      if (response.ok) {
        setSaid({ tone: "done", text: typeof body.message === "string" ? body.message : "" });
        router.refresh();
      } else {
        setSaid({ tone: "error", text: typeof body.error === "string" ? body.error : "Couldn’t save that just now. Try again." });
      }
    } catch {
      setSaid({ tone: "error", text: "That didn’t reach the site. Check your connection, then try again." });
    }
    setBusy(false);
  }

  const idle = hydrated && !busy;

  return (
    <section className={styles.card} aria-labelledby="pitching-week-heading">
      <div className={styles.head}>
        <h2 id="pitching-week-heading" className={styles.heading}>
          {PITCHING_WEEK}
        </h2>
        {chip && <span className={styles.chip}>{chip}</span>}
      </div>
      {noWeekNeeded && <p className={styles.note}>{NO_PITCHING_WEEK_NEEDED}</p>}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (idle) void save();
        }}
      >
        <div className={styles.grid}>
          {hasTeams && (
            <Field id="pitching-made-from" label={TEAMS_MADE_FROM}>
              <Select id="pitching-made-from" value={madeFrom} onChange={(event) => setMadeFrom(event.target.value)}>
                {MADE_FROM_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {picksHere && (
            <Field id="pitching-pick-limit" label={PICKS_EACH}>
              <Input
                id="pitching-pick-limit"
                className={styles.short}
                type="number"
                inputMode="numeric"
                min={1}
                max={COURSE_FIELD_LIMITS.maxPitchPicks}
                step={1}
                value={pickLimit}
                onChange={(event) => setPickLimit(event.target.value)}
              />
            </Field>
          )}
          {hasTeams && (
            <>
              <Field id="pitching-team-min" label={SMALLEST_TEAM}>
                <Input
                  id="pitching-team-min"
                  className={styles.short}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={COURSE_FIELD_LIMITS.maxTeamSize}
                  step={1}
                  value={teamMin}
                  onChange={(event) => setTeamMin(event.target.value)}
                />
              </Field>
              <Field id="pitching-team-max" label={LARGEST_TEAM}>
                <Input
                  id="pitching-team-max"
                  className={styles.short}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={COURSE_FIELD_LIMITS.maxTeamSize}
                  step={1}
                  value={teamMax}
                  onChange={(event) => setTeamMax(event.target.value)}
                />
              </Field>
              <Field id="pitching-teams-made-on" label={TEAMS_MADE_ON}>
                {/* A native date input: the setting is a London civil date. */}
                <Input
                  id="pitching-teams-made-on"
                  className={styles.short}
                  type="date"
                  value={teamsMadeOn}
                  onChange={(event) => setTeamsMadeOn(event.target.value)}
                />
              </Field>
            </>
          )}
        </div>
        <p className={styles.hint}>{hasTeams ? TEAMS_SHOW : PICKS_ONLY_HERE}</p>
        {said && (
          <p className={said.tone === "error" ? styles.problem : styles.done} role={said.tone === "error" ? "alert" : "status"}>
            {said.text}
          </p>
        )}
        <div>
          <button type="submit" className={styles.save} disabled={!idle}>
            {SAVE_PITCHING_WEEK}
          </button>
        </div>
      </form>
    </section>
  );
}
