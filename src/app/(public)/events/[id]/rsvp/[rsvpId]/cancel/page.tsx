import SelfCancelForm from "@/features/events/SelfCancelForm";
import { getEventForPreview } from "@/features/events/fetchEvents";
import { verifyRsvpToken } from "@/lib/events/rsvpToken";
import { getAdminDb } from "@/lib/firebase/admin";
import styles from "@/features/events/RsvpPages.module.css";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; rsvpId: string }>;
type Search = Promise<{ t?: string | string[] }>;

export default async function CancelRsvpPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id: eventId, rsvpId } = await params;
  const q = await searchParams;
  const token = typeof q.t === "string" ? q.t : "";

  const db = getAdminDb();
  const rsvpSnap = db ? await db.collection("eventRsvps").doc(rsvpId).get() : null;
  const event = await getEventForPreview(eventId);

  const shell = (body: React.ReactNode) => (
    <section className={styles.shell}>
      <div className="container">
        <div className={styles.column}>{body}</div>
      </div>
    </section>
  );

  if (!event || !rsvpSnap?.exists) {
    return shell(
      <div className={styles.card}>
        <h1 className={styles.title}>
          Link no longer valid
        </h1>
        <p className={styles.muted}>
          We couldn&apos;t find this RSVP. It may already have been
          cancelled, or the event has been removed.
        </p>
      </div>,
    );
  }

  const rsvp = rsvpSnap.data() ?? {};
  const email = typeof rsvp.email === "string" ? rsvp.email : "";
  const ok = token && email && verifyRsvpToken(rsvpId, email, token);
  if (!ok || rsvp.eventId !== eventId) {
    return shell(
      <div className={styles.card}>
        <h1 className={styles.title}>
          Link no longer valid
        </h1>
        <p className={styles.muted}>
          This cancel link has expired or doesn&apos;t match this event. If you still need to
          cancel, reply to your confirmation email and we&apos;ll sort it out.
        </p>
      </div>,
    );
  }

  if (rsvp.status === "cancelled") {
    return shell(
      <div className={styles.card}>
        <h1 className={styles.title}>
          Already cancelled
        </h1>
        <p className={styles.muted}>
          This RSVP was cancelled already. No action needed.
        </p>
      </div>,
    );
  }

  return shell(
    <SelfCancelForm
      eventId={eventId}
      rsvpId={rsvpId}
      token={token}
      name={typeof rsvp.name === "string" ? rsvp.name : ""}
      eventTitle={event.title}
    />,
  );
}
