import type { Metadata } from "next";
import AskTheTeam from "@/features/teamAsk/AskTheTeam";
import { ownTeamMessages } from "@/lib/courses/teamAsk/own";
import { placesThisTermOf } from "@/lib/courses/teamAsk/places";
import { PAGE_WORDS } from "@/lib/courses/teamAsk/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: PAGE_WORDS.title,
  robots: { index: false, follow: false },
};

/**
 * ASK THE TEAM, for any signed-in member: send the people running NAISI a
 * message, and read your own messages with where each stands and the reply.
 *
 * In the signed-in area, so the authed layout is the gate: a stranger is sent
 * to sign in, a waiting account to the waiting page and a refused one home.
 * Signed out, nothing: the public footer already gives the society's address.
 *
 * WHAT IS READ is the caller's own and nothing else, by the session's uid:
 * their messages to the team (`ownTeamMessages`), and the places they hold
 * this term that Publish has told them (`placesThisTermOf`), for "One week at
 * another session" (a link to that programme's own form, which decides
 * everything itself) and the line pointing to the programme page. The topics
 * offered are the ones whose flows exist; a later piece adds its own.
 */
export default async function AskTheTeamPage() {
  const user = await getCurrentUser();
  const db = getAdminDb();
  // The person's own view: only a place Publish has told them, an admin's own
  // included. A read that fails still draws the form, with no list rather
  // than an empty one.
  const quietly = <T,>(what: string, fallback: T) => (err: unknown): T => {
    console.warn(`[ask the team] could not read the member's ${what}`, err instanceof Error ? err.message : "unknown");
    return fallback;
  };
  const [own, places] =
    user && db
      ? await Promise.all([
          ownTeamMessages(db, user.uid).catch(quietly("own messages", null)),
          placesThisTermOf(db, user.uid, { isAdmin: false, role: user.role }).catch(quietly("places", [])),
        ])
      : [null, []];
  return <AskTheTeam places={places.map((place) => ({ runId: place.runId, name: place.programmeName }))} own={own} />;
}
