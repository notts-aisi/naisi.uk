import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Button from "@/components/ui/Button";
import PageHead from "@/components/ui/PageHead";
import AttendeeDashboard from "@/features/events/AttendeeDashboard";
import EventTabs from "@/features/events/checkIn/EventTabs";
import { getEventForPreview } from "@/features/events/fetchEvents";
import { whenWords } from "@/features/events/manageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { staffNamesFor } from "@/lib/names/load";
import type { StaffName } from "@/lib/names/staffName";
import styles from "../../events.module.css";

export const dynamic = "force-dynamic";

export default async function AttendeesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Attendee PII is for SU-recognised committee and admins only. The events
  // area is open to all committee members, but the attendee list is not.
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  const canSeeAttendees =
    viewer.role === "admin" ||
    (viewer.role === "committee" && viewer.suRecognised);
  if (!canSeeAttendees) redirect(`/events/manage/${id}`);

  const event = await getEventForPreview(id);
  if (!event) notFound();

  // The names of the accounts that signed up, as the committee sees them: the
  // full name, with the name they go by after it, and what tells two with one
  // full name apart. The list shows every address beside its name already.
  const db = getAdminDb();
  const people: Record<string, StaffName> = {};
  if (db) {
    const signups = await db.collection("eventRsvps").where("eventId", "==", event.id).get();
    const uids = signups.docs.map((doc) => doc.get("uid") as unknown).filter((uid): uid is string => typeof uid === "string");
    for (const [uid, staff] of await staffNamesFor(db, uids, viewer, { emailShown: true })) people[uid] = staff;
  }

  const name = event.title || "Untitled event";

  return (
    <div className={styles.page}>
      <PageHead
        crumb={
          <>
            <Link href="/events/manage" className={styles.crumbLink}>
              Manage events
            </Link>
            <span aria-hidden="true">/</span>
            <Link href={`/events/manage/${event.id}`} className={styles.crumbLink}>
              {name}
            </Link>
          </>
        }
        title="Attendees"
        description={`${name} · ${whenWords(event.startAt)}`}
        actions={
          <Link href={`/events/manage/${event.id}`} className={styles.buttonLink}>
            <Button variant="secondary" tabIndex={-1}>
              Back to the event
            </Button>
          </Link>
        }
      />

      <EventTabs
        eventId={event.id}
        current="signups"
        showSignups
        signups={event.rsvpCountConfirmed ?? undefined}
        showCheckIn={event.status === "published"}
      />

      <AttendeeDashboard event={event} people={people} />
    </div>
  );
}
