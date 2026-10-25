/**
 * Week 3 of AGI Strategy's run, for the suites about a person's calendar link
 * (board st-calendar-phone): the link route, the feed a calendar app fetches,
 * the dialog and the button on the session ticket.
 *
 * Built on `tests/lib/memberPagesWorld.mjs` (the run in its third week as the
 * member's pages draw it, on the hand-over world's real handlers). On top of
 * that:
 *
 *  - GROUP B is the boards' group: Tuesdays at 6pm for two hours in Hallward
 *    B12, Rahul and Sofia, Chloe, Farah and Kofi in it, so Chloe's calendar is
 *    the board's "6 sessions on Tuesdays at 6pm, from Tue 3 Nov". Group A
 *    meets on Thursdays (Sofia), Group C on Wednesdays (Tom), Group D on
 *    Mondays (Grace).
 *  - SAM LEFT on Fri 6 Nov and keeps Publish's stamp, as leaving now keeps it
 *    (the seed underneath clears it, which is the older shape).
 *  - A SUITE CAN GIVE EVERY GROUP A LINK to join a call (`calls: true`), so
 *    "never the meeting link" is tested where there is one to leak. Without
 *    it the groups meet in their rooms, as the boards draw Group B.
 *  - Technical AI Safety names its own run, and a suite can put somebody on a
 *    group of it (`taisSeat`), for a person on two programmes.
 *
 * THE CLOCK is Tue 17 Nov 2026 at noon in London (GMT). A suite moves it with
 * `mock.timers`.
 *
 * `readCalendar` reads a calendar file as strictly as RFC 5545 asks (CRLF
 * lines, folds of at most 75 octets, components that open and close, the
 * properties every event must carry) and throws on anything else, so a suite
 * that reads one has checked that it parses.
 *
 * Every address is `example.com` or `naisi.invalid`.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { COURSE, groupDoc } from "./handoverWorld.mjs";
import { A, C, D, SAM_LEFT, SAM_SAID, TOLD_ON, account, enrolment } from "./hubAttendanceWorld.mjs";
import { SIX_WEEKS, slot } from "./leadWorld.mjs";
import { B, NOW, RUN, makeMemberPagesWorld, memberSeed, textOf } from "./memberPagesWorld.mjs";

export { A, B, C, D, NOW, RUN, SAM_LEFT, SIX_WEEKS, TOLD_ON, account, enrolment, slot, textOf };

/** The site's own address in this world (the hand-over world sets it). */
export const SITE = "https://naisi.invalid";

/** The link every group's call is at, by group: a value no calendar may ever carry. */
export const CALL = {
  [A]: "https://meet.example.com/group-a-call",
  [B]: "https://meet.example.com/group-b-call",
  [C]: "https://meet.example.com/group-c-call",
  [D]: "https://meet.example.com/group-d-call",
};

/** Technical AI Safety's group, on Mondays at 5pm in Room T1. */
export const TAIS_GROUP = "tais-autumn-2026-mondays__grp00009";

/** When Group B was last changed, before any suite changes it. */
export const B_TOUCHED = new Date("2026-10-28T12:00:00Z");

/** Sam's seat as leaving now leaves it: withdrawn, the day, the reason, and Publish's stamp kept. */
export function samLeft() {
  return enrolment("sam", A, { status: "withdrawn", droppedOutAt: SAM_LEFT, dropOutReason: SAM_SAID });
}

/** A seat on Technical AI Safety's group, told. */
export function taisSeat(uid) {
  return { ...enrolment(uid, TAIS_GROUP), runId: RUN.tais, courseId: COURSE.tais };
}

/**
 * The world every calendar suite starts from. `calls` gives every group a
 * link to join a call; `over` adds or replaces whole documents.
 */
export function calendarSeed({ calls = false, over = {} } = {}) {
  const seed = memberSeed();
  seed[`courseEnrolments/${RUN.agi}__sam`] = samLeft();
  if (calls) {
    for (const id of [A, B, C, D]) {
      const path = `courseGroups/${id}`;
      seed[path] = { ...seed[path], session: { ...seed[path].session, meetingUrl: CALL[id] } };
    }
  }
  seed[`courseGroups/${B}`].updatedAt = B_TOUCHED;
  seed[`courseGroups/${TAIS_GROUP}`] = groupDoc({
    runId: RUN.tais,
    courseId: COURSE.tais,
    name: "Group T",
    facilitatorUids: ["grace"],
    session: slot({ weekday: 1, startTimeLocal: "17:00", location: "Room T1", meetingUrl: calls ? "https://meet.example.com/group-t-call" : null }),
  });
  seed["users/erin"] = account("erin", "Erin Walsh", "pending");
  return { ...seed, ...over };
}

/** The UID a session of a group has, as the feed works it out: its run, group and session key, hashed. */
export function uidOf(runId, groupId, sessionKey) {
  return `${createHash("sha256").update(`${runId}\n${groupId}\n${sessionKey}`).digest("hex").slice(0, 32)}@naisi.uk`;
}

/** An RFC 5545 text value, read back. */
function unescapeText(value) {
  return value.replace(/\\(\\|;|,|n|N)/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

/**
 * A calendar file read as strictly as RFC 5545 asks. Throws on: a line not
 * ended by CRLF, a bare LF or CR, a line longer than 75 octets, a component
 * that does not close, an unknown nesting, a calendar without VERSION and
 * PRODID, and an event without UID, DTSTAMP and DTSTART. Answers the
 * calendar's properties and each event's, by name, values read back.
 */
export function readCalendar(text) {
  if (typeof text !== "string" || !text.endsWith("\r\n")) throw new Error("the file does not end with CRLF");
  if (/[^\r]\n/.test(text) || /\r(?!\n)/.test(text)) throw new Error("a line break that is not CRLF");
  const physical = text.slice(0, -2).split("\r\n");
  const encoder = new TextEncoder();
  for (const line of physical) {
    if (encoder.encode(line).length > 75) throw new Error(`a line of more than 75 octets: ${line.slice(0, 40)}`);
  }
  // Unfold: a line starting with one space or tab continues the one before it.
  const lines = [];
  for (const line of physical) {
    if (/^[ \t]/.test(line)) {
      if (lines.length === 0) throw new Error("the file starts with a continuation");
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  const stack = [];
  let calendar = null;
  const events = [];
  let current = null;
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon <= 0) throw new Error(`not a content line: ${line}`);
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = head.split(";")[0].toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(name)) throw new Error(`a property name that is not one: ${name}`);
    if (name === "BEGIN") {
      if (value === "VCALENDAR" && stack.length === 0) {
        calendar = { props: new Map() };
        current = calendar;
      } else if (value === "VEVENT" && stack.length === 1 && stack[0] === "VCALENDAR") {
        current = { props: new Map() };
        events.push(current);
      } else {
        throw new Error(`BEGIN:${value} where it cannot open`);
      }
      stack.push(value);
      continue;
    }
    if (name === "END") {
      if (stack.pop() !== value) throw new Error(`END:${value} closes nothing open`);
      current = stack.length === 1 ? calendar : null;
      continue;
    }
    if (!current) throw new Error(`a property outside any component: ${name}`);
    if (current.props.has(name)) throw new Error(`${name} twice in one component`);
    current.props.set(name, { params: head.slice(name.length), value: unescapeText(value) });
  }
  if (stack.length !== 0 || !calendar) throw new Error("a component is left open");
  for (const required of ["VERSION", "PRODID"]) {
    if (!calendar.props.has(required)) throw new Error(`the calendar has no ${required}`);
  }
  for (const event of events) {
    for (const required of ["UID", "DTSTAMP", "DTSTART"]) {
      if (!event.props.has(required)) throw new Error(`an event has no ${required}`);
    }
    for (const stamp of ["DTSTAMP", "DTSTART", "DTEND", "LAST-MODIFIED"]) {
      const at = event.props.get(stamp)?.value;
      if (at !== undefined && !/^\d{8}T\d{6}Z$/.test(at)) throw new Error(`${stamp} is not a UTC date-time: ${at}`);
    }
  }
  const flat = (component) => Object.fromEntries([...component.props].map(([key, { value }]) => [key, value]));
  return { calendar: flat(calendar), calendarParams: calendar.props, events: events.map(flat) };
}

/** A UTC date-time in iCalendar form. */
export const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** The world, its routes and short ways to ask them. `key` names the handle on `globalThis` the stubs read. */
export async function makeCalendarWorld(key = "__calendar") {
  const made = await makeMemberPagesWorld(key);
  const { world, call, courseRoute, loadTs } = made;
  const routes = {
    ...made.routes,
    link: await courseRoute("calendar"),
    feed: await loadTs(join("app", "api", "courses", "calendar", "[token]", "sessions.ics", "route.ts")),
  };
  const cal = {
    feed: await loadTs(join("lib", "courses", "calendarFeed.ts")),
    link: await loadTs(join("lib", "courses", "calendarLink.ts")),
    words: await loadTs(join("lib", "courses", "calendarWords.ts")),
    ics: await loadTs(join("lib", "events", "ics.ts")),
    links: await loadTs(join("lib", "firestore", "calendarLinks.ts")),
  };
  const dialog = await loadTs(join("features", "courses", "weekly", "AddToCalendar.tsx"));

  /** Start again from a seed. */
  function reset(seed = calendarSeed()) {
    made.reset(seed);
  }

  /** The link route as `who`, with a body (`{ action }`), as the dialog asks it. */
  const ask = (who, body, options = {}) => call(who, routes.link.POST, {}, { body, course: true, ...options });

  /** The token in an address the link route answered. */
  const tokenOf = (url) => /\/api\/courses\/calendar\/([^/]+)\/sessions\.ics$/.exec(url ?? "")?.[1] ?? null;

  /** `who`'s link, opened as the dialog opens it: the route's answer and the token in it. */
  async function linkOf(who) {
    const answer = await ask(who, { action: "open" });
    return { answer, token: tokenOf(answer.body?.url) };
  }

  /**
   * The feed for a token, as a calendar app fetches it: no session, the
   * status, the headers and the body. A handler that throws is a 599.
   */
  async function fetchFeed(token) {
    world.user = null;
    world.course = true;
    try {
      const response = await routes.feed.GET(new Request(`${SITE}/api/courses/calendar/feed/sessions.ics`), {
        params: Promise.resolve({ token }),
      });
      return { status: response.status, headers: { ...response.headers }, body: String(response.body) };
    } catch (err) {
      return { status: 599, headers: {}, body: String(err?.stack ?? err) };
    } finally {
      world.course = false;
    }
  }

  /** `who`'s calendar, through their own link: made, fetched and read. */
  async function calendarOf(who) {
    const { token } = await linkOf(who);
    if (!token) throw new Error(`${who} was made no link`);
    const fetched = await fetchFeed(token);
    return { token, fetched, ...readCalendar(fetched.body) };
  }

  /** The dialog's content for a view, in words and markup. */
  function dialogBody(view, extra = {}) {
    const none = () => {};
    const html = renderToStaticMarkup(
      createElement(dialog.CalendarDialogBody, {
        view,
        confirming: false,
        copied: "no",
        onClose: none,
        onRetry: none,
        onCopy: none,
        onStartReplacing: none,
        onKeep: none,
        onReplace: none,
        ...extra,
      }),
    );
    return { html, text: textOf(html) };
  }

  return { ...made, routes, cal, dialog, reset, ask, tokenOf, linkOf, fetchFeed, calendarOf, dialogBody };
}
