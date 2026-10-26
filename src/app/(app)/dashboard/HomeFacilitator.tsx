"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import Skeleton from "@/components/ui/Skeleton";
import type { MyRunEntry } from "@/app/api/courses/me/route";
import type { OverviewGroup } from "@/app/api/courses/runs/[runId]/overview/route";
import { PeopleIcon } from "@/features/courses/facilitator/icons";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import { useFacilitatorSummary } from "@/features/courses/facilitator/useFacilitatorSummary";
import { ticketFacts } from "@/features/courses/sessionChange/cardFacts";
import { useRunOverview } from "@/features/courses/useRunOverview";
import weekly from "@/features/courses/weekly/weekly.module.css";
import { NAMES_WHEN_GROUPS_GO_OUT } from "@/features/courses/groupNamesWords";
import {
  NOBODY_IN_GROUP,
  NO_MORE_SESSIONS,
  OPEN_YOUR_GROUP,
  REVIEW,
  SAY_HELLO,
  TAKE_THE_REGISTER,
  THIS_WEEK,
  WHOS_COMING,
  comingChipWords,
  expectedWords,
  firstSessionEyebrow,
  homeNextEmailWords,
  homeRoomLine,
  homeTicketHeading,
  leftLine,
  sayHelloLine,
  takeRegisterLine,
  toReviewWords,
  whosComingSentence,
} from "@/lib/courses/facilitatorPageWords";
import { sessionEyebrow, weekTitleWords } from "@/lib/courses/memberPageWords";
import { writeToGroupLine, writeToGroupWords } from "@/lib/courses/updates/words";
import { addDaysToKey, londonDateKey } from "@/lib/courses/weekPlan";
import { ArrowRight } from "./icons";
import { tilePartsOfDay } from "./homeWords";
import styles from "./home.module.css";

/**
 * HOME FOR A FACILITATOR (board wk-fac-home-phone): their group's next
 * session as a ticket, with how many are expected; "Take the register" and
 * where it leads; this week's theme, the exercises waiting for a review and,
 * while next week's email is on its schedule, when it goes; somebody who left
 * the group recently; and the events coming up.
 *
 * Read through two answers: the run's overview for the group and its next
 * session, and the group's summary route for what only its facilitators are
 * told (how many are expected, what waits for a review, next week's email,
 * who left). The register is on its own page beside the group's, and "Take
 * the register" goes there.
 *
 * NOT DRAWN, though the board draws them: who can't make it tonight (that
 * feature does not exist yet) and the facilitator guide (no record holds one).
 *
 * BEFORE THE GROUP'S FIRST SESSION (board st-fac-before-phone), on every day
 * before the day of the first session: the first session as a ticket with
 * "Open your group" in it; who's coming, each person by first name with
 * "coming" or "hasn't said", once Publish has told them their group (Q14:
 * the summary hands it to the group's facilitators and to nobody else, and
 * nothing else from an application); and Say hello, the way to write to the
 * group, while anybody in it has been told. From the day of the first
 * session it is the weekly Home above, with "Take the register". The board's
 * "Week 1 guide" is not drawn: no record holds a guide for facilitators only,
 * and the site's Guide is public.
 *
 * SOMEBODY WITH TWO GROUPS sees the one that meets next, and a line saying
 * there are more with the way to all of them.
 */

/** A facilitator's groups on this run, the one that meets soonest first. */
function bySoonest(groups: OverviewGroup[]): OverviewGroup[] {
  const key = (group: OverviewGroup) => {
    const next = group.calendar.nextSession;
    return next ? `${next.dateKey} ${next.startTimeLocal}` : "9999";
  };
  return [...groups].sort((a, b) => key(a).localeCompare(key(b)));
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={facilitator.comingTick}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

type Slots = {
  given: string;
  /** The invitation to install the site as an app, drawn under the greeting. */
  invite: ReactNode;
  entry: MyRunEntry;
  /** Server-rendered: the next events, as two small cards. */
  comingUp: ReactNode;
  /** The cards every form of Home ends with. */
  more: ReactNode;
};

export default function HomeFacilitator({ given, invite, entry, comingUp, more }: Slots) {
  const { data, error } = useRunOverview(entry.runId);
  const groups = data ? bySoonest(data.groups) : [];
  const group = groups[0] ?? null;
  const summary = useFacilitatorSummary(group?.id ?? "");
  const facts = group ? ticketFacts(group) : null;

  const runHref = `/learn/${encodeURIComponent(entry.runId)}`;
  const groupHref = group ? `${runHref}/group/${encodeURIComponent(group.id)}` : runHref;
  const headLine = [group?.name ?? entry.groupName, entry.courseTitle].filter(Boolean).join(" · ");
  const todayKey = londonDateKey(new Date());
  const isToday = facts !== null && facts.dateKey === todayKey;
  const tile = facts ? tilePartsOfDay(facts.dateKey) : null;
  const known = summary.data;
  const roomLine = facts ? homeRoomLine(facts.room ?? "", known?.coFacilitators ?? []) : "";
  const weekDoc = facts ? (data?.weeks.find((week) => week.weekNumber === facts.weekNumber) ?? null) : null;
  // Before the day of the group's first session, Home is st-fac-before-phone's.
  const firstDay = group?.calendar.firstSessionDate ?? "";
  const beforeFirst = Boolean(group && facts && firstDay && todayKey < firstDay);
  const whosComing = known?.whosComing ?? null;

  return (
    <>
      <PageHead
        title={given ? `Hi ${given}.` : "Hi."}
        description={<span className={styles.headLine}>{headLine}</span>}
      />
      {invite}

      {!data && !error && <Skeleton height="14rem" />}

      {error && (
        <section className={styles.card}>
          <p className={styles.quiet}>We couldn’t load your group just now.</p>
          <div>
            <Link href={runHref} className={styles.textLink}>
              Open {entry.courseTitle}
              <ArrowRight />
            </Link>
          </div>
        </section>
      )}

      {data && !(group && facts) && (
        <section className={styles.card}>
          <p className={styles.quiet}>
            {group ? NO_MORE_SESSIONS : "You don’t have a group yet."}
          </p>
          <div>
            <Link href={groupHref} className={styles.textLink}>
              Open {entry.courseTitle}
              <ArrowRight />
            </Link>
          </div>
        </section>
      )}

      <div className={styles.columns}>
        <div className={styles.stack}>
          {data && group && facts && beforeFirst && (
            <div className={facilitator.homeStack}>
              <section className={`${weekly.ticket} ${weekly.ticketHome}`} aria-label="Your first session">
                <div className={weekly.ticketRow}>
                  {tile && (
                    <time className={weekly.stub} dateTime={facts.dateKey}>
                      <span className={weekly.stubWeekday}>{tile.weekday}</span>
                      <span className={weekly.stubDay}>{tile.day}</span>
                      <span className={weekly.stubMonth}>{tile.month}</span>
                    </time>
                  )}
                  <div className={weekly.ticketMain}>
                    <div className={weekly.ticketBody}>
                      <p className={weekly.ticketEyebrow}>
                        {firstSessionEyebrow(facts.dateKey === addDaysToKey(todayKey, 1), facts.weekNumbers)}
                      </p>
                      <h2 className={`${weekly.ticketWhen} ${facilitator.homeTicketWhen}`}>
                        {homeTicketHeading(group.name, facts.startTimeLocal)}
                      </h2>
                      {roomLine && <p className={facilitator.ticketRoomMuted}>{roomLine}</p>}
                      {facts.mode === "virtual" && <span className={weekly.liveChip}>Online this week</span>}
                      <Link href={groupHref} className={`${styles.primary} ${facilitator.beforeOpen}`}>
                        {OPEN_YOUR_GROUP}
                      </Link>
                    </div>
                  </div>
                </div>
              </section>

              {/* Who's coming: once Publish has told them, each person by
                  first name, "coming" or "hasn't said", and nothing else. */}
              {known && (
                <section className={facilitator.beforeCard} aria-labelledby="whos-coming">
                  <h2 id="whos-coming" className={facilitator.beforeTitle}>
                    {WHOS_COMING}
                  </h2>
                  {whosComing && whosComing.length > 0 ? (
                    <>
                      <p className={facilitator.beforeLine}>{whosComingSentence(whosComing)}</p>
                      <ul aria-label={WHOS_COMING} className={facilitator.comingList}>
                        {whosComing.map((person, at) => (
                          <li key={at} className={person.coming ? facilitator.comingChip : facilitator.notSaidChip}>
                            <span className={facilitator.comingMark}>
                              {person.coming ? <TickIcon /> : <span className={facilitator.notSaidDot} aria-hidden="true" />}
                            </span>
                            {person.firstName}
                            <span className={styles.srOnly}>{comingChipWords(person.coming)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className={facilitator.beforeLine}>
                      {known.notYetTold ? NAMES_WHEN_GROUPS_GO_OUT : NOBODY_IN_GROUP}
                    </p>
                  )}
                </section>
              )}

              {/* Say hello: an update to the group, while anybody in it has
                  been told their group, with how many it emails. */}
              {known?.write && known.write.people > 0 && (
                <section className={facilitator.beforeCard} aria-labelledby="say-hello">
                  <h2 id="say-hello" className={facilitator.beforeTitle}>
                    {SAY_HELLO}
                  </h2>
                  <p className={facilitator.beforeLine}>
                    {sayHelloLine(firstDay, firstDay <= addDaysToKey(todayKey, 6))}
                  </p>
                  <Link href={`${groupHref}/update`} className={`${styles.secondary} ${facilitator.sayHelloButton}`}>
                    {writeToGroupWords(group.name, known.write.people)}
                  </Link>
                  <p className={facilitator.sayHelloLine}>
                    {writeToGroupLine(known.write.emails, known.write.notYetTold)}
                  </p>
                </section>
              )}
            </div>
          )}

          {data && group && facts && !beforeFirst && (
            <div className={facilitator.homeStack}>
              {/* The stub and the body side by side, in the ticket's row: the
                  ticket itself is a column since Add to calendar (#116). */}
              <section className={`${weekly.ticket} ${weekly.ticketHome}`} aria-label="Your next session">
                <div className={weekly.ticketRow}>
                  {tile && (
                    <time className={weekly.stub} dateTime={facts.dateKey}>
                      <span className={weekly.stubWeekday}>{tile.weekday}</span>
                      <span className={weekly.stubDay}>{tile.day}</span>
                      <span className={weekly.stubMonth}>{tile.month}</span>
                    </time>
                  )}
                  <div className={weekly.ticketMain}>
                    <div className={weekly.ticketBody}>
                      <p className={weekly.ticketEyebrow}>
                        {sessionEyebrow({
                          isToday,
                          isFirst: facts.dateKey === group.calendar.firstSessionDate,
                          startTimeLocal: facts.startTimeLocal,
                          weekNumbers: facts.weekNumbers,
                          home: true,
                        })}
                      </p>
                      <h2 className={`${weekly.ticketWhen} ${facilitator.homeTicketWhen}`}>
                        {homeTicketHeading(group.name, facts.startTimeLocal)}
                      </h2>
                      {roomLine && <p className={facilitator.ticketRoomMuted}>{roomLine}</p>}
                      {facts.mode === "virtual" && <span className={weekly.liveChip}>Online this week</span>}
                      {known && (
                        <div className={facilitator.homeTicketFoot}>
                          <p className={facilitator.homeTicketRow}>
                            <PeopleIcon />
                            {/* Before Publish has told anybody their group, when
                                their names come; a group nobody is in, says so. */}
                            <span>
                              {known.expected > 0
                                ? expectedWords(known.expected)
                                : known.notYetTold
                                  ? NAMES_WHEN_GROUPS_GO_OUT
                                  : NOBODY_IN_GROUP}
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <div className={facilitator.registerCta}>
                <Link
                  href={`${groupHref}/register`}
                  className={`${styles.primaryLarge} ${facilitator.registerCtaButton}`}
                >
                  {TAKE_THE_REGISTER}
                </Link>
                <p className={facilitator.registerCtaLine}>{takeRegisterLine(isToday, facts.startTimeLocal)}</p>
              </div>
            </div>
          )}

          {data && group && facts && !beforeFirst && facts.weekNumber >= 1 && (
            <section className={facilitator.weekCard} aria-label={THIS_WEEK}>
              <p className={facilitator.weekEyebrow}>{THIS_WEEK}</p>
              <p className={facilitator.weekTitle}>{weekTitleWords(facts.weekNumber, weekDoc?.title ?? "")}</p>
              {known && (
                <div className={facilitator.weekRow}>
                  <p className={facilitator.weekRowText}>{toReviewWords(known.toReview)}</p>
                  <Link href={`${groupHref}/review`} className={styles.textLink}>
                    {REVIEW}
                    <ArrowRight />
                  </Link>
                </div>
              )}
              {known?.nextEmail && (
                <p className={facilitator.weekEmail}>
                  <MailIcon />
                  <span>{homeNextEmailWords(group.name, known.nextEmail)}</span>
                </p>
              )}
            </section>
          )}

          {known?.leftRecently.map((person) => (
            <div key={person.uid} className={facilitator.leftNotice} role="status">
              <InfoIcon />
              <p className={facilitator.leftNoticeText}>
                {leftLine({ name: person.name, firstName: person.firstName, leftDateKey: person.leftDateKey, from: person.from })}
              </p>
            </div>
          ))}

          {groups.length > 1 && (
            <p className={styles.quiet}>
              You facilitate {groups.length} groups. This is the one that meets next.{" "}
              <Link href={runHref} className={styles.inlineLink}>
                See them all
              </Link>
            </p>
          )}

          {comingUp}
        </div>
        <div className={styles.stack}>{more}</div>
      </div>
    </>
  );
}
