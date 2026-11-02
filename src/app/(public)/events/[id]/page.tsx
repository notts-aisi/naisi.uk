import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EventDetailView from "@/features/events/EventDetailView";
import OnlyForInvited from "@/features/events/OnlyForInvited";
import { eventMetaFor, getEventForViewer, heldPlaceAt } from "@/features/events/fetchEvents";
import styles from "../events.module.css";

export const dynamic = "force-dynamic";

/**
 * A link preview is fetched with no session, so it is decided with none: an
 * event for chosen people gets a plain title and nothing of its own, and is
 * kept out of search results.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meta = await eventMetaFor(id);
  if (!meta) return { title: "Event not found" };
  return {
    title: meta.title,
    description: meta.description,
    ...(meta.chosen ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await getEventForViewer(id);
  if (!found) notFound();
  // The place the person looking holds here, if any, which the page offers
  // to give back. Theirs alone: it is found by their own session. Only an
  // event that takes sign-ups has a panel to say it in.
  const held =
    found.kind === "open" && found.event.status === "published" && !found.event.noSignup
      ? await heldPlaceAt(found.event)
      : null;

  return (
    <section className={styles.eventSection}>
      <div className="container">
        {/* An event for chosen people that is not this person's: a calm page
            of its own, rendered here, never notFound(). See OnlyForInvited. */}
        {found.kind === "open" ? (
          <EventDetailView event={found.event} held={held} />
        ) : (
          <OnlyForInvited eventId={id} signedIn={found.signedIn} />
        )}
      </div>
    </section>
  );
}
