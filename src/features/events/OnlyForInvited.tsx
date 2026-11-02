import Link from "next/link";
import { REACH_WORDS } from "@/lib/events/reach";
import links from "./eventLinks.module.css";
import styles from "./RsvpPages.module.css";

/**
 * What an event for chosen people's page says to somebody who may not open it.
 *
 * ONE CALM SENTENCE AND NOTHING OF THE EVENT: not its title, its day or its
 * place, which are for the people invited. Signed out, the way to sign in,
 * because an invited person who followed a link before signing in lands here
 * first; signed in, where to ask, and what else is on.
 *
 * RENDERED BY THE PAGE, NEVER `notFound()`. For a route that matched, Next
 * answers `notFound()` with an empty body and draws the message only once the
 * scripts arrive, and the event is there: it is only not this person's. A
 * Server Component with no client part, on the sign-up flow's own small-page
 * card, so it reads from the first HTML.
 */
export default function OnlyForInvited({ eventId, signedIn }: { eventId: string; signedIn: boolean }) {
  const here = `/events/${encodeURIComponent(eventId)}`;
  return (
    <div className={styles.column}>
      <div className={styles.card}>
        <h1 className={styles.title}>{REACH_WORDS.onlyInvited}</h1>
        <p className={styles.text}>{signedIn ? REACH_WORDS.onlyInvitedSignedIn : REACH_WORDS.onlyInvitedSignedOut}</p>
        <div className={styles.actions}>
          {!signedIn && (
            <Link href={`/login?next=${encodeURIComponent(here)}`} prefetch={false} className={`${links.link} ${links.primary}`}>
              {REACH_WORDS.signIn}
            </Link>
          )}
          <Link href="/events" prefetch={false} className={`${links.link} ${signedIn ? links.primary : links.secondary}`}>
            {REACH_WORDS.seeWhatsOn}
          </Link>
        </div>
      </div>
    </div>
  );
}
