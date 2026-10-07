import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Button from "@/components/ui/Button";
import PageHead from "@/components/ui/PageHead";
import AttendeeDashboard from "@/features/events/AttendeeDashboard";
import { getEventForPreview } from "@/features/events/fetchEvents";
import { whenWords } from "@/features/events/manageWords";
import { getCurrentUser } from "@/lib/firebase/session";
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

  const name = event.title || "Untitled event";

  return (
    <div className={styles.page}>
      <PageHead
        crumb={
          <>
            <Link href="/events/manage">Manage events</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/events/manage/${event.id}`}>{name}</Link>
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

      <AttendeeDashboard event={event} />
    </div>
  );
}
