import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedEvent } from "@/features/events/fetchEvents";
import links from "@/features/events/eventLinks.module.css";
import styles from "@/features/events/RsvpPages.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "RSVP submitted" };

/**
 * Confirmation page an attendee lands on after submitting an RSVP. A dedicated
 * page so the "we've got it" message can't be scrolled past or missed.
 */
export default async function RsvpSubmittedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getPublishedEvent(id);

  return (
    <section className={styles.shell}>
      <div className="container">
        <div className={styles.column}>
          <div className={styles.card}>
            {/* Addressed by the browser end-to-end suite: this headline is how a
                guest knows the RSVP landed, so it is what the spec waits for. */}
            <h1 data-testid="rsvp-submitted" className={styles.title}>
              Your RSVP is in
            </h1>
            <p className={styles.text}>
              {event
                ? `Thanks. Your RSVP for ${event.title} has been submitted.`
                : "Thanks. Your RSVP has been submitted."}
            </p>
            <p className={styles.muted}>
              A NAISI organiser will review it and email you once your spot is
              confirmed. Keep an eye on that inbox, and your spam folder just in
              case.
            </p>
            {/* Anchors, never a Button inside an anchor: that nesting is
                invalid and its tap behaviour is unreliable in iOS Safari. */}
            <div className={styles.actions}>
              {event && (
                <Link href={`/events/${id}`} className={`${links.link} ${links.secondary}`}>
                  Back to the event
                </Link>
              )}
              <Link href="/events" className={`${links.link} ${links.primary}`}>
                See all events
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
