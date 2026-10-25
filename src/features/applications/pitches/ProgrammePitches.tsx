import Link from "next/link";
import { Refusal } from "@/features/applications/editor/Refusals";
import type { StaffPitchesView } from "@/lib/applications/handover/pitchesLoad";
import { wouldJoinWords } from "@/lib/courses/pitching/words";
import styles from "./ProgrammePitches.module.css";

/**
 * THE PITCHES FROM A PROGRAMME'S PITCHING WEEK, for its lead and for admins
 * (board in-teams, option C, the "Pitches from week 3" list).
 *
 * Read only, and drawn on the server: it holds no state and sends no script.
 * What the board draws beside it and this leaves out, because the feature
 * does not exist yet: the Teams list, "Became a team" and "Not taken
 * forward", "Move to…" and "Tell everyone their team". Making teams is the
 * next piece of work.
 *
 * Every address here is a page of this site built from stored ids.
 */

const programmePath = (view: Pick<StaffPitchesView, "roundId" | "programmeId">) =>
  `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;

/**
 * The Groups tab's views, with Pitches current: the times picture, the run's
 * allocation board and this list. Drawn for whoever may open the Groups tab.
 */
function GroupsViews({ view }: { view: StaffPitchesView }) {
  if (!view.run) return null;
  return (
    <nav className={styles.views} aria-label="Groups views">
      <Link href={`${programmePath(view)}/groups`} className={styles.view}>
        Times
      </Link>
      <Link
        href={`/admin/courses/${encodeURIComponent(view.run.courseId)}/runs/${encodeURIComponent(view.run.id)}/allocation`}
        className={styles.view}
      >
        People in groups
      </Link>
      <Link
        href={`${programmePath(view)}/groups/pitches`}
        className={`${styles.view} ${styles.viewCurrent}`}
        aria-current="page"
      >
        Pitches
      </Link>
    </nav>
  );
}

function runEditorPath(run: NonNullable<StaffPitchesView["run"]>): string {
  return `/admin/courses/${encodeURIComponent(run.courseId)}/runs/${encodeURIComponent(run.id)}`;
}

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
          <Link href={`${programmePath(view)}/setup`} className={styles.button}>
            Go to Settings
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className={`${styles.card} ${styles.blank}`}>
      <p className={styles.blankText}>
        No week of {name}’s course run is pitching week. Tick “This is pitching week” in that week’s
        details in the run editor, and its pitches show here.
      </p>
      {view.run && view.canOpenRunEditor && (
        <div className={styles.blankActions}>
          <Link href={runEditorPath(view.run)} className={styles.button}>
            Open the run editor
          </Link>
        </div>
      )}
    </section>
  );
}

export function ProgrammePitches({ view, groupsOpen }: { view: StaffPitchesView; groupsOpen: boolean }) {
  return (
    <div className={styles.page}>
      {groupsOpen && view.run && (
        <div className={styles.toolbar}>
          <GroupsViews view={view} />
        </div>
      )}
      {view.blank !== null || view.weekNumber === null ? (
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
              Nobody can pick yet: set how many pitches a person may pick in the run editor’s
              Pitching week section.
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
      href={`${programmePath({ roundId, programmeId })}/applications`}
      action="Go to applications"
    >
      The pitches from pitching week, and how many people would join each, are for the
      programme’s lead and admins, who make the teams from them.
    </Refusal>
  );
}
