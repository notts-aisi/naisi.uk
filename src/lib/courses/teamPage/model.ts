/**
 * A TEAM'S OWN PAGE (boards in-team, in-team-phone and en-handin-phone):
 * what the people in an incubator's team write there, and how a request to
 * write it is read.
 *
 * An incubator's people work in small teams inside its one weekly group
 * (`src/lib/courses/teams/`). Each team has a page of its own: its project,
 * a weekly check-in, the team's links and its one hand-in. What anybody in
 * the team writes there is seen by everybody in the team, the programme's
 * lead and admins, and the page says so beside what they write (privacy
 * policy v7, "Your team's page").
 *
 * ## The one collection: `courseTeamEntries/{entryId}`
 *
 * One document per thing written on a team's page, of three kinds:
 *
 *  - a week's CHECK-IN, one per team per taught week, at
 *    `{teamId}__checkin__wNN`: "What we did" and "What's in the way";
 *  - a LINK, as many as the team adds (up to a limit), at an id Firestore
 *    picks: a label ("Repo") and an https address;
 *  - the HAND-IN, one per team, at `{teamId}__handin`: a link, a summary of
 *    up to 200 words and, if the team wants, who did what.
 *
 * Every entry carries where it belongs (`runId`, `courseId`, `groupId`,
 * `teamId`), its `kind`, and who saved it last (`byUid`). The words are the
 * TEAM's: anybody in the team may change a check-in, remove a link or change
 * the hand-in, so an entry has no owner, only a last writer.
 *
 * WRITTEN ONLY by the routes under `/api/courses/runs/[runId]/team/`, on the
 * Admin SDK, for the people in the team. READ ONLY on the server, through
 * `./access.ts` and `./load.ts`, which decide who reads which team's page:
 * the team, the programme's lead and admins. `firestore.rules` refuses every
 * browser, admins and the team's own people included.
 *
 * WHAT TAKES IT AWAY: destroying the run (`src/lib/firestore/courseDeletion.ts`,
 * by `runId`), and nothing else. Deleting an account takes the person's uid
 * off every entry they saved last (`clearCourseTeamEntries` in
 * `src/lib/firestore/accountDeletion.ts`), and the words stay with the team,
 * as a group's register keeps its marks. Leaving keeps them with the team
 * too. A team the lead removes leaves its entries where they are, read by
 * nobody, until the run is destroyed.
 *
 * Pure: no reads, no writes, nothing server-only, so the pages' client code
 * may import the limits, the types and the parsers from here.
 */

export const TEAM_ENTRIES_COLLECTION = "courseTeamEntries";

/** How long each thing written on a team's page may be. Field limits, not settings. */
export const TEAM_PAGE_LIMITS = {
  /** Each of a check-in's two boxes, in characters. */
  checkIn: 1000,
  /** A link's label ("Repo", "Write-up"). */
  linkLabel: 40,
  /** An address, in characters. */
  url: 500,
  /** Links a team may have at once. */
  links: 12,
  /** The hand-in's summary, in words: board en-handin-phone's 200. */
  summaryWords: 200,
  /** The summary's text, in characters: a cap on what is stored, well above 200 words. */
  summary: 2000,
  /** "Who did what (optional)", in characters. */
  whoDidWhat: 1000,
} as const;

export type TeamEntryKind = "check-in" | "link" | "hand-in";

type EntryBase = {
  id: string;
  runId: string;
  courseId: string;
  groupId: string;
  teamId: string;
  /** Who saved it last, or null once their account has been deleted. */
  byUid: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type CheckInEntry = EntryBase & {
  kind: "check-in";
  /** The taught week it is for, 1 and up. */
  weekNumber: number;
  /** "What we did". */
  did: string;
  /** "What’s in the way". */
  inTheWay: string;
};

export type LinkEntry = EntryBase & {
  kind: "link";
  label: string;
  /** An https address. */
  url: string;
};

export type HandInEntry = EntryBase & {
  kind: "hand-in";
  /** An https address: the team's repo, document or page. */
  url: string;
  summary: string;
  whoDidWhat: string;
  /** When the team first handed in. `updatedAt` is when it last changed. */
  handedInAt: Date | null;
};

export type TeamEntry = CheckInEntry | LinkEntry | HandInEntry;

/** A week's check-in's id: one per team per taught week. */
export function checkInEntryId(teamId: string, weekNumber: number): string {
  return `${teamId}__checkin__w${String(weekNumber).padStart(2, "0")}`;
}

/** The team's one hand-in's id. */
export function handInEntryId(teamId: string): string {
  return `${teamId}__handin`;
}

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp?.toDate === "function" ? stamp.toDate() : null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * A stored entry, read, or null for one that cannot say whose team it is
 * on or what it is. A null entry is shown to nobody, which is the safe
 * direction for a row nobody can place.
 */
export function normalizeTeamEntry(id: string, data: Raw): TeamEntry | null {
  const runId = typeof data.runId === "string" ? data.runId : "";
  const teamId = typeof data.teamId === "string" ? data.teamId : "";
  if (!runId || !teamId) return null;
  const base: EntryBase = {
    id,
    runId,
    courseId: typeof data.courseId === "string" ? data.courseId : "",
    groupId: typeof data.groupId === "string" ? data.groupId : "",
    teamId,
    byUid: typeof data.byUid === "string" && data.byUid ? data.byUid : null,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
  switch (data.kind) {
    case "check-in": {
      const weekNumber = typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) ? data.weekNumber : 0;
      if (weekNumber < 1) return null;
      return {
        ...base,
        kind: "check-in",
        weekNumber,
        did: text(data.did, TEAM_PAGE_LIMITS.checkIn),
        inTheWay: text(data.inTheWay, TEAM_PAGE_LIMITS.checkIn),
      };
    }
    case "link": {
      const url = text(data.url, TEAM_PAGE_LIMITS.url);
      const label = text(data.label, TEAM_PAGE_LIMITS.linkLabel).trim();
      if (!label || httpsAddressProblem(url) !== null) return null;
      return { ...base, kind: "link", label, url: url.trim() };
    }
    case "hand-in": {
      const url = text(data.url, TEAM_PAGE_LIMITS.url);
      if (httpsAddressProblem(url) !== null) return null;
      return {
        ...base,
        kind: "hand-in",
        url: url.trim(),
        summary: text(data.summary, TEAM_PAGE_LIMITS.summary),
        whoDidWhat: text(data.whoDidWhat, TEAM_PAGE_LIMITS.whoDidWhat),
        handedInAt: tsToDate(data.handedInAt),
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Words and addresses, counted and checked the same way everywhere
// ---------------------------------------------------------------------------

/** Words in a piece of text: runs of non-space characters, as the box's counter counts them. */
export function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Why this is not an https address a person can open, or null when it is.
 * Only https, as the page asks; no name and password inside it; no spaces.
 */
export function httpsAddressProblem(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Paste the link, starting https://.";
  if (trimmed.length > TEAM_PAGE_LIMITS.url) return `That link is too long: keep it to ${TEAM_PAGE_LIMITS.url} characters.`;
  if (/\s/.test(trimmed)) return "That link has a space in it. Paste it again, starting https://.";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "That doesn’t look like a link. Paste it again, starting https://.";
  }
  if (url.protocol !== "https:" || !url.hostname) return "Use a link that starts https://.";
  if (url.username || url.password) return "That link has a name and password in it. Take them out, then save.";
  return null;
}

/** An address as the page shows it: without "https://" and a trailing slash. */
export function shownAddress(url: string): string {
  return url.trim().replace(/^https:\/\//i, "").replace(/\/$/, "");
}

/** "1,000": a whole number with its thousands marked, for a sentence about a limit. */
function withCommas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Text as it is kept: line endings made one kind, the ends trimmed. */
function kept(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

// ---------------------------------------------------------------------------
// Requests, checked before anything is read. Every refusal is a sentence.
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isRaw = (value: unknown): value is Raw => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export type CheckInInput = { weekNumber: number; did: string; inTheWay: string };

/** "Save update": the week it is for, and the two boxes. At least one has words. */
export function parseCheckIn(body: unknown): Parsed<CheckInInput> {
  if (!isRaw(body)) return { ok: false, error: "Write what you did or what’s in the way, then save." };
  const weekNumber = body.weekNumber;
  if (typeof weekNumber !== "number" || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 60) {
    return { ok: false, error: "That update isn’t for one of this programme’s weeks. Reload the page." };
  }
  if (typeof body.did !== "string" || typeof body.inTheWay !== "string") {
    return { ok: false, error: "Write what you did or what’s in the way, then save." };
  }
  const did = kept(body.did);
  const inTheWay = kept(body.inTheWay);
  if (did.length > TEAM_PAGE_LIMITS.checkIn || inTheWay.length > TEAM_PAGE_LIMITS.checkIn) {
    return { ok: false, error: `Each box takes up to ${withCommas(TEAM_PAGE_LIMITS.checkIn)} characters. Cut it down, then save.` };
  }
  if (!did && !inTheWay) return { ok: false, error: "Write what you did or what’s in the way, then save." };
  return { ok: true, value: { weekNumber, did, inTheWay } };
}

export type LinkInput = { label: string; url: string };

/** "Add a link": a label and an https address. */
export function parseLink(body: unknown): Parsed<LinkInput> {
  if (!isRaw(body) || typeof body.label !== "string" || typeof body.url !== "string") {
    return { ok: false, error: "Give the link a label and paste its address." };
  }
  const label = body.label.replace(/\s+/g, " ").trim();
  if (!label) return { ok: false, error: "Give the link a label, like Repo or Write-up." };
  if (label.length > TEAM_PAGE_LIMITS.linkLabel) {
    return { ok: false, error: `Keep the label to ${TEAM_PAGE_LIMITS.linkLabel} characters.` };
  }
  const problem = httpsAddressProblem(body.url);
  if (problem) return { ok: false, error: problem };
  return { ok: true, value: { label, url: body.url.trim() } };
}

export type HandInInput = { url: string; summary: string; whoDidWhat: string; shared: boolean };

/** "Hand in for the team": the link, the summary (up to 200 words), who did what, and the tick. */
export function parseHandIn(body: unknown): Parsed<HandInInput> {
  if (!isRaw(body) || typeof body.url !== "string" || typeof body.summary !== "string") {
    return { ok: false, error: "Add the link and the summary, then hand in." };
  }
  const problem = httpsAddressProblem(body.url);
  if (problem) return { ok: false, error: problem };
  const summary = kept(body.summary);
  if (!summary) return { ok: false, error: "Write the summary, then hand in." };
  if (summary.length > TEAM_PAGE_LIMITS.summary || countWords(summary) > TEAM_PAGE_LIMITS.summaryWords) {
    return { ok: false, error: `Keep the summary to ${TEAM_PAGE_LIMITS.summaryWords} words.` };
  }
  const whoRaw = body.whoDidWhat;
  if (whoRaw !== undefined && whoRaw !== null && typeof whoRaw !== "string") {
    return { ok: false, error: "Say who did what in words, or leave it empty." };
  }
  const whoDidWhat = kept(typeof whoRaw === "string" ? whoRaw : "");
  if (whoDidWhat.length > TEAM_PAGE_LIMITS.whoDidWhat) {
    return { ok: false, error: `Keep who did what to ${withCommas(TEAM_PAGE_LIMITS.whoDidWhat)} characters.` };
  }
  return { ok: true, value: { url: body.url.trim(), summary, whoDidWhat, shared: body.shared === true } };
}

export type HandInSettingsInput = { dueOn: string | null; showcaseWeek: number | null };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const at = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value;
}

/** The lead's hand-in dates: the day hand-ins are due and the week of the showcase, each a value or cleared. */
export function parseHandInSettings(body: unknown): Parsed<HandInSettingsInput> {
  if (!isRaw(body) || !("dueOn" in body) || !("showcaseWeek" in body)) {
    return { ok: false, error: "Say the day hand-ins are due and the showcase’s week, or clear them." };
  }
  const { dueOn, showcaseWeek } = body;
  if (!(dueOn === null || (typeof dueOn === "string" && isDateKey(dueOn)))) {
    return { ok: false, error: "Say the day hand-ins are due as a date, like 2027-02-18, or clear it." };
  }
  if (
    !(showcaseWeek === null || (typeof showcaseWeek === "number" && Number.isInteger(showcaseWeek) && showcaseWeek >= 1 && showcaseWeek <= 60))
  ) {
    return { ok: false, error: "Pick the showcase’s week from the list, or clear it." };
  }
  return { ok: true, value: { dueOn, showcaseWeek } };
}
