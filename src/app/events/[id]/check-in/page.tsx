import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import { clockWords } from "@/features/events/manageWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeEvent, type EventDoc } from "@/lib/firestore/events";
import { eventTakesCheckIns } from "@/lib/events/checkIns";
import {
  eventLine,
  linkParams,
  selfCheckInView,
  selfClosedWords,
  type EventLine,
} from "@/lib/events/selfCheckIn";
import { ImHere } from "./ImHere";
import { SignOutLink } from "./SignOutLink";
import styles from "./checkIn.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check in",
  robots: { index: false, follow: false },
};

/** Who can see who came, said wherever somebody checks themselves in. */
const WHO_SEES =
  "This checks you in on the door list. Only NAISI’s admins and the committee members the Students’ Union recognises can see who came.";
const SURVEY_LINE = "There may be a short survey afterwards.";

/**
 * Where an event's door code lands (ev-self-phone): "Are you here?" and one
 * button. `decideSelf` (`src/lib/events/selfCheckIn.ts`) decides who may press
 * it and as what; the route behind the button asks the same question.
 *
 * A PRINTED CODE LANDS HERE, so this page is built like the calendar page: it
 * sits under the root layout alone, reads from its first HTML, and never
 * answers with `notFound()`. Every state, the event that is gone included, is
 * ordinary server-rendered HTML.
 *
 * A PUBLIC ADDRESS. Signed out, it names nobody: not who signed up, not who
 * came. It shows the event's public facts, as the event's own page does.
 */
export default async function SelfCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const link = linkParams(await searchParams);
  const db = getAdminDb();
  const event = db && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? await readEvent(id) : null;

  if (!db || !event || (!eventTakesCheckIns(event) && event.status !== "cancelled")) {
    return (
      <Frame>
        <h1 className={styles.title}>There’s nothing to check in to here</h1>
        <p className={styles.lead}>
          This code is for an event that isn’t on the site any more. Give your name at the door.
        </p>
        <p>
          <Link href="/events" prefetch={false} className={styles.textLink}>
            See what’s on
          </Link>
        </p>
      </Frame>
    );
  }

  const line = eventLine(event);
  if (event.status === "cancelled") {
    return (
      <Frame line={line}>
        <h1 className={styles.title}>This event was cancelled</h1>
      </Frame>
    );
  }
  const closed = selfClosedWords(event, new Date());
  if (closed) {
    return (
      <Frame line={line}>
        <h1 className={styles.title}>Check in</h1>
        <p className={styles.lead}>{closed}</p>
      </Frame>
    );
  }

  // The link in a guest's email decides on its own: it is their credential.
  const user = link.token ? null : await getCurrentUser();
  const { decision, already } = await selfCheckInView(db, {
    event,
    user,
    rsvpId: link.rsvpId,
    token: link.token,
  });
  const signOut = user ? <SignOutLink returnTo={`/events/${event.id}/check-in`} /> : null;

  if (decision.kind === "sign-in") {
    return (
      <Frame line={line}>
        <h1 className={styles.title}>Are you here?</h1>
        <p className={styles.lead}>Sign in to check yourself in.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/events/${event.id}/check-in`)}`}
          prefetch={false}
          className={styles.primary}
        >
          Sign in
        </Link>
        <p>Signed up without an account? Open the check-in link in your confirmation email.</p>
        <p>Otherwise, give your name at the door.</p>
      </Frame>
    );
  }
  if (decision.kind === "bad-link") {
    return (
      <Frame line={line}>
        <h1 className={styles.title}>This link doesn’t work here</h1>
        <p className={styles.lead}>It isn’t for this event. Give your name at the door.</p>
      </Frame>
    );
  }
  if (decision.kind === "at-the-door") {
    return (
      <Frame line={line}>
        <h1 className={styles.title}>{decision.firstName ? `Hi ${decision.firstName}.` : "Hello."}</h1>
        <p className={styles.lead}>{decision.words}</p>
        {signOut}
      </Frame>
    );
  }

  const greeting = decision.firstName ? `Hi ${decision.firstName}.` : "Hello.";
  if (already) {
    return (
      <Frame line={line}>
        <h1 className={styles.title}>
          {decision.firstName ? `You’re checked in, ${decision.firstName}.` : "You’re checked in."}
        </h1>
        <p className={styles.lead}>Checked in at {clockWords(already.at ?? new Date())}.</p>
        <p>{WHO_SEES}</p>
        <p>{SURVEY_LINE}</p>
        {signOut}
      </Frame>
    );
  }

  return (
    <Frame line={line}>
      <h1 className={styles.title}>{greeting} Are you here?</h1>
      <p className={styles.lead}>
        {!decision.asWalkIn
          ? "You signed up for this."
          : event.noSignup
            ? "No sign-up needed for this one."
            : "You didn’t sign up, so this checks you in as a walk-in."}
      </p>
      <ImHere eventId={event.id} rsvpId={link.rsvpId} token={link.token} />
      <p>{WHO_SEES}</p>
      <p>{SURVEY_LINE}</p>
      {signOut}
    </Frame>
  );
}

async function readEvent(id: string): Promise<EventDoc | null> {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("events").doc(id).get();
  return snap.exists ? normalizeEvent(snap.id, snap.data() ?? {}) : null;
}

function Frame({ line, children }: { line?: EventLine; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <Link href="/" prefetch={false} className={styles.brand} aria-label="NAISI home">
          <BrandMark size={28} />
        </Link>
        <span className={styles.barTitle}>Check in</span>
      </header>
      <div className={styles.body}>
        {line && <p className={`meta ${styles.eventLine}`}>{line.line}</p>}
        {children}
      </div>
    </main>
  );
}
