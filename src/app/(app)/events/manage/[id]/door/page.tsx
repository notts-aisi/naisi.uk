import { notFound, redirect } from "next/navigation";
import DoorList from "@/features/events/checkIn/DoorList";
import { dayWords } from "@/features/events/manageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { loadEventAtTheDoor } from "@/lib/events/checkInLoad";
import { doorClosedWords, doorRows } from "@/lib/events/checkInView";
import {
  checkInPhase,
  doorListSignups,
  doorWindow,
  eventTakesCheckIns,
  walkInEmailGoesAt,
} from "@/lib/events/checkIns";
import { findDoorCode } from "@/lib/events/doorCode";
import { shortLinkAddress } from "@/lib/qr/shortLinkCode";
import { surveyClosesFor } from "@/lib/surveys/events/records";

export const dynamic = "force-dynamic";

/**
 * The door list (ev-door-phone): the event's sign-ups with a Check in each, a
 * search, and the count, for the phone of whoever is on the door.
 *
 * For the people who run check-in only (`runsCheckIn`), as the sign-ups are:
 * it shows everybody who signed up. Anybody else in the events area goes back
 * to the event, as the attendees page sends them.
 *
 * ONE LOAD. Everything the list needs comes in this page's HTML: the
 * sign-ups, who is already here and the door code's address. After that,
 * each Check in is one small request, so a phone on the hall's signal waits
 * once and then only for its own presses.
 */
export default async function DoorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  if (!runsCheckIn(viewer)) redirect(`/events/manage/${id}`);

  const db = getAdminDb();
  const loaded = db ? await loadEventAtTheDoor(db, id) : null;
  if (!db || !loaded) notFound();
  const { event, signups, checkIns } = loaded;

  // A walk-in's email goes when the event's survey closes, if that is sooner than a week.
  const surveyClosesAt = await surveyClosesFor(db, event.id);
  const closedWords = eventTakesCheckIns(event)
    ? doorClosedWords(checkInPhase(event, new Date(), surveyClosesAt), doorWindow(event))
    : "Only a published event takes check-ins.";
  const doorCode = await findDoorCode(db, event.id);
  const title = event.title.trim() || "Untitled event";
  const emailGoesAt = walkInEmailGoesAt(event, surveyClosesAt);
  const untilSurvey = emailGoesAt !== null && emailGoesAt.getTime() !== walkInEmailGoesAt(event)?.getTime();

  return (
    <DoorList
      eventId={event.id}
      eventTitle={title}
      initialRows={doorRows(doorListSignups(signups), checkIns)}
      closedWords={closedWords}
      doorAddress={doorCode && doorCode.active ? shortLinkAddress(doorCode.slug) : null}
      eventLine={event.startAt ? `${title} · ${dayWords(event.startAt)}` : title}
      emailGoesOn={emailGoesAt ? dayWords(emailGoesAt) : "the day after"}
      untilSurvey={untilSurvey}
    />
  );
}
