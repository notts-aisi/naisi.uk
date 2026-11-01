import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Chip from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import AttendeeDashboard from "@/features/events/AttendeeDashboard";
import EventTabs from "@/features/events/checkIn/EventTabs";
import { getEventForPreview } from "@/features/events/fetchEvents";
import { STATUS_WORDS, dayTimeWords, statusTone } from "@/features/events/manageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { signupCountWords } from "@/lib/events/requestWords";
import { signupAccessFor } from "@/lib/events/signupAccess";
import { staffNamesFor } from "@/lib/names/load";
import type { StaffName } from "@/lib/names/staffName";
import styles from "../../events.module.css";

export const dynamic = "force-dynamic";

/**
 * An event's Sign-ups tab.
 *
 * THE REQUESTS WAITING FOR A DECISION, for everybody who sees them: admins,
 * SU-recognised committee, and the event's author and collaborators
 * (`signupAccessFor`). Each says who is asking (the requests route), with
 * Approve and Turn down for the people who may decide.
 *
 * EVERYBODY WHO SIGNED UP, with addresses, every answer, the update composer
 * and the download, for admins and SU-recognised committee alone: the list is
 * read in their browser, under the rule that says the same, and their names
 * are looked up here only for them. Anybody else the events area admits is
 * sent back to the event.
 */
export default async function SignupsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const event = await getEventForPreview(id);
  if (!event) notFound();

  const access = signupAccessFor(viewer, event);
  if (!access.requests) redirect(`/events/manage/${id}`);

  // The names of the accounts that signed up, as the committee sees them: the
  // full name, with the name they go by after it, and what tells two with one
  // full name apart. The whole list shows every address beside its name
  // already. Read only for the people the whole list is for.
  const db = getAdminDb();
  const people: Record<string, StaffName> = {};
  if (access.everyone && db) {
    const signups = await db.collection("eventRsvps").where("eventId", "==", event.id).get();
    const uids = signups.docs.map((doc) => doc.get("uid") as unknown).filter((uid): uid is string => typeof uid === "string");
    for (const [uid, staff] of await staffNamesFor(db, uids, viewer, { emailShown: true })) people[uid] = staff;
  }

  const name = event.title || "Untitled event";
  const waiting = event.rsvpCountPending ?? 0;
  const counts = signupCountWords({
    confirmed: event.rsvpCountConfirmed ?? 0,
    capacity: event.capacity,
    waiting,
    waitlisted: event.rsvpCountWaitlisted ?? 0,
  });

  return (
    <div className={styles.page}>
      <PageHead
        crumb={
          <Link href="/events/manage" className={styles.crumbLink}>
            Manage events
          </Link>
        }
        title={name}
        badges={
          <Chip tone={statusTone(event.status)} dot>
            {STATUS_WORDS[event.status]}
          </Chip>
        }
        meta={
          <>
            {event.startAt && <span>{dayTimeWords(event.startAt)}</span>}
            {!event.noSignup && counts.map((words) => <span key={words}>{words}</span>)}
          </>
        }
      />

      <EventTabs
        eventId={event.id}
        current="signups"
        showSignups
        signups={event.rsvpCountConfirmed ?? undefined}
        waiting={waiting}
        showCheckIn={event.status === "published"}
      />

      <AttendeeDashboard event={event} people={people} everyone={access.everyone} />
    </div>
  );
}
