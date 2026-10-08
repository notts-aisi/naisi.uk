import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { loadStatusRows } from "@/lib/admissions/statusHubData";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import YourApplications, {
  type YourApplicationRow,
} from "@/features/applications/home/YourApplications";
import YourPlace from "@/features/applications/home/YourPlace";
import { placesHeldBy } from "@/features/applications/home/places";
import { InstallCard } from "@/features/pwa/InstallCard";
import { fetchPublicTerm } from "@/features/term/fetchPublicTerm";
import { termCivilDay } from "@/features/term/termWords";
import ComingUp from "./ComingUp";
import { FinishProfile, NoApplicationsYet } from "./HomeAside";
import HomeAdmin from "./HomeAdmin";
import HomeMember from "./HomeMember";
import TermCard from "./TermCard";
import { homeEvents, profileSteps } from "./homeData";
import { firstName } from "./homeWords";
import styles from "./home.module.css";

/**
 * Home: the first page somebody sees after signing in.
 *
 * It has four forms. An admin's is chosen here, from the role the session
 * holds. The other three (a facilitator, a member on a programme, a member
 * who is not) are chosen in the browser by `HomeMember`, from the list of
 * runs the member touches, which only a signed-in request can ask for.
 *
 * What is the same for every reader is read here, once, and handed down as
 * finished pieces: the term (through `fetchPublicTerm`, so no date is written
 * in a file), the next events, the member's own applications, a place they
 * hold and what is missing from their profile.
 *
 * A PLACE IS SAID IN THE WORDS OF THE PERSON'S OWN PAGE. Somebody decision
 * day gave a place has no run until they are put on one, and a member with
 * no run is told they are not on a programme. So the page asks
 * `placesHeldBy`, which asks what "Your application" shows this person, and
 * hands the member's Home a card that says the same and links there. Nothing
 * in this file reads what became of an application.
 */

/**
 * What this member has applied to, as the dashboard names it, or null when
 * that could not be read.
 *
 * Read with the loader behind `/applications` itself, by the session's own
 * uid, so the card is shown exactly when that page has something on it: a
 * row the list would drop is not counted here either. Two fields of each row
 * leave, the two the card prints.
 *
 * A failed read is null and never an empty list. Empty means "has not
 * applied", and the card would then hide the way back from somebody who has.
 *
 * NOT READ IN A VIEW-AS SESSION. The loader fetches every application the
 * account has, and an application is its owner's to read, so while an admin
 * is viewing the site as this member nothing is fetched: the answer is null,
 * and the card offers the way to the list without naming anything on it. The
 * list itself says why it is not shown.
 */
async function applicationsOf(uid: string, viewingAs: boolean): Promise<YourApplicationRow[] | null> {
  if (viewingAs) return null;
  const db = getAdminDb();
  if (!db) return null;
  try {
    const rows = await loadStatusRows(db, uid, new Date());
    return rows.map((row) => ({ roundId: row.round.id, label: row.round.label }));
  } catch (err) {
    console.warn("[dashboard] could not read this member's applications", err);
    return null;
  }
}

/** "Morning", "Afternoon" or "Evening", by the site's own clock. */
function partOfDay(now: Date): string {
  const hour = Number(formatSiteDate(now, { hour: "2-digit" }));
  if (hour < 12) return "Morning";
  return hour < 18 ? "Afternoon" : "Evening";
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // The session is already in hand, so this is `markerIsLive` rather than a
  // second read of it.
  const viewingAs = markerIsLive(await getImpersonator(), user?.uid ?? null);
  const applications = user ? await applicationsOf(user.uid, viewingAs) : [];
  const now = new Date();
  const [term, events, steps, places] = await Promise.all([
    fetchPublicTerm(now),
    homeEvents(now),
    user ? profileSteps(user.uid) : null,
    // The places they hold, from the rounds just listed. Null when that list
    // could not be read: the page then does not know, and says nothing either way.
    user && applications ? placesHeldBy(user.uid, applications.map((row) => row.roundId)) : null,
  ]);
  const given = firstName(user?.displayName);

  // The way back to somebody's applications. It draws nothing for a member
  // who has not applied; while applications are open, a member who is not on
  // a programme is told "Nothing yet" in the same place. In a view-as session
  // the list was not read, so "Nothing yet" is not said either: the card
  // offers the way to the list and that is all.
  const yourApplications = <YourApplications rows={applications} />;
  const nothingYet =
    term.stage === "open" && applications !== null && applications.length === 0 ? (
      <NoApplicationsYet closesAt={term.closesAt} />
    ) : null;

  // Quiet install invitation: phones only, dismissible once, hidden when
  // already installed. Each form draws it under its greeting. See
  // src/features/pwa/InstallCard.tsx.
  const invite = <InstallCard />;

  return (
    <div className={styles.page}>
      {user?.role === "admin" ? (
        <HomeAdmin
          given={given}
          invite={invite}
          greeting={partOfDay(now)}
          applicationsInHand={term.stage === "open" || term.stage === "closed"}
          decisionsBy={term.decisionsByDate ? termCivilDay(term.decisionsByDate) : null}
          weekRange={events.week.range}
          weekEvents={events.week.events}
          weekStartsAt={events.week.startsAt}
          weekEndsAt={events.week.endsAt}
          applications={yourApplications}
        />
      ) : (
        <HomeMember
          given={given}
          invite={invite}
          termCard={<TermCard term={term} />}
          comingUpRows={<ComingUp events={events.upcoming} layout="rows" />}
          comingUpCards={<ComingUp events={events.upcoming} layout="cards" />}
          applications={yourApplications}
          nothingYet={nothingYet}
          place={places && places.length > 0 ? <YourPlace places={places} /> : null}
          placesRead={places !== null}
          finishProfile={<FinishProfile steps={steps} />}
        />
      )}
    </div>
  );
}
