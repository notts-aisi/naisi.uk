import "server-only";
import { listPublishedEvents } from "@/features/events/fetchEvents";
import { degreeOf } from "@/features/profile/studyChange";
import { addDaysToKey, londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import { publicLocationText } from "@/lib/events/location";
import { eventReach, isForChosenPeople } from "@/lib/events/reach";
import { getAdminDb } from "@/lib/firebase/admin";
import { EVENT_INVITATIONS_COLLECTION } from "@/lib/firestore/eventInvitations";
import { normalizeEvent, normalizeRsvp } from "@/lib/firestore/events";
import { FIELD_LIMITS, normalizeUser, STATUSES_WITH_GRADUATION } from "@/lib/firestore/users";
import { dayRange, instantClock, tilePartsOf, type TileParts } from "./homeWords";

/**
 * What Home reads on the server, projected to the fields its cards print.
 *
 * Nothing here returns a stored document. An event leaves as a title, a date,
 * a time and the PUBLIC text of where it is; a profile leaves as four yes or
 * no answers, and whether to ask for a full name. The page hands these to its cards, and some of those run in the
 * browser, where every prop is in the page's HTML.
 */

/** One event as a Home card names it. */
export type HomeEvent = {
  eventId: string;
  title: string;
  tile: TileParts;
  /** The start, as an ISO instant, for the tile's `<time>`. */
  startsAt: string;
  /** "6pm". */
  clock: string;
  /** Where it is, as anybody may be told. Empty when nothing may be said. */
  place: string;
  /** For people with a NAISI account: the card says "Account needed". */
  accountNeeded: boolean;
  /** A drop-in: nobody signs up, and its capacity is ignored. */
  dropIn: boolean;
  /** Places an event with a limit still has. Null when it has no limit. */
  placesLeft: number | null;
  /** True when a full event takes names for its waiting list. */
  waitingList: boolean;
  /** Everybody who has asked for a place and holds or awaits one. */
  signedUp: number;
  limit: number | null;
  /** Whether it starts in the London week (Monday to Sunday) that holds now. */
  thisWeek: boolean;
  /** Whether it has started already. Only this week's events can have. */
  started: boolean;
};

export type HomeWeek = {
  /** "12 to 18 Oct". */
  range: string;
  /** The instants the London week starts and ends, as ISO strings. */
  startsAt: string;
  endsAt: string;
  events: HomeEvent[];
};

export type HomeEvents = {
  /** What is still to come, soonest first. */
  upcoming: HomeEvent[];
  week: HomeWeek;
};

/** How many upcoming events a Home card lists before "All events" takes over. */
const MAX_UPCOMING = 4;

/**
 * The published events Home shows a signed-in member.
 *
 * Events for people with a NAISI account are included: everybody who reaches
 * Home is an approved member. Events for chosen people are not: the published
 * list leaves them out, and an invited person finds theirs in "For you"
 * (`forYouEvents`). Where an event is held is `publicLocationText`, the same
 * answer the public list gives, so a hidden room stays hidden here too.
 *
 * A failed read is an empty list. Home is still a page without its events.
 */
export async function homeEvents(now: Date): Promise<HomeEvents> {
  const todayKey = londonDateKey(now);
  // Date keys parse at UTC midnight, so `getUTCDay()` is the civil weekday.
  const weekday = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const mondayKey = addDaysToKey(todayKey, -((weekday + 6) % 7));
  const sundayKey = addDaysToKey(mondayKey, 6);
  const weekStart = londonWallClockToInstant(mondayKey, "00:00").getTime();
  const weekEnd = londonWallClockToInstant(addDaysToKey(mondayKey, 7), "00:00").getTime();
  const week = {
    range: dayRange(mondayKey, sundayKey) ?? "",
    startsAt: new Date(weekStart).toISOString(),
    endsAt: new Date(weekEnd).toISOString(),
  };

  let events: Awaited<ReturnType<typeof listPublishedEvents>>;
  try {
    events = await listPublishedEvents();
  } catch (err) {
    console.warn("[dashboard] could not read the events", err);
    return { upcoming: [], week: { ...week, events: [] } };
  }

  const nowMs = now.getTime();
  const rows: HomeEvent[] = [];
  for (const event of events) {
    if (event.archived || !event.startAt) continue;
    const start = event.startAt.getTime();
    const thisWeek = start >= weekStart && start < weekEnd;
    if (start < nowMs && !thisWeek) continue;
    const confirmed = event.rsvpCountConfirmed ?? 0;
    const limit = event.noSignup ? null : event.capacity;
    rows.push({
      eventId: event.id,
      title: event.title || "Untitled event",
      tile: tilePartsOf(event.startAt),
      startsAt: event.startAt.toISOString(),
      clock: instantClock(event.startAt),
      place: publicLocationText(event),
      accountNeeded: eventReach(event) === "listed-account",
      dropIn: event.noSignup,
      placesLeft: limit === null ? null : Math.max(0, limit - confirmed),
      waitingList: event.waitlistEnabled,
      signedUp: confirmed + (event.rsvpCountPending ?? 0),
      limit,
      thisWeek,
      started: start < nowMs,
    });
  }
  rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    upcoming: rows.filter((row) => !row.started).slice(0, MAX_UPCOMING),
    week: { ...week, events: rows.filter((row) => row.thisWeek) },
  };
}

/** An event for chosen people this person is invited to, as the "For you" card names it. */
export type ForYouEvent = {
  eventId: string;
  title: string;
  /** "Thu 26 Nov, 7pm". */
  when: string;
  /** Where it is, as anybody may be told: an invitation is not a place yet. */
  place: string;
  /** The programme it is part of, or null. */
  programme: string | null;
  /** A drop-in: there is no place to ask for. */
  dropIn: boolean;
  /** Where their own sign-up stands, or null when they have not asked. */
  asked: "pending" | "confirmed" | "waitlisted" | null;
};

/** How many "For you" cards Home draws. */
const MAX_FOR_YOU = 4;

/** How many of a person's invitations Home reads the events of. */
const MAX_INVITATIONS_READ = 100;

/** The sign-ups that are a place asked for or held. */
const LIVE_RSVP = new Set(["pending", "confirmed", "waitlisted"]);

/**
 * "FOR YOU": the published events for chosen people this person was invited
 * to, still to come or under way, soonest first.
 *
 * Read by the session's own uid and nothing a request carries: their
 * invitations (one equality on `uid`), the events they name, and their own
 * sign-up to each (two equalities, as the sign-up route asks). What leaves is
 * the title, the day and time, the PUBLIC place (`publicLocationText`: the
 * exact room of a hidden location is a confirmed place's, and an invitation
 * is not one yet), the programme's name, and where their own sign-up stands.
 *
 * A failed read is an empty list: Home is still a page without the card.
 */
export async function forYouEvents(uid: string, now: Date): Promise<ForYouEvent[]> {
  const db = getAdminDb();
  if (!db) return [];
  try {
    const invitations = await db.collection(EVENT_INVITATIONS_COLLECTION).where("uid", "==", uid).get();
    // The bound is on the read, not a choice of events: somebody is invited
    // to a handful a term, so a hundred covers years of them, past ones too.
    const ids = [
      ...new Set(
        invitations.docs.flatMap((doc) => {
          const data = doc.data() ?? {};
          return data.uid === uid && typeof data.eventId === "string" && data.eventId ? [data.eventId] : [];
        }),
      ),
    ].slice(0, MAX_INVITATIONS_READ);
    if (ids.length === 0) return [];
    const snaps = await db.getAll(...ids.map((id) => db.collection("events").doc(id)));
    const events = snaps
      .filter((snap) => snap.exists)
      .map((snap) => normalizeEvent(snap.id, snap.data() ?? {}))
      .filter((event) => {
        if (event.status !== "published" || event.archived || !isForChosenPeople(event) || !event.startAt) return false;
        // Still to come, or under way: gone from Home once it has ended.
        return (event.endAt ?? event.startAt).getTime() > now.getTime();
      })
      .sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0))
      .slice(0, MAX_FOR_YOU);
    return await Promise.all(
      events.map(async (event): Promise<ForYouEvent> => {
        const own = await db.collection("eventRsvps").where("eventId", "==", event.id).where("uid", "==", uid).get();
        const live = own.docs.map((doc) => normalizeRsvp(doc.id, doc.data() ?? {})).find((row) => LIVE_RSVP.has(row.status));
        const startAt = event.startAt as Date;
        return {
          eventId: event.id,
          title: event.title.trim() || "Untitled event",
          when: `${formatSiteDate(startAt, { weekday: "short", day: "numeric", month: "short" })}, ${instantClock(startAt)}`,
          place: publicLocationText(event),
          programme: event.programme?.name || null,
          dropIn: event.noSignup,
          asked: live ? (live.status as ForYouEvent["asked"]) : null,
        };
      }),
    );
  } catch (err) {
    console.warn("[dashboard] could not read the events this member is invited to", err);
    return [];
  }
}

/** Home asks for a full name: the name the box starts with, or null for an empty box. */
export type FullNameQuestion = { suggestion: string | null };

/**
 * Whether Home asks this person "What's your full name?", or null when it
 * does not: they have given one, or Home asked once already and they
 * answered or skipped it (`profile.fullNameAskedAt`), or the account could
 * not be read.
 *
 * Read by the session's own uid. What leaves is the person's own display name,
 * which for an account made with Google is Google's name for them, to start
 * the box with: offered to them, never saved for them.
 */
export async function fullNameQuestion(uid: string): Promise<FullNameQuestion | null> {
  const db = getAdminDb();
  if (!db) return null;
  try {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    const profile = normalizeUser(snap.id, data).profile;
    if (profile?.fullName?.trim() || profile?.fullNameAskedAt) return null;
    const display = typeof data.displayName === "string" ? data.displayName.trim() : "";
    return { suggestion: display ? display.slice(0, FIELD_LIMITS.fullName) : null };
  } catch (err) {
    console.warn("[dashboard] could not read whether to ask for a full name", err);
    return null;
  }
}

/** The four things "Finish your profile" ticks off. */
export type ProfileSteps = {
  name: boolean;
  study: boolean;
  graduation: boolean;
  universityEmail: boolean;
};

/**
 * Which parts of their own profile this member has filled in, or null when
 * that could not be read.
 *
 * Read by the session's own uid and nothing a request carries. Four booleans
 * leave: the card says what is missing and never repeats what is there.
 */
export async function profileSteps(uid: string): Promise<ProfileSteps | null> {
  const db = getAdminDb();
  if (!db) return null;
  try {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return null;
    const profile = normalizeUser(snap.id, snap.data() ?? {}).profile;
    // Somebody who is not on a degree has no graduation to give, so that step
    // is done for them. The two older field names still count as answers.
    const studying = !profile?.status || STATUSES_WITH_GRADUATION.includes(profile.status);
    return {
      name: Boolean(profile?.preferredName?.trim()),
      study: Boolean(degreeOf(profile).trim()),
      graduation:
        !studying || Boolean(profile?.expectedGraduation?.trim() || profile?.year?.trim()),
      universityEmail: Boolean(profile?.universityEmail?.trim()),
    };
  } catch (err) {
    console.warn("[dashboard] could not read this member's profile", err);
    return null;
  }
}
