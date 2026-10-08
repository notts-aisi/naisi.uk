import "server-only";
import { listPublishedEvents } from "@/features/events/fetchEvents";
import { degreeOf } from "@/features/profile/studyChange";
import { addDaysToKey, londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import { publicLocationText } from "@/lib/events/location";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeUser, STATUSES_WITH_GRADUATION } from "@/lib/firestore/users";
import { dayRange, instantClock, tilePartsOf, type TileParts } from "./homeWords";

/**
 * What Home reads on the server, projected to the fields its cards print.
 *
 * Nothing here returns a stored document. An event leaves as a title, a date,
 * a time and the PUBLIC text of where it is; a profile leaves as four yes or
 * no answers. The page hands these to its cards, and some of those run in the
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
  membersOnly: boolean;
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
 * Members-only events are included: everybody who reaches Home is an approved
 * member. Where an event is held is `publicLocationText`, the same answer the
 * public list gives, so a hidden room stays hidden here too.
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
      membersOnly: event.visibility === "members",
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
