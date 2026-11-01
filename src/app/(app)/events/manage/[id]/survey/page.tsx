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
import SurveyAfterPanel from "@/features/surveys/events/SurveyAfterPanel";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { publicLocationText } from "@/lib/events/location";
import { signupAccessFor } from "@/lib/events/signupAccess";
import { runsSurveyAfter } from "@/lib/events/surveyAfterAccess";
import { eventSurveysGoByThemselves } from "@/lib/scheduler/eventSurveysSwitch";
import { resultsView } from "@/lib/surveys/adminView";
import { eventResultsHead, resultsWhoFor } from "@/lib/surveys/events/adminView";
import { surveyAfterPanel } from "@/lib/surveys/events/afterView";
import { eventSurveyOf, missedSurveyOf } from "@/lib/surveys/events/records";
import { surveyAfterLines } from "@/lib/surveys/events/tab";
import { canRunSurveys } from "@/lib/surveys/repo";
import styles from "@/features/events/checkIn/CheckInTab.module.css";
import eventStyles from "../../events.module.css";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * An event's Survey after tab, on the event's own management pages.
 *
 * FOR EVERYBODY IN THE EVENTS AREA, what is set to happen, that the survey
 * went, when and to how many, and who to ask for its results: an event's
 * organiser does not see its survey's results, so nothing here is a
 * result, a count of answers or a name.
 *
 * FOR ITS ORGANISERS (the event's author and collaborators, and admins:
 * `runsSurveyAfter`), when its event set the survey up: "Send it now" with
 * the number it emails, "Send a test to me", and its setting, changeable
 * until it opens (its questions) or goes (who gets it and when)
 * (`surveyAfterPanel`).
 *
 * FOR ADMINS (`canRunSurveys`), the results themselves, as the survey's own
 * Results tab draws them, with n beside every number, the logged download,
 * and the way to its pages; or, before it has one, the way to make it.
 *
 * Its QR code is on the Check-in tab, for whoever runs the door at the end
 * of the event.
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
  const missed = survey ? await missedSurveyOf(db, survey) : null;
  // Whether anything goes by itself here: read on the server, because the
  // switch is closed to every browser. A read that fails says it doesn't.
  let jobOn = false;
  try {
    jobOn = await eventSurveysGoByThemselves(db);
  } catch (err) {
    console.error("[survey after tab] could not read the event-surveys switch", err);
  }
  const lines = await surveyAfterLines(db, survey, now, { event, missed, jobOn });
  const panel = runsSurveyAfter(event, viewer) ? await surveyAfterPanel(db, { event, survey, now }) : null;
  const title = event.title.trim() || "Untitled event";
  const where = publicLocationText(event);

  const results =
    admin && survey && survey.firstSentAt
      ? await Promise.all([eventResultsHead(db, survey), resultsView(db, survey, false, { commentsInOrder: "words" }), resultsWhoFor(db, survey)])
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
        showSignups={signupAccessFor(viewer, event).requests}
        signups={event.rsvpCountConfirmed ?? undefined}
        waiting={event.rsvpCountPending ?? undefined}
        showCheckIn={event.status === "published"}
      />

      <section className={styles.card} aria-labelledby="survey-after-heading">
        <h2 id="survey-after-heading" className={styles.cardHeading}>
          The survey after
        </h2>
        <p className={styles.cardText}>{lines.went}</p>
        {lines.more.map((line) => (
          <p key={line} className={styles.cardText}>
            {line}
          </p>
        ))}
        <p className={styles.cardText}>{lines.results}</p>
        {admin && (survey || !panel) && (
          <div className={styles.cardActions}>
            {survey ? (
              <>
                <Link href={`/admin/surveys/${encodeURIComponent(survey.id)}/send`} className={codeActions.action}>
                  Open the survey
                </Link>
                {/* The one question for people who weren't checked in is a
                    survey of its own, with its own results under Surveys. */}
                {missed && (
                  <Link href={`/admin/surveys/${encodeURIComponent(missed.id)}/send`} className={codeActions.action}>
                    Open the question about not coming
                  </Link>
                )}
              </>
            ) : (
              // An event whose Survey after step set one is set up from its
              // setting, below; one with none (made before the step) is made
              // from Surveys, as it always was.
              event.status === "published" && (
                <Link href={`/admin/surveys/new?event=${encodeURIComponent(event.id)}#after-a-social`} className={codeActions.action}>
                  Make a survey
                </Link>
              )
            )}
          </div>
        )}
      </section>

      {panel && (
        <SurveyAfterPanel
          eventId={event.id}
          event={{
            title,
            startAt: event.startAt ? event.startAt.toISOString() : null,
            endAt: event.endAt ? event.endAt.toISOString() : null,
            noSignup: event.noSignup,
          }}
          panel={panel}
          jobOn={jobOn}
        />
      )}

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
