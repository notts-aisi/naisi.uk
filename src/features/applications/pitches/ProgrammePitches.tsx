import Link from "next/link";
import { Refusal } from "@/features/applications/editor/Refusals";
import type { StaffPitchesView } from "@/lib/applications/handover/pitchesLoad";
import { pitchingWeekChip } from "@/lib/courses/pitching/settings";
import { wouldJoinWords } from "@/lib/courses/pitching/words";
import { noPitchingWeekWords } from "@/lib/courses/teams/words";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import PitchingWeekCard from "./PitchingWeekCard";
import styles from "./ProgrammePitches.module.css";

/**
 * THE PITCHES FROM A PROGRAMME'S PITCHING WEEK, for its lead and for admins
 * (the "Pitches from week 3" list).
 *
 * The list is read only, and drawn on the server. Above it, pitching week's
 * settings (`PitchingWeekCard`, the one part with a script), for a
 * programme with teams always (an incubator: its teams need the settings,
 * and one whose teams are made from the agenda has no pitching week at all)
 * and for any other programme once it has a pitching week. Teams themselves
 * are made on the Teams tab.
 *
 * Every address here is a page of this site, written out from its own path
 * with stored ids encoded into it, so none can name another site.
 */

/** A calm sentence in place of the list, with the one place to go next. */
function Blank({ view }: { view: StaffPitchesView }) {
  const name = view.programmeName;
  if (view.blank === "no-run" || view.blank === "run-gone") {
    return (
      <section className={`${styles.card} ${styles.blank}`}>
        <p className={styles.blankText}>
          {view.blank === "no-run"
            ? `${name} doesn’t name a course run yet. Name it on the Settings tab, under Course run, and its pitching week’s pitches show here.`
            : `The course run ${name} names is no longer on the site. Name another on the Settings tab, under Course run.`}
        </p>
        <div className={styles.blankActions}>
          <Link
            href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/setup`}
            className={styles.button}
          >
            Go to Settings
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className={`${styles.card} ${styles.blank}`}>
      <p className={styles.blankText}>{noPitchingWeekWords(name)}</p>
      <div className={styles.blankActions}>
        <Link href={weeksPath(view.roundId, view.programmeId)} className={styles.button}>
          Open the Weeks tab
        </Link>
      </div>
    </section>
  );
}

/** The list itself, drawn inside the Groups tab's frame and under its row of views (`GroupsViews`). */
export function ProgrammePitches({ view }: { view: StaffPitchesView }) {
  const noWeek = view.blank === "no-week";
  // An incubator whose teams are made from the agenda needs no pitching week:
  // the card says so, and no sentence asks for one.
  const agendaNoWeek = view.hasTeams && noWeek && view.settings?.teamsFrom === "agenda";
  const card =
    view.settings !== null && (view.hasTeams || view.weekNumber !== null) ? (
      <PitchingWeekCard
        roundId={view.roundId}
        programmeId={view.programmeId}
        chip={view.weekNumber !== null ? pitchingWeekChip(view.weekNumber, view.firstSession) : null}
        stored={view.settings}
        hasTeams={view.hasTeams}
        noWeekNeeded={agendaNoWeek}
      />
    ) : null;
  return (
    <div className={styles.page}>
      {card}
      {agendaNoWeek ? null : view.blank !== null || view.weekNumber === null ? (
        <Blank view={view} />
      ) : (
        <section className={styles.card} aria-labelledby="pitches-heading">
          <h2 id="pitches-heading" className={styles.heading}>
            Pitches from week {view.weekNumber}{" "}
            <span className={styles.count}>({view.pitches.length})</span>
          </h2>
          {!view.published && (
            <p className={styles.note}>
              Week {view.weekNumber} isn’t published yet, so nobody can pitch until it is.
            </p>
          )}
          {!view.pickLimitSet && (
            <p className={styles.note}>
              Nobody can pick yet: set how many pitches each person may pick in pitching week’s settings
              above.
            </p>
          )}
          {view.pitches.length === 0 ? (
            <p className={styles.empty}>No pitches yet.</p>
          ) : (
            <ul className={styles.list}>
              {view.pitches.map((pitch) => (
                <li key={pitch.id} className={styles.item}>
                  <div className={styles.itemHead}>
                    <p className={styles.itemTitle}>{pitch.title}</p>
                    <span className={styles.joinCount}>{wouldJoinWords(pitch.wouldJoin)}</span>
                  </div>
                  <div className={styles.itemMeta}>
                    <span>{pitch.pitchedBy}</span>
                    {pitch.groupName && <span className={styles.group}>{pitch.groupName}</span>}
                  </div>
                  <p className={styles.itemTwist}>{pitch.twist}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** What a programme's reviewer is shown: the list is the lead's and admins'. */
export function PitchesAreTheLeads({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  return (
    <Refusal
      title="Only the lead and admins can open the pitches"
      href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
      action="Go to applications"
    >
      The pitches from pitching week, and how many people would join each, are for the
      programme’s lead and admins, who make the teams from them.
    </Refusal>
  );
}
