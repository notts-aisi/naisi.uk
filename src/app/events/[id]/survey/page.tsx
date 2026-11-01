import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import AnswerScreen from "@/features/surveys/answer/AnswerScreen";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Firestore } from "firebase-admin/firestore";
import { mayOpenFor } from "@/lib/events/opening";
import { isForChosenPeople } from "@/lib/events/reach";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { CODE_PAGE_WORDS, codePageFor, type CodePage } from "@/lib/surveys/events/codePage";
import styles from "./survey.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: CODE_PAGE_WORDS.bar,
  robots: { index: false, follow: false },
};

/**
 * Where a survey's QR code lands at its event (sv-send, "At the event"):
 * signed in, somebody who signed up or came answers it; signed out, they are
 * asked to sign in, and a guest is told to use their emailed link
 * (`codePageFor` in `src/lib/surveys/events/codePage.ts` decides).
 *
 * A CODE SHOWN ON A SCREEN LANDS HERE, so this page is built like the
 * check-in page: it sits under the root layout alone, reads from its first
 * HTML, and never answers with `notFound()`. Every state is ordinary
 * server-rendered HTML. Opening it records nothing, and signed out it names
 * nobody.
 */
export default async function EventSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  const user = await getCurrentUser();
  const readable = db && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? db : null;
  // AN EVENT FOR CHOSEN PEOPLE is for the people invited to it
  // (src/lib/events/reach.ts): signed out, the way in is to sign in with
  // nothing of it named; signed in as somebody who may not open it, there is
  // no survey here for them.
  const chosen = readable ? await chosenEventGate(readable, id, user) : "open";
  if (chosen === "sign-in") {
    return (
      <Frame>
        <h1 className={styles.title}>{CODE_PAGE_WORDS.bar}</h1>
        <p className={styles.lead}>{CODE_PAGE_WORDS.signIn}</p>
        <Link href={`/login?next=${encodeURIComponent(`/events/${id}/survey`)}`} prefetch={false} className={styles.primary}>
          {CODE_PAGE_WORDS.signInButton}
        </Link>
      </Frame>
    );
  }
  const page: CodePage =
    readable && chosen === "open" ? await codePageFor(readable, id, user, new Date()) : { kind: "none" };

  if (page.kind === "none") {
    return (
      <Frame>
        <h1 className={styles.title}>{CODE_PAGE_WORDS.none.title}</h1>
        <p className={styles.lead}>{CODE_PAGE_WORDS.none.body}</p>
      </Frame>
    );
  }
  if (page.kind === "sign-in") {
    return (
      <Frame line={page.line}>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.lead}>{CODE_PAGE_WORDS.signIn}</p>
        <Link href={`/login?next=${encodeURIComponent(page.next)}`} prefetch={false} className={styles.primary}>
          {CODE_PAGE_WORDS.signInButton}
        </Link>
        <p>{CODE_PAGE_WORDS.guest}</p>
      </Frame>
    );
  }
  if (page.kind === "message") {
    return (
      <Frame line={page.line}>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.lead}>{page.body}</p>
        {page.checkIn && (
          <p>
            <Link href={page.checkIn} prefetch={false} className={styles.textLink}>
              {CODE_PAGE_WORDS.checkIn}
            </Link>
          </p>
        )}
      </Frame>
    );
  }
  return (
    <Frame>
      <AnswerScreen screen={page.screen} />
    </Frame>
  );
}

/**
 * Whether this person may see anything here of an event for chosen people:
 * `open` for every other event and for somebody who may open it, `sign-in`
 * for nobody signed in, `closed` for anybody else.
 */
async function chosenEventGate(db: Firestore, id: string, user: SessionUser | null): Promise<"open" | "sign-in" | "closed"> {
  const snap = await db.collection("events").doc(id).get();
  if (!snap.exists) return "open";
  const event = normalizeEvent(snap.id, snap.data() ?? {});
  if (!isForChosenPeople(event)) return "open";
  if (!user) return "sign-in";
  return (await mayOpenFor(db, event.id, event, user)) ? "open" : "closed";
}

function Frame({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.bar}>
          <Link href="/" prefetch={false} className={styles.brand} aria-label="NAISI home">
            <BrandMark size={28} />
          </Link>
          <span className={styles.barTitle}>{CODE_PAGE_WORDS.bar}</span>
          <span className={styles.barEnd} aria-hidden="true" />
        </div>
        <div className={styles.body}>
          {line && <p className={`meta ${styles.eventLine}`}>{line}</p>}
          {children}
        </div>
      </div>
    </main>
  );
}
