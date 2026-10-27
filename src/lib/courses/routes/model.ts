// Relative imports: `src/lib/firestore/courses.ts` reads this module, and
// every reader of that file (some suites' own loaders included) resolves it
// without the "@/" alias.
import { isValidDateKey } from "../weekPlan";
import { oneLine, proseChars, runsText, safeSourceUrl, sanitizeProse, sanitizeRuns, type Prose, type Run } from "../weekBlocks/prose";
import type { TextBlock, WeekBlock } from "../weekBlocks/model";

/**
 * A COURSE'S ROUTES AND DEADLINES, AS RECORDS (Zach, Mon 26 Oct: "build them
 * all"; Technical AI Safety's MAP, "Things this course needs" 4). Week 6's
 * "Where to go next" lists routes a fellow could take next (a sprint, a
 * fellowship, a grant), each with what it is and when its next round closes,
 * under a line saying when somebody last checked them. Deadlines change and
 * pass, so the list is a record on the COURSE (`CourseDoc.routes`), set by an
 * admin in one place (the course editor's card, through its route), and read
 * by every week that asks for it and by the facilitators' notes.
 *
 * THE SHAPE. A day it was all checked on ("as of", `checkedOn`), words before
 * the first group, the groups as the guide groups them ("Part-time,
 * alongside a degree"), each holding its routes, and words after the last
 * group (the guide's line on funding). A route: its name and link, what it
 * is, who it suits, its deadline (a London day) or "rolling", and its next
 * round in words, as written. Every field is data: no date, name or deadline
 * of any term is in code.
 *
 * WHEN A WEEK ASKS FOR THEM. A section of a week written as blocks holding a
 * table whose first column is "Route" is a routes section
 * (`isRoutesSection`): the guide's "Where to go next" in Technical AI Safety's
 * week 6. Once the run's course has routes, the page shows them there in
 * place of what the guide wrote under that heading; until then, the guide's
 * own tables, as written.
 *
 * A ROUTE PAST ITS DEADLINE SAYS SO (`routeStanding`), against the day it is
 * in London, never a date in code.
 *
 * Pure: no server import, so the course editor's card, the week page and
 * their tests read it alike. The Markdown is read on the server
 * (`markdown.ts`) and written anywhere (`write.ts`).
 */

/** Every cap, in one place. A paste over one is refused with a sentence, never cut short. */
export const ROUTES_LIMITS = {
  maxGroups: 8,
  maxRoutesPerGroup: 30,
  maxRoutes: 60,
  heading: 120,
  name: 120,
  what: 600,
  suits: 300,
  nextRound: 300,
  /** The words before the first group, and after the last. */
  textChars: 2000,
  /** A whole paste, before it is read. */
  markdownChars: 60_000,
} as const;

/** One route a fellow could take next. */
export type RouteRecord = {
  /** "SPAR". */
  name: string;
  /** Its own page: an https address. */
  url: string;
  /** What it is, as written: words with links. */
  what: Run[];
  /** Who it suits, as written, or none. */
  suits: Run[];
  /** The London day its round closes ("2026-11-01"), or null. */
  deadline: string | null;
  /** It takes people at any time. Never beside a deadline. */
  rolling: boolean;
  /** Its next round in words, as written ("Spring 2027 applications open “around December”"), or none. */
  nextRound: Run[];
};

/** Routes under one heading, as the guide groups them. */
export type RouteGroup = {
  /** "Part-time, alongside a degree", or "" for routes under no heading. */
  heading: string;
  routes: RouteRecord[];
};

export type CourseRoutes = {
  /** The day they were all checked ("as of"), a London day. */
  checkedOn: string;
  /** The words before the first group, after the "Checked on" sentence. */
  intro: Prose;
  groups: RouteGroup[];
  /** The words after the last group (the guide's line on funding). */
  after: Prose;
};

/** Where a route stands today. */
export type RouteStanding =
  | { kind: "rolling" }
  | { kind: "open"; deadline: string }
  | { kind: "closed"; deadline: string }
  | { kind: "none" };

/** Where a route stands on `todayKey` (a London day): a deadline that has gone by says so. */
export function routeStanding(route: Pick<RouteRecord, "deadline" | "rolling">, todayKey: string): RouteStanding {
  if (route.rolling) return { kind: "rolling" };
  if (route.deadline && isValidDateKey(route.deadline)) {
    return route.deadline < todayKey ? { kind: "closed", deadline: route.deadline } : { kind: "open", deadline: route.deadline };
  }
  return { kind: "none" };
}

/**
 * The routes still worth mentioning on `todayKey`: every route whose deadline
 * has not gone by, in the list's own order, each with its group's heading.
 * What the facilitators' notes ("Opportunities to mention this week") read.
 */
export function openRoutes(routes: CourseRoutes, todayKey: string): Array<{ heading: string; route: RouteRecord }> {
  return routes.groups.flatMap((group) =>
    group.routes.filter((route) => routeStanding(route, todayKey).kind !== "closed").map((route) => ({ heading: group.heading, route })),
  );
}

/** Every route of the list, in order. */
export function allRoutes(routes: CourseRoutes): RouteRecord[] {
  return routes.groups.flatMap((group) => group.routes);
}

/**
 * Is this block a section that lists routes (the guide's "Where to go next"
 * in Technical AI Safety's week 6): a section of the guide's own holding a
 * table whose first column is "Route"?
 */
export function isRoutesSection(block: WeekBlock): block is TextBlock {
  if (block.type !== "text" || block.role !== "section") return false;
  return block.body.some((paragraph) => paragraph.type === "table" && isRouteHeader(runsText(paragraph.header[0]?.runs ?? [])));
}

/** "Route", the first column of a table of routes, in any case. */
export function isRouteHeader(text: string): boolean {
  return /^routes?$/i.test(text.trim());
}

// ---------------------------------------------------------------------------
// The read side: a stored value, read inside the caps
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function isRaw(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(value: unknown, max: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

/** One stored route, or null when it has no name or no https link. */
function readRoute(raw: unknown): RouteRecord | null {
  if (!isRaw(raw)) return null;
  const name = oneLine(raw.name, ROUTES_LIMITS.name);
  const url = safeSourceUrl(raw.url) ?? "";
  if (!name || !url) return null;
  const rolling = raw.rolling === true;
  const deadline = !rolling && typeof raw.deadline === "string" && isValidDateKey(raw.deadline) ? raw.deadline : null;
  return {
    name,
    url,
    what: sanitizeRuns(raw.what, ROUTES_LIMITS.what),
    suits: sanitizeRuns(raw.suits, ROUTES_LIMITS.suits),
    deadline,
    rolling,
    nextRound: sanitizeRuns(raw.nextRound, ROUTES_LIMITS.nextRound),
  };
}

/**
 * A course's routes as stored, read inside the caps, or null for a course
 * with none (no value, no day it was checked, or no route with a name and a
 * link). The one way a stored value is read (`normalizeCourse`).
 */
export function normalizeCourseRoutes(raw: unknown): CourseRoutes | null {
  if (!isRaw(raw)) return null;
  const checkedOn = typeof raw.checkedOn === "string" && isValidDateKey(raw.checkedOn) ? raw.checkedOn : null;
  if (!checkedOn) return null;
  const groups: RouteGroup[] = [];
  let count = 0;
  for (const value of list(raw.groups, ROUTES_LIMITS.maxGroups)) {
    if (!isRaw(value)) continue;
    const routes: RouteRecord[] = [];
    for (const routeValue of list(value.routes, ROUTES_LIMITS.maxRoutesPerGroup)) {
      if (count >= ROUTES_LIMITS.maxRoutes) break;
      const route = readRoute(routeValue);
      if (route) {
        routes.push(route);
        count += 1;
      }
    }
    if (routes.length > 0) groups.push({ heading: oneLine(value.heading, ROUTES_LIMITS.heading), routes });
  }
  if (groups.length === 0) return null;
  return {
    checkedOn,
    intro: sanitizeProse(raw.intro, ROUTES_LIMITS.textChars),
    groups,
    after: sanitizeProse(raw.after, ROUTES_LIMITS.textChars),
  };
}

/**
 * What would stop a list being saved, each a sentence that says what to
 * change. Empty when it can be saved. The write route asks this of what it
 * read, and the read side above keeps a stored value inside the same caps.
 */
export function courseRoutesProblems(routes: CourseRoutes): string[] {
  const out: string[] = [];
  if (!isValidDateKey(routes.checkedOn)) out.push("Say the day you checked them, like “Checked on 25 October 2026.”");
  if (routes.groups.length === 0) out.push("There’s no table of routes: each group’s routes go in a table whose first column is Route.");
  if (routes.groups.length > ROUTES_LIMITS.maxGroups) out.push(`There are ${routes.groups.length} groups of routes; the most is ${ROUTES_LIMITS.maxGroups}.`);
  const total = allRoutes(routes).length;
  if (total > ROUTES_LIMITS.maxRoutes) out.push(`There are ${total} routes; the most is ${ROUTES_LIMITS.maxRoutes}.`);
  for (const group of routes.groups) {
    if (group.heading.length > ROUTES_LIMITS.heading) out.push(`The heading “${group.heading.slice(0, 40)}…” is ${group.heading.length} characters; the most is ${ROUTES_LIMITS.heading}.`);
    const table = group.heading ? `“${group.heading}”` : "A table";
    if (group.routes.length > ROUTES_LIMITS.maxRoutesPerGroup) {
      out.push(`${table} has ${group.routes.length} routes; the most is ${ROUTES_LIMITS.maxRoutesPerGroup}.`);
    }
    if (group.routes.length === 0) out.push(`${table} has no routes in it.`);
    for (const route of group.routes) {
      const label = route.name || "A route";
      if (!route.name) out.push("A route has no name: write its name as its link’s words.");
      if (route.name.length > ROUTES_LIMITS.name) out.push(`“${route.name.slice(0, 40)}…” is ${route.name.length} characters long; the most for a name is ${ROUTES_LIMITS.name}.`);
      if (!safeSourceUrl(route.url)) out.push(`“${label}” needs its link, starting https://.`);
      if (runsText(route.what).trim() === "") out.push(`Say what “${label}” is.`);
      for (const [field, runs, max] of [
        ["What it is", route.what, ROUTES_LIMITS.what],
        ["Who it suits", route.suits, ROUTES_LIMITS.suits],
        ["Next round", route.nextRound, ROUTES_LIMITS.nextRound],
      ] as const) {
        const chars = runsText(runs).length;
        if (chars > max) out.push(`“${label}”’s ${field} is ${chars} characters; the most is ${max}.`);
      }
      if (route.rolling && route.deadline) out.push(`“${label}” is rolling and has a deadline: give it one or the other.`);
      if (route.deadline && !isValidDateKey(route.deadline)) out.push(`“${label}”’s deadline isn’t a day.`);
    }
  }
  for (const [where, prose] of [
    ["before the first table", routes.intro],
    ["after the last table", routes.after],
  ] as const) {
    const chars = proseChars(prose);
    if (chars > ROUTES_LIMITS.textChars) out.push(`The words ${where} are ${chars} characters; the most is ${ROUTES_LIMITS.textChars}.`);
  }
  return out;
}
