import EventEditor from "@/features/events/EventEditor";
import { getAdminDb } from "@/lib/firebase/admin";
import { announcementQueueEnabled } from "@/lib/scheduler/announcementQueue";
import { eventSurveysGoByThemselves } from "@/lib/scheduler/eventSurveysSwitch";

/**
 * The editor is a client component (it wants `onSnapshot`), and the switches
 * it needs for its copy live in `config/scheduler`, which is closed to every
 * client. So the answers are read here, on the server, and handed down: the
 * announcement's path for one sentence of the Publish confirm, and whether
 * the survey after an event goes by itself for the Survey after step.
 *
 * A read that fails falls back to `false`: for the announcement that is the
 * wording for the inline path (an announcement described as immediate that
 * turns out to take fifteen minutes is a smaller surprise than the reverse);
 * for the survey it is the step saying nothing goes by itself, which never
 * promises a send.
 */
export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getAdminDb();
  let announcementsQueued = false;
  let surveysGoByThemselves = false;
  if (db) {
    try {
      announcementsQueued = await announcementQueueEnabled(db);
    } catch (err) {
      console.error("[events manage] could not read the announcement switch", err);
    }
    try {
      surveysGoByThemselves = await eventSurveysGoByThemselves(db);
    } catch (err) {
      console.error("[events manage] could not read the event-surveys switch", err);
    }
  }
  return <EventEditor eventId={id} announcementsQueued={announcementsQueued} surveysGoByThemselves={surveysGoByThemselves} />;
}
