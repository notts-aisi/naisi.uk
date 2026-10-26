import { safeSourceUrl } from "@/lib/courses/weekBlocks/prose";
import { routeStanding, type CourseRoutes, type RouteRecord } from "@/lib/courses/routes/model";
import { ROLLING, SUITS_LABEL, applyByWords, checkedOnWords, closedOnWords } from "@/lib/courses/routes/words";
import Prose, { Runs } from "./Prose";
import styles from "./blockWeek.module.css";
import own from "./routes.module.css";

/**
 * A COURSE'S ROUTES AND DEADLINES ON A WEEK THAT ASKS FOR THEM (the guide's
 * "Where to go next" in Technical AI Safety's week 6): drawn from the
 * course's record (`CourseDoc.routes`) in place of what the guide wrote under
 * that heading. First the day they were checked, then each group under its
 * heading, each route with its name as a link, what it is, who it suits,
 * where its round stands today and its next round in words, then the words
 * after the last group (the guide's line on funding).
 *
 * A ROUTE PAST ITS DEADLINE SAYS SO ("Closed on Sun 1 Nov"), against the day
 * it is in London (`todayKey`), never a date in code; a route still to close
 * says when ("Apply by Sun 1 Nov"); a rolling one says so.
 *
 * No board draws this list; its words are listed in the build notes for the
 * boards' designers to confirm. Text is data, drawn as text and links.
 */
export default function RoutesList({ routes, todayKey }: { routes: CourseRoutes; todayKey: string }) {
  const [first, ...rest] = routes.intro;
  return (
    <div className={own.routes}>
      <p className={own.checked}>
        {checkedOnWords(routes.checkedOn)}
        {first?.type === "p" && (
          <>
            {" "}
            <Runs runs={first.runs} linkClassName={styles.inlineLink} />
          </>
        )}
      </p>
      <Prose
        prose={first?.type === "p" ? rest : routes.intro}
        className={styles.body}
        listClassName={styles.list}
        linkClassName={styles.inlineLink}
        tableClassName={styles.table}
        codeClassName={styles.code}
      />
      {routes.groups.map((group, index) => (
        <div key={index} className={own.group}>
          {group.heading && <h3 className={own.heading}>{group.heading}</h3>}
          <ul className={own.list} role="list">
            {group.routes.map((route, r) => (
              <RouteItem key={r} route={route} todayKey={todayKey} />
            ))}
          </ul>
        </div>
      ))}
      <Prose
        prose={routes.after}
        className={styles.body}
        listClassName={styles.list}
        linkClassName={styles.inlineLink}
        tableClassName={styles.table}
        codeClassName={styles.code}
      />
    </div>
  );
}

function RouteItem({ route, todayKey }: { route: RouteRecord; todayKey: string }) {
  const href = safeSourceUrl(route.url);
  const standing = routeStanding(route, todayKey);
  const chip =
    standing.kind === "rolling"
      ? { words: ROLLING, className: own.chip }
      : standing.kind === "open"
        ? { words: applyByWords(standing.deadline, todayKey), className: own.chip }
        : standing.kind === "closed"
          ? { words: closedOnWords(standing.deadline, todayKey), className: own.chipClosed }
          : null;
  return (
    <li className={standing.kind === "closed" ? `${own.route} ${own.closed}` : own.route}>
      <p className={own.name}>
        {href ? (
          <a href={href} className={own.nameLink} target="_blank" rel="noopener noreferrer">
            {route.name}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </a>
        ) : (
          route.name
        )}
      </p>
      {route.what.length > 0 && (
        <p className={own.what}>
          <Runs runs={route.what} linkClassName={styles.inlineLink} />
        </p>
      )}
      {route.suits.length > 0 && (
        <p className={own.suits}>
          <span className={own.label}>{SUITS_LABEL}</span> <Runs runs={route.suits} linkClassName={styles.inlineLink} />
        </p>
      )}
      {(chip || route.nextRound.length > 0) && (
        <p className={own.round}>
          {chip && <span className={chip.className}>{chip.words}</span>}
          {route.nextRound.length > 0 && (
            <span className={own.next}>
              <Runs runs={route.nextRound} linkClassName={styles.inlineLink} />
            </span>
          )}
        </p>
      )}
    </li>
  );
}
