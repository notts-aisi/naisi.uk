import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Chip from "@/components/ui/Chip";
import Notice from "@/components/ui/Notice";
import PageHead from "@/components/ui/PageHead";
import DoorCodeCard from "@/features/events/checkIn/DoorCodeCard";
import EventTabs from "@/features/events/checkIn/EventTabs";
import WhoCame from "@/features/events/checkIn/WhoCame";
import { clockWords, dayWords, isOver, timeRangeWords } from "@/features/events/manageWords";
import codeActions from "@/features/qr/codeActions.module.css";
import { QrCode } from "@/features/qr/QrCode";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { loadEventAtTheDoor } from "@/lib/events/checkInLoad";
import { cameWords, doorCounts, doorRows, namesOffOf, plusWalkInsWords } from "@/lib/events/checkInView";
import {
  addLaterUntil,
  checkInPhase,
  doorListSignups,
  doorWindow,
  eventTakesCheckIns,
  walkInEmailGoesAt,
} from "@/lib/events/checkIns";
import { findDoorCode } from "@/lib/events/doorCode";
import { publicLocationText } from "@/lib/events/location";
import { shortLinkAddress, shortLinkUrl } from "@/lib/qr/shortLinkCode";
import { surveyClosesFor } from "@/lib/surveys/events/records";
import styles from "@/features/events/checkIn/CheckInTab.module.css";
import eventStyles from "../../events.module.css";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * An event's Check-in tab (ev-manage): how many came and how, who came, the
 * door code and the door list.
 *
 * COUNTS FOR EVERYBODY IN THE EVENTS AREA, NAMES FOR THE PEOPLE WHO RUN
 * CHECK-IN. The four numbers are drawn here on the server from the sign-ups
 * and the check-ins and name nobody, so the whole committee sees them. Who
 * came, who did not, the door code and the door list are for `runsCheckIn`
 * (admins and SU-recognised committee), the people who already see who
 * signed up. Nothing with a name in it is sent to anybody else's browser.
 */
export default async function CheckInTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const db = getAdminDb();
  const loaded = db ? await loadEventAtTheDoor(db, id) : null;
  if (!db || !loaded) notFound();
  const { event, signups, checkIns } = loaded;

  const staff = runsCheckIn(viewer);
  const now = new Date();
  // People who came are added, and a walk-in's email kept, until the event's
  // survey closes when that is sooner than a week (src/lib/events/checkIns.ts).
  const surveyClosesAt = await surveyClosesFor(db, event.id);
  const title = event.title.trim() || "Untitled event";
  const takes = eventTakesCheckIns(event);
  const phase = takes ? checkInPhase(event, now, surveyClosesAt) : null;
  const rows = doorRows(doorListSignups(signups), checkIns);
  // A check-in whose names have come off has no row and still counts.
  const namesOff = namesOffOf(checkIns);
  const counts = doorCounts(rows, namesOff);
  const window = doorWindow(event);
  const until = addLaterUntil(event, surveyClosesAt);
  const emailGoesAt = walkInEmailGoesAt(event, surveyClosesAt);
  const untilSurvey = until !== null && until.getTime() !== addLaterUntil(event)?.getTime();
  const doorClosed = phase === "later" || phase === "closed";
  const doorCode = staff && takes ? await findDoorCode(db, event.id) : null;
  const where = publicLocationText(event);

  return (
    <div className={eventStyles.page}>
      <PageHead
        crumb={
          <Link href="/events/manage" className={eventStyles.crumbLink}>
            Manage events
          </Link>
        }
        title={title}
        badges={isOver(event, now) ? <Chip tone="neutral">Past</Chip> : undefined}
        meta={
          <>
            {event.startAt && <span>{dayWords(event.startAt)}</span>}
            {event.startAt && <span>{timeRangeWords(event.startAt, event.endAt)}</span>}
            {where && <span>{where}</span>}
            {event.capacity !== null && !event.noSignup && <span>{plural(event.capacity, "place", "places")}</span>}
          </>
        }
      />
      <EventTabs
        eventId={event.id}
        current="check-in"
        showSignups={staff}
        signups={event.rsvpCountConfirmed ?? undefined}
        showCheckIn
      />

      {!takes && (
        <Notice tone="neutral" role="note">
          Check-in is for a published event, and this one isn’t published.
        </Notice>
      )}
      {phase === "undated" && (
        <Notice tone="neutral" role="note">
          This event has no date yet, so it has no door list.
        </Notice>
      )}
      {phase === "before" && window && (
        <Notice tone="neutral" role="note">
          Check-in opens at {clockWords(window.opensAt)} on {dayWords(window.opensAt)}, an hour before the
          start.
        </Notice>
      )}

      {takes && phase !== "before" && phase !== "undated" && (
        <ul className={styles.stats} aria-label="Check-in in numbers">
          <li className={styles.stat}>
            <span className={styles.statNumber}>{counts.here}</span>
            <span className={styles.statLabel}>came</span>
            <span className={styles.statSub}>{cameWords(counts)}</span>
          </li>
          <li className={styles.stat}>
            <span className={styles.statNumber}>{counts.byQr}</span>
            <span className={styles.statLabel}>checked themselves in</span>
            <span className={styles.statSub}>With the QR code at the door</span>
          </li>
          <li className={styles.stat}>
            <span className={styles.statNumber}>{counts.byList}</span>
            <span className={styles.statLabel}>at the door list</span>
            {plusWalkInsWords(counts) && <span className={styles.statSub}>{plusWalkInsWords(counts)}</span>}
          </li>
          <li className={styles.stat}>
            <span className={styles.statNumber}>{counts.toCome}</span>
            <span className={styles.statLabel}>{doorClosed ? "didn’t come" : "still to come"}</span>
            {doorClosed && (
              <span className={styles.statSub}>
                Check-in never stops anyone signing up again, and nobody else sees who didn’t come.
              </span>
            )}
          </li>
        </ul>
      )}

      {!staff && takes && (
        <p className={styles.quiet}>
          Only NAISI’s admins and the committee members the Students’ Union recognises see who came, as they see
          who signed up.
        </p>
      )}

      {staff && takes && (
        <div className={styles.columns}>
          <div className={styles.main}>
            {phase !== "before" && phase !== "undated" && (
              <WhoCame
                eventId={event.id}
                initialRows={rows}
                namesOff={namesOff}
                canAdd={phase === "door" || phase === "later"}
                addUntil={until ? dayWords(until) : null}
                doorClosed={doorClosed}
                emailsKept={phase !== "closed"}
                startsAt={event.startAt ? event.startAt.toISOString() : null}
                eventLine={event.startAt ? `${title} · ${dayWords(event.startAt)}` : title}
                emailGoesOn={emailGoesAt ? dayWords(emailGoesAt) : ""}
                untilSurvey={untilSurvey}
              />
            )}
          </div>
          <aside className={styles.side} aria-label="At the door">
            <DoorCodeCard
              eventId={event.id}
              code={
                doorCode
                  ? { slug: doorCode.slug, address: shortLinkAddress(doorCode.slug), active: doorCode.active }
                  : null
              }
              qr={
                doorCode ? (
                  <QrCode
                    className={styles.qr}
                    text={shortLinkUrl(doorCode.slug)}
                    label={`QR code for ${shortLinkAddress(doorCode.slug)}`}
                  />
                ) : null
              }
            />
            {window && (
              <section className={styles.card} aria-labelledby="door-list-heading">
                <h2 id="door-list-heading" className={styles.cardHeading}>
                  Door list
                </h2>
                <p className={styles.cardText}>
                  Opens an hour before and closes an hour after: {clockWords(window.opensAt)} to{" "}
                  {clockWords(window.closesAt)}. After that, add people from this page.
                </p>
                <div className={styles.cardActions}>
                  <Link href={`/events/manage/${event.id}/door`} className={codeActions.action}>
                    See the door list
                  </Link>
                </div>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
