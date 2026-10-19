import YourApplications from "@/features/applications/home/YourApplications";
import { holdsPlace } from "@/features/applications/home/holdsPlace";
import { getCurrentUser } from "@/lib/firebase/session";
import LearnHub from "./LearnHub";

/**
 * `/learn`: every run the member touches, drawn by `LearnHub` in the browser
 * from the list of their runs.
 *
 * A Server Component for one read the browser cannot make. Somebody decision
 * day gave a place has no run until they are put on one, so the hub would
 * tell them they are not on a course. The page asks `holdsPlace` (yes, no, or
 * could not tell) and hands the hub what to draw where it would say so:
 *
 *  - "no": nothing, and the hub says what it always has;
 *  - "yes", and "could not tell" (a view-as session, or a read that failed):
 *    the way to the member's applications, which names none of them. The hub
 *    then makes no claim either way.
 *
 * THIS PAGE STATES NO OUTCOME. It does one thing for a place and for a place
 * it could not read, so nothing drawn here says which, and what became of an
 * application is said on the person's own page, which that card leads to.
 *
 * What a maintainer has to keep: the read is by the session's own uid and by
 * nothing a request carries, it is not made in a view-as session (the check
 * is `holdsPlace`'s own, before it reads), and nothing in this file looks at
 * an application or a decision.
 */
export default async function LearnPage() {
  const user = await getCurrentUser();
  const held = user ? await holdsPlace(user.uid) : "unknown";
  return <LearnHub instead={held === "no" ? null : <YourApplications rows={null} />} />;
}
