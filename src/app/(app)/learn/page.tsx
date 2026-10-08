import YourApplications from "@/features/applications/home/YourApplications";
import YourPlace from "@/features/applications/home/YourPlace";
import { placesHeldBy } from "@/features/applications/home/places";
import { getCurrentUser } from "@/lib/firebase/session";
import LearnHub from "./LearnHub";

/**
 * `/learn`: every run the member touches, drawn by `LearnHub` in the browser
 * from the list of their runs.
 *
 * A Server Component for one read the browser cannot make. Somebody decision
 * day gave a place has no run until they are put on one, so the hub would
 * tell them they are not on a course. The page asks `placesHeldBy`, which
 * asks what "Your application" shows this person, and hands the hub what to
 * draw instead:
 *
 *  - a place they hold: a card that says what their own page says, and links
 *    to it;
 *  - places that could not be read (a view-as session, or a read that
 *    failed): the way to their applications, which names nothing. The hub
 *    then makes no claim either way;
 *  - no place: nothing, and the hub says what it always has.
 *
 * What a maintainer has to keep: the read is by the session's own uid and by
 * nothing a request carries, it is not made in a view-as session (the check
 * is `placesHeldBy`'s own, before it reads), and nothing in this file looks
 * at an application or a decision. A place is said here exactly when the
 * person's own page says it.
 */
export default async function LearnPage() {
  const user = await getCurrentUser();
  const places = user ? await placesHeldBy(user.uid) : null;
  const instead =
    places === null ? <YourApplications rows={null} /> : places.length > 0 ? <YourPlace places={places} /> : null;
  return <LearnHub instead={instead} />;
}
