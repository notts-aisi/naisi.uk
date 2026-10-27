import type { RatingsView } from "@/lib/ratings/view";
import { RATINGS_WORDS } from "@/lib/ratings/words";
import RatingCard from "./RatingCard";
import styles from "./ratings.module.css";

/**
 * A run's ratings as one viewer may see them (`loadRatingsView`): before the
 * run's last session, one line saying when they open; after it, each group's
 * fellows, each with this viewer's own form where they may rate them, and,
 * for the programme's lead and admins, what everybody else said.
 *
 * No directive: it draws what the server built for this viewer, and each
 * form is handed only that person's name, sessions line and this viewer's
 * own answers.
 */
export default function RatingsBoard({ view, showGroupNames }: { view: RatingsView; showGroupNames: boolean }) {
  if (view.state === "not-yet") return <p className={styles.line}>{view.line}</p>;
  const people = view.groups.reduce((sum, group) => sum + group.people.length, 0);
  if (people === 0) return <p className={styles.line}>{RATINGS_WORDS.nobody}</p>;
  return (
    <div className={styles.board}>
      {view.groups.map((group) =>
        group.people.length === 0 ? null : (
          <section key={group.id} className={styles.group} aria-label={group.name}>
            {showGroupNames && <h2 className={styles.groupName}>{group.name}</h2>}
            {group.people.map((person) => (
              <div key={person.uid} className={styles.person}>
                {person.rate ? (
                  <RatingCard
                    groupId={group.id}
                    uid={person.uid}
                    name={person.name}
                    came={person.came}
                    team={person.team}
                    facilitator={person.facilitator}
                    questions={view.questions}
                    answers={person.rate.answers}
                  />
                ) : (
                  <div className={styles.card}>
                    <div className={styles.cardHead}>
                      <h3 className={styles.name}>{person.name}</h3>
                      {person.facilitator && <span className={styles.chip}>{RATINGS_WORDS.facilitator}</span>}
                    </div>
                    <p className={styles.came}>{person.came}</p>
                    {person.team && <p className={styles.came}>{person.team}</p>}
                    {person.cannot && <p className={styles.cannot}>{person.cannot}</p>}
                  </div>
                )}
                {view.reader && (
                  <div className={styles.others}>
                    <p className={styles.othersHead}>{RATINGS_WORDS.others}</p>
                    {person.others.length === 0 ? (
                      <p className={styles.otherLine}>{RATINGS_WORDS.noOthers}</p>
                    ) : (
                      <ul className={styles.otherList}>
                        {person.others.map((other) => (
                          <li key={`${other.rater}:${other.line}`} className={styles.otherLine}>
                            <strong>{other.rater}:</strong> {other.line}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        ),
      )}
    </div>
  );
}
