import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import EventDetailView from "@/features/events/EventDetailView";
import { getEventForPreview } from "@/features/events/fetchEvents";
import { STATUS_WORDS } from "@/features/events/manageWords";
import { getCurrentUser } from "@/lib/firebase/session";
import { canApproveEvent, canDraftEvent } from "@/lib/firestore/users";
import styles from "../../events.module.css";

export const dynamic = "force-dynamic";

export default async function EventPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  // The preview shows the public event view (no attendee PII), so it matches
  // the events-area gate: the whole committee, plus draft/approve holders.
  const allowed =
    viewer.role === "admin" ||
    viewer.role === "committee" ||
    canDraftEvent(viewer) ||
    canApproveEvent(viewer);
  if (!allowed) redirect("/dashboard");

  const event = await getEventForPreview(id);
  if (!event) notFound();

  // The event's own page below draws the h1, so this page adds a notice and
  // no head of its own.
  return (
    <div className={styles.page}>
      <Notice
        role="note"
        title={`Preview · ${STATUS_WORDS[event.status]}`}
        actions={
          <Link href={`/events/manage/${event.id}`} className={styles.buttonLink}>
            <Button variant="secondary" size="sm" tabIndex={-1}>
              Back to the event
            </Button>
          </Link>
        }
      >
        This is the event as a visitor sees it. A sign-up sent from here is
        saved like a real one, which makes it a way to try the whole thing
        before the event goes live.
      </Notice>

      <EventDetailView event={event} previewMode />
    </div>
  );
}
