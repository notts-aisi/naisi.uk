"use client";

import Link from "next/link";
import type { MyRunEntry } from "@/app/api/courses/me/route";
import Skeleton from "@/components/ui/Skeleton";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import { useFacilitatorSummary } from "@/features/courses/facilitator/useFacilitatorSummary";
import { useFacilitatorGuide } from "@/features/courses/facilitatorGuide/useFacilitatorGuide";
import { ticketFacts } from "@/features/courses/sessionChange/cardFacts";
import { NO_GUIDE_LINKS, guideLinksView } from "@/lib/courses/facilitatorGuide/links";
import {
  NO_MORE_SESSIONS,
  TAKE_THE_REGISTER,
  openGroupWords,
  ticketHeading,
} from "@/lib/courses/facilitatorPageWords";
import {
  MY_PROGRAMMES_PATH,
  NOT_ALL_LOADED,
  SEE_THEM_ALL,
  adminCardEyebrow,
  facilitateGroupsWords,
  roomAndExpectedWords,
} from "@/lib/courses/homeGroups";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { ArrowRight } from "./icons";
import { useFacilitatedRuns } from "./useFacilitatedRuns";
import styles from "./home.module.css";

/**
 * THE ADMIN'S HOME, FOR AN ADMIN WHO FACILITATES: one card for their own
 * group, the one that meets next of every live run they facilitate on. When
 * it meets and where, how many are expected, "Take the register" from the
 * day of the group's first session, "Open Group C", and the course's
 * facilitator guide by the session card's one rule
 * (`src/lib/courses/facilitatorGuide/links.ts`). After the group's last
 * session it says so, with the group's page and the guide.
 *
 * WHO GETS IT is decided by the admin's Home from the list of runs it
 * already reads (`useMyRuns`): a live run whose row names a live group they
 * facilitate (`facilitates`), so an admin who facilitates nothing, or whose
 * only group was archived, asks nothing new and is drawn nothing new.
 * Mounted, it reads what the facilitator's Home reads: each run's overview
 * (each within its limit, `useRunOverviews`), the group's summary and the
 * course's guide.
 *
 * While the runs answer, a placeholder holds the card's place, so To do does
 * not jump; then nothing at all when they could not be read or name no group
 * of theirs, and with a run that did not answer "See them all" stays, to My
 * programmes.
 */
export default function HomeAdminFacilitating({ runs }: { runs: readonly MyRunEntry[] }) {
  const [first, ...others] = runs;
  // Every run within its limit, so the card's place is held for a few seconds at most.
  const { entry, data, ordered, settled, missing } = useFacilitatedRuns(first, others, { limited: true });
  const group = ordered[0]?.group ?? null;
  // How many groups, from the list that names them, so a run that did not answer still counts.
  const groupCount = runs.reduce((sum, run) => sum + Math.max(run.facilitates?.length ?? 0, ordered.filter((item) => item.run.entry.runId === run.runId).length), 0);
  const summary = useFacilitatorSummary(group?.id ?? "");
  const courseId = data?.run?.courseId ?? "";
  const guideRead = useFacilitatorGuide(group ? courseId : "");

  // The card's place is held while the runs answer, so To do does not jump under the reader's finger.
  if (!settled) return <Skeleton height="12rem" />;
  if (!data || !group) return null;

  const facts = ticketFacts(group);
  const groupHref = `/learn/${encodeURIComponent(entry.runId)}/group/${encodeURIComponent(group.id)}`;
  const todayKey = londonDateKey(new Date());
  const firstDay = group.calendar.firstSessionDate;
  // "Take the register" from the day of the first session, as the facilitator's Home has it.
  const registerOpen = facts !== null && !(firstDay && todayKey < firstDay);
  const known = summary.data;
  const guide = guideRead
    ? guideLinksView({
        read: guideRead,
        courseId,
        weekNumber: facts && facts.weekNumber >= 1 ? facts.weekNumber : null,
        knownReader: true,
        leadFirstName: data.programme?.leadFirstName ?? null,
      })
    : NO_GUIDE_LINKS;
  const under = facts ? roomAndExpectedWords(facts.room, known ? known.expected : null) : "";

  return (
    <section className={styles.card} aria-labelledby="home-facilitates">
      <div className={styles.facilitates}>
        <p id="home-facilitates" className={styles.facilitatesEyebrow}>
          {adminCardEyebrow(group.name)}
        </p>
        {facts ? (
          <>
            <p className={styles.facilitatesWhen}>{ticketHeading(facts.dateKey, facts.startTimeLocal)}</p>
            {under && <p className={styles.quiet}>{under}</p>}
          </>
        ) : (
          <p className={styles.quiet}>{NO_MORE_SESSIONS}</p>
        )}
      </div>
      {registerOpen && (
        <Link href={`${groupHref}/register`} className={styles.primaryLarge}>
          {TAKE_THE_REGISTER}
        </Link>
      )}
      <div>
        <div className={facilitator.groupLinkWraps}>
          <Link href={groupHref} className={styles.textLink}>
            {openGroupWords(group.name)}
            <ArrowRight />
          </Link>
        </div>
        {guide.week && (
          <div>
            <Link href={guide.week.href} className={styles.textLink}>
              {guide.week.label}
              <ArrowRight />
            </Link>
          </div>
        )}
        {guide.sentence && <p className={styles.small}>{guide.sentence}</p>}
        {guide.standing && (
          <div>
            <Link href={guide.standing.href} className={styles.textLink}>
              {guide.standing.label}
              <ArrowRight />
            </Link>
          </div>
        )}
      </div>
      {(groupCount > 1 || missing.length > 0) && (
        <div>
          {groupCount > 1 && <p className={styles.quiet}>{facilitateGroupsWords(groupCount, missing.length === 0)}</p>}
          {missing.length > 0 && <p className={styles.quiet}>{NOT_ALL_LOADED}</p>}
          <Link href={MY_PROGRAMMES_PATH} className={styles.textLink}>
            {SEE_THEM_ALL}
            <ArrowRight />
          </Link>
        </div>
      )}
    </section>
  );
}
