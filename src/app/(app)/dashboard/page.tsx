import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import { beforeGroupsCardsFor, type BeforeGroupsCard } from "@/lib/courses/weekOne/cards";
import { surveysWaitingFor, type SurveyCard } from "@/lib/surveys/waiting";
import { loadStatusRows } from "@/lib/admissions/statusHubData";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import YourApplications, {
  type YourApplicationRow,
} from "@/features/applications/home/YourApplications";
import { holdsPlace, type HoldsPlace } from "@/features/applications/home/holdsPlace";
import { InstallCard } from "@/features/pwa/InstallCard";
import { fetchPublicTerm } from "@/features/term/fetchPublicTerm";
import { termCivilDay } from "@/features/term/termWords";
import { policyUpdateLine } from "@/lib/legal/updateLine";
import { NO_REQUESTS_WAITING, requestsWaitingFor } from "@/lib/courses/requests/home";
import { homeProgrammesOf, type HomeProgrammes } from "@/lib/applications/programmes/home";
import { loadProgrammesList, readsProgrammesFor } from "@/lib/applications/programmes/list";
import ComingUp from "./ComingUp";
import ForYou from "./ForYou";
import FullNameCard from "./FullNameCard";
import { FinishProfile, NoApplicationsYet } from "./HomeAside";
import HomeAdmin from "./HomeAdmin";
import HomeMember from "./HomeMember";
import PolicyUpdate from "./PolicyUpdate";
import ProgrammesHome from "./ProgrammesHome";
import RequestsWaiting from "./RequestsWaiting";
import TermCard from "./TermCard";
import { forYouEvents, fullNameQuestion, homeEvents, profileSteps, type ForYouEvent } from "./homeData";
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
 * in a file), the next events, the member's own applications and what is
 * missing from their profile.
 *
 * HOME STATES NO OUTCOME. What became of an application is said on the
 * person's own page and on the list of their applications, and the card here
 * is only the way to them. One thing is asked about it all the same.
 * Somebody decision day gave a place has no run until they are put on one,
 * and a member with no run is told "You’re not on a programme." So the
 * page asks `holdsPlace` (yes, no, or could not tell) and hands the member's
 * Home one thing: whether it may say that sentence. It may only on a "no".
 * Nothing in this file reads what became of an application.
 *
 * ONE THING MORE MAY BE SAID FOR A PLACE THE MEMBER HOLDS, and only what
 * `MAY_SHOW` in `tests/applications-place-in-the-member-area.test.mjs`
 * lists: before groups go out, "Your group’s on its way" with their
 * programme's name, when the group email comes and the way to week 1 once it
 * is open. It is worked out by week 1's door, never from what
 * this page reads of their applications. And "A survey for you" for each
 * survey waiting for them, which `surveysWaitingFor` alone decides.
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

/** The answer about a place when the member's applications could not be read. */
const COULD_NOT_TELL: HoldsPlace = "unknown";

const NO_CARDS: BeforeGroupsCard[] = [];

/**
 * "YOUR GROUP’S ON ITS WAY" for each place the
 * member holds before groups go out, with "Week 1 is open" once week 1's
 * door is open to them. Who gets one, and every word on it, is
 * `beforeGroupsCardsFor`'s, which asks week 1's door. A read that fails
 * draws no card and says nothing either way. What a card may say is held by
 * `tests/applications-place-in-the-member-area.test.mjs` (`MAY_SHOW`).
 */
async function onItsWayCards(user: SessionUser, now: Date): Promise<BeforeGroupsCard[]> {
  const db = getAdminDb();
  if (!db) return NO_CARDS;
  try {
    return await beforeGroupsCardsFor(db, user, now);
  } catch (err) {
    console.warn("[dashboard] could not read whether groups are on their way", err);
    return NO_CARDS;
  }
}

const NO_SURVEYS: SurveyCard[] = [];

const NO_FOR_YOU: ForYouEvent[] = [];

/**
 * "A SURVEY FOR YOU" for each survey waiting for the member: open,
 * sent to them and still theirs, and not answered, as `surveysWaitingFor`
 * says, with the one closing soonest first. Never how many others have
 * answered. A read that fails draws no card and says nothing either way.
 */
async function surveyCards(user: SessionUser, now: Date): Promise<SurveyCard[]> {
  const db = getAdminDb();
  if (!db) return NO_SURVEYS;
  try {
    return await surveysWaitingFor(db, user, now);
  } catch (err) {
    console.warn("[dashboard] could not read the surveys waiting for this member", err);
    return NO_SURVEYS;
  }
}

/**
 * THE PROGRAMMES CARD's rows, and what waits for an admin's reading, from the
 * Programmes list (`loadProgrammesList`), as the reader may see it. Never
 * rejects: a list that cannot be read is null, and Home then draws neither
 * the card nor a figure, and says nothing about it.
 */
async function programmesOf(db: Firestore, user: SessionUser, now: Date): Promise<HomeProgrammes | null> {
  try {
    return homeProgrammesOf(await loadProgrammesList(db, user, now, { groupsOnly: true }));
  } catch (err) {
    console.warn("[dashboard] could not read the programmes", err);
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
  // Nobody signed in is sent to sign in, as the (app) layout sends them, before anything is read.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The session is already in hand, so this is `markerIsLive` rather than a
  // second read of it.
  const viewingAs = markerIsLive(await getImpersonator(), user?.uid ?? null);
  const applications = user ? await applicationsOf(user.uid, viewingAs) : [];
  const now = new Date();
  const db = getAdminDb();
  // "Programmes" (an admin's) or "Your programmes" (a lead's): asked for only
  // for an admin or somebody named on a form, and not in a view-as session,
  // as Requests waiting is not. Started here and never awaited by the page:
  // the card sits in its own Suspense boundary and arrives when the list
  // does, so Home never waits on it, and an admin's Applications to read
  // takes its figure from the same answer when it comes.
  const programmes = user && db && !viewingAs && readsProgrammesFor(user) ? programmesOf(db, user, now) : null;
  const [term, events, steps, held, cards, surveys, askFullName, forYou, requestsWaiting] = await Promise.all([
    fetchPublicTerm(now),
    homeEvents(now),
    user ? profileSteps(user.uid) : null,
    // Whether they hold a place, asked of the rounds just listed. When that
    // list could not be read the page cannot tell, and says nothing either way.
    user && applications ? holdsPlace(user.uid, applications.map((row) => row.roundId)) : COULD_NOT_TELL,
    // "Your group’s on its way", with "Week 1 is open".
    user && !viewingAs ? onItsWayCards(user, now) : NO_CARDS,
    // "A survey for you". Nothing of the member's is read in a view-as session.
    user && !viewingAs ? surveyCards(user, now) : NO_SURVEYS,
    // "What's your full name?", once. Not in a view-as session: the card
    // writes to the account it is signed in as, which there is the member's.
    user && !viewingAs ? fullNameQuestion(user.uid) : null,
    // "For you": the events for chosen people they were invited to. Their own
    // list, so not read in a view-as session, as their surveys are not.
    user && !viewingAs ? forYouEvents(user.uid, now) : NO_FOR_YOU,
    // "Requests waiting", for an admin and a programme's lead: facilitators'
    // asks for a register to be corrected, decided on the Requests page. Not
    // in a view-as session, whose admin area is closed.
    user && db && !viewingAs ? requestsWaitingFor(db, user, now) : NO_REQUESTS_WAITING,
  ]);
  const given = firstName(user?.displayName);

  const programmesCard = programmes ? (
    <Suspense fallback={null}>
      <ProgrammesHome programmes={programmes} title={user?.role === "admin" ? "Programmes" : "Your programmes"} />
    </Suspense>
  ) : null;

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

  // Under the greeting on every form, the admins' too: for a week from the
  // date of a privacy policy version that changed how information is used,
  // the line saying the policy changed, until its reader dismisses it (which
  // version, from the date, is `policyUpdateLine`'s; the dismissal is
  // `PolicyUpdate`'s, in the browser); for a lead, "Your programmes" straight
  // after it (an admin's Home draws its card first in its own column, below
  // this); an event for chosen people they were
  // invited to ("For you"), the question about a full name while it is
  // unanswered, then the quiet install invitation (phones only, dismissible
  // once, hidden when already installed; see src/features/pwa/InstallCard.tsx).
  const invite = (
    <>
      <PolicyUpdate line={policyUpdateLine(now)} />
      {user?.role !== "admin" && programmesCard}
      <ForYou events={forYou} />
      {user && askFullName && <FullNameCard uid={user.uid} suggestion={askFullName.suggestion} />}
      <InstallCard />
      {user?.role !== "admin" && <RequestsWaiting count={requestsWaiting.count} corrections={requestsWaiting.corrections} />}
    </>
  );

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
          programmes={programmesCard}
          toRead={programmes ? programmes.then((answer) => answer?.toRead ?? null) : null}
          requestsWaiting={requestsWaiting.count}
          excusedWaiting={requestsWaiting.excused}
          visitsWaiting={requestsWaiting.visits}
          correctionsWaiting={requestsWaiting.corrections}
          movesWaiting={requestsWaiting.moves}
          messagesWaiting={requestsWaiting.messages}
          accessWaiting={requestsWaiting.access}
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
          holdsNoPlace={held === "no"}
          beforeGroups={cards}
          surveys={surveys}
          finishProfile={<FinishProfile steps={steps} />}
        />
      )}
    </div>
  );
}
