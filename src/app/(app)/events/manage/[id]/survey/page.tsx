import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Chip from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import EventTabs from "@/features/events/checkIn/EventTabs";
import { dayWords, isOver, timeRangeWords } from "@/features/events/manageWords";
import EventResultsHead, { EventResultsLayout } from "@/features/surveys/admin/EventResultsHead";
import ExportButton from "@/features/surveys/admin/ExportButton";
import codeActions from "@/features/qr/codeActions.module.css";
import { QrCode } from "@/features/qr/QrCode";
import ResultsTab from "@/features/surveys/admin/ResultsTab";
import SurveyCodeAtEvent from "@/features/surveys/events/SurveyCodeAtEvent";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { publicLocationText } from "@/lib/events/location";
import { signupAccessFor } from "@/lib/events/signupAccess";
import { shortLinkAddress, shortLinkUrl } from "@/lib/qr/shortLinkCode";
import { resultsView } from "@/lib/surveys/adminView";
import { eventResultsHead, resultsWhoFor } from "@/lib/surveys/events/adminView";
import { findSurveyCode, surveyCodeAtEvent } from "@/lib/surveys/events/code";
import { eventSurveyOf } from "@/lib/surveys/events/records";
import { surveyAfterLines } from "@/lib/surveys/events/tab";
import { CODE_AT_EVENT_WORDS } from "@/lib/surveys/events/words";
import { canRunSurveys } from "@/lib/surveys/repo";
import styles from "@/features/events/checkIn/CheckInTab.module.css";
import eventStyles from "../../events.module.css";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * An event's Survey after tab, on the event's own management pages.
 *
 * FOR EVERYBODY IN THE EVENTS AREA, that the survey went and when, and who to
 * ask for its results: an event's organiser does not see its survey's
 * results, so nothing here is a result, a count of answers or a name.
 *
 * FOR ADMINS (`canRunSurveys`), the results themselves, as the survey's own
 * Results tab draws them, with n beside every number, the logged download,
 * and the way to its pages; or, before it has one, the way to make it.
 *
 * FOR THE PEOPLE WHO RUN CHECK-IN (admins and SU-recognised committee, the
 * people who may draw the event's door code), the survey's QR code to show
 * at the end of the event, with its PNG and full screen, while the survey
 * takes answers; while it is a draft, a line saying it shows here once an
 * admin opens it (`surveyCodeAtEvent`). Here, beside Check-in, because this
 * is the event's own page, where they already work at the event: the
 * survey's own pages are an admin's. Nothing about its answers or who gave
 * them comes with the code.
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
  const atEvent = surveyCodeAtEvent(viewer, survey, now);
  const code = atEvent === "show" ? await findSurveyCode(db, event.id) : null;
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
        {atEvent === "not-yet" && <p className={styles.cardText}>{CODE_AT_EVENT_WORDS.notYet}</p>}
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

      {code && (
        <SurveyCodeAtEvent
          code={{ slug: code.slug, address: shortLinkAddress(code.slug), active: code.active }}
          qr={<QrCode className={styles.qr} text={shortLinkUrl(code.slug)} label={`QR code for ${shortLinkAddress(code.slug)}`} />}
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
