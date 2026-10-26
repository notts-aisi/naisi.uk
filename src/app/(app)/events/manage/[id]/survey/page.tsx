import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Chip from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import EventTabs from "@/features/events/checkIn/EventTabs";
import { dayWords, isOver, timeRangeWords } from "@/features/events/manageWords";
import EventResultsHead, { EventResultsLayout } from "@/features/surveys/admin/EventResultsHead";
import ExportButton from "@/features/surveys/admin/ExportButton";
import codeActions from "@/features/qr/codeActions.module.css";
import ResultsTab from "@/features/surveys/admin/ResultsTab";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { publicLocationText } from "@/lib/events/location";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { resultsView } from "@/lib/surveys/adminView";
import { eventResultsHead, resultsWhoFor } from "@/lib/surveys/events/adminView";
import { eventSurveyOf } from "@/lib/surveys/events/records";
import { surveyAfterLines } from "@/lib/surveys/events/tab";
import { canRunSurveys } from "@/lib/surveys/repo";
import styles from "@/features/events/checkIn/CheckInTab.module.css";
import eventStyles from "../../events.module.css";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * An event's Survey after tab (ev-manage).
 *
 * FOR EVERYBODY IN THE EVENTS AREA, that the survey went and when, and who to
 * ask for its results: an event's organiser does not see its survey's
 * results (Q42), so nothing here is a result, a count of answers or a name.
 *
 * FOR ADMINS (`canRunSurveys`), the results themselves, as the survey's own
 * Results tab draws them, with n beside every number, the logged download,
 * and the way to its pages; or, before it has one, the way to make it.
 */
export default async function SurveyAfterTabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const db = getAdminDb();
  const snap = db && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? await db.collection("events").doc(id).get() : null;
  if (!db || !snap?.exists) notFound();
  const event = normalizeEvent(snap.id, snap.data() ?? {});
  const now = new Date();
  const admin = canRunSurveys(viewer);
  const survey = await eventSurveyOf(db, event.id);
  const lines = await surveyAfterLines(db, survey, now);
  const title = event.title.trim() || "Untitled event";
  const where = publicLocationText(event);

  const results =
    admin && survey && survey.firstSentAt
      ? await Promise.all([eventResultsHead(db, survey), resultsView(db, survey, false), resultsWhoFor(db, survey)])
      : null;

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
        current="survey"
        showSignups={runsCheckIn(viewer)}
        signups={event.rsvpCountConfirmed ?? undefined}
        showCheckIn={event.status === "published"}
      />

      <section className={styles.card} aria-labelledby="survey-after-heading">
        <h2 id="survey-after-heading" className={styles.cardHeading}>
          The survey after
        </h2>
        <p className={styles.cardText}>{lines.went}</p>
        <p className={styles.cardText}>{lines.results}</p>
        {admin && (
          <div className={styles.cardActions}>
            {survey ? (
              <Link href={`/admin/surveys/${encodeURIComponent(survey.id)}/send`} className={codeActions.action}>
                Open the survey
              </Link>
            ) : (
              event.status === "published" && (
                <Link href={`/admin/surveys/new?event=${encodeURIComponent(event.id)}#after-a-social`} className={codeActions.action}>
                  Make a survey
                </Link>
              )
            )}
          </div>
        )}
      </section>

      {results && survey && (
        <>
          <EventResultsHead head={results[0]} />
          <EventResultsLayout who={results[2]} download={results[1].answers > 0 ? <ExportButton surveyId={survey.id} /> : null}>
            <ResultsTab view={results[1]} surveyId={survey.id} beforeFirstSession={false} ofAnswers />
          </EventResultsLayout>
        </>
      )}
    </div>
  );
}
