import { notFound, redirect } from "next/navigation";
import DoorList from "@/features/events/checkIn/DoorList";
import { dayWords } from "@/features/events/manageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { loadEventAtTheDoor } from "@/lib/events/checkInLoad";
import { doorClosedWords, doorRows, namesOffOf } from "@/lib/events/checkInView";
import {
  checkInPhase,
  doorListSignups,
  doorWindow,
  eventTakesCheckIns,
  openingOf,
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
 *
 * NO TICK UNTIL THE DOOR IS OPEN. Inside the door's hours the names show from
 * the start, and Check in and Add a walk-in only once the event's author or an
 * admin has opened the door from the Check-in tab (`openingOf`). At an event
 * that does not let people check themselves in, a line over the names says
 * everyone gives their name here, and the door code's address is not offered.
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
    ? doorClosedWords(checkInPhase(event, new Date(), surveyClosesAt), doorWindow(event), openingOf(event) !== null)
    : "Only a published event takes check-ins.";
  // The door code checks nobody in at an event that does not let people check themselves in.
  const doorCode = event.selfCheckIn ? await findDoorCode(db, event.id) : null;
  const title = event.title.trim() || "Untitled event";
  const emailGoesAt = walkInEmailGoesAt(event, surveyClosesAt);
  const untilSurvey = emailGoesAt !== null && emailGoesAt.getTime() !== walkInEmailGoesAt(event)?.getTime();

  return (
    <DoorList
      eventId={event.id}
      eventTitle={title}
      initialRows={doorRows(doorListSignups(signups), checkIns)}
      namesOff={namesOffOf(checkIns)}
      closedWords={closedWords}
      selfCheckIn={event.selfCheckIn}
      doorAddress={doorCode && doorCode.active ? shortLinkAddress(doorCode.slug) : null}
      eventLine={event.startAt ? `${title} · ${dayWords(event.startAt)}` : title}
      emailGoesOn={emailGoesAt ? dayWords(emailGoesAt) : "the day after"}
      untilSurvey={untilSurvey}
    />
  );
}
