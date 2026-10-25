import "server-only";
import type { Firestore } from "firebase-admin/firestore";

/**
 * `config/courses`: the courses feature's runtime knobs, in the existing
 * server-only `config` collection alongside `config/taskEmails`.
 *
 * ADMIN SDK ONLY, both ways. The collection has no client read rule and now
 * carries an explicit `match /config/{doc} { allow read, write: if false; }`
 * block so the lockdown is visible in the rules file rather than inferred
 * from deny-by-default (the `pushSubscriptions` precedent). Every field has a
 * default that keeps the platform working when it is absent.
 *
 * MISSING MEANS DEFAULTS, never "feature off". The whole doc is optional and
 * so is every field in it, following the `readTaskEmailConfig` rule, for
 * the same reason: a fresh Firestore project must behave like a working
 * one, and a mistyped key must degrade to the documented number rather
 * than to zero.
 */

export const COURSE_CONFIG_PATH = {
  collection: "config",
  doc: "courses",
} as const;

export type CoursesConfig = {
  /**
   * How long after a session ENDS a register may stay unfinished before its
   * facilitators get one reminder email (the `courses-register-reminders`
   * job, which ships switched off). Long enough that an evening session
   * finished the next morning is not chased.
   *
   * The key is older than the reminder: it used to be when the admins' task
   * was raised. It kept its name and its number when the task moved later,
   * so a value an admin already stored still means "the first chase".
   */
  unmarkedRegisterGraceHours: number;
  /**
   * How long after a session ENDS a register may stay unfinished before the
   * `courses-unmarked-registers` job raises a task for the lead of the
   * programme that names the run, and the admins. Always later than the
   * reminder above: the route refuses a value that is not.
   */
  registerTaskHours: number;
  /**
   * How many days before each of a group's sessions that group is sent next
   * week's email (its time, room and reading), at the session's own time of
   * day in London. Read by the `courses-next-week-email` job only, and only
   * while that job is switched on: while it is off, pushing the register
   * sends the email instead.
   *
   * WHOLE DAYS ON THE CALENDAR, never 24-hour blocks, so a Tuesday 6pm group
   * hears on the Sunday at 6pm on either side of a clock change.
   */
  nextWeekEmailDaysBefore: number;
  /**
   * The anonymous feedback form a member is offered when they drop out.
   * Empty = no link shown, which is a complete state: the drop-out still
   * works, it just asks for nothing.
   *
   * ALWAYS `http://` or `https://` or empty; see `readCoursesConfig`.
   */
  dropOutFeedbackUrl: string;
  /**
   * The weekly feedback form the attendance push links to, resolved into the
   * nudge email's `{feedbackUrl}` token.
   *
   * Empty = the paragraph carrying the token is dropped from the email
   * whole, which is the renderer's existing degradation rule and a complete
   * state: the reminder still goes out, it just asks for nothing. That is
   * why this can ship before the survey machinery that will own the real
   * link exists.
   *
   * ALWAYS `http://` or `https://` or empty; see `readCoursesConfig`.
   */
  weeklyFeedbackUrl: string;
  /**
   * How far ahead a scan may look for a group's next session, bounding the
   * work a run whose dates were typed a year out can generate.
   *
   * NOTHING READS IT TODAY. The unmarked-register job it was reserved for
   * ended up scanning BACKWARDS over a 24-hour band behind the grace rather
   * than forwards from now, and a band bounds the work on its own: a session
   * dated a year out is simply not in it. The field is kept because it is
   * already in the contract and a forward-looking job (the break-return
   * notice) is the obvious next reader, but it is honest about being unused
   * rather than quietly implying a limit that is not being applied.
   */
  nextSessionMaxDays: number;
  /**
   * Wall-clock budget for one unmarked-register scan. The scan runs inside a
   * shared scheduler tick with a hard request ceiling above it, so it has to
   * be able to stop early and leave the rest for the next tick.
   *
   * The default is well under the 28s the tick gives its whole job list, and
   * it is meant to SHRINK as jobs are added: one job that can spend most of
   * the list's budget is one that starves every job registered after it.
   */
  unmarkedScanBudgetMs: number;
  /**
   * Ceiling on follow-up tasks minted in one tick. A run with a broken
   * calendar can make every group look unmarked at once; a board buried under
   * a hundred identical tasks is not a warning, it is noise that gets muted.
   */
  maxFollowUpTasksPerTick: number;
};

export const DEFAULT_COURSES_CONFIG: CoursesConfig = Object.freeze({
  unmarkedRegisterGraceHours: 36,
  registerTaskHours: 60,
  // The board's "2 days before its session". Written here and nowhere else:
  // every other reader takes it from the stored setting or from this default.
  nextWeekEmailDaysBefore: 2,
  dropOutFeedbackUrl: "",
  weeklyFeedbackUrl: "",
  nextSessionMaxDays: 14,
  unmarkedScanBudgetMs: 12000,
  maxFollowUpTasksPerTick: 25,
});

/**
 * The stored feedback link, or "" when it is not one this app will render.
 *
 * A CONFIG DOC IS NOT A TRUSTED SOURCE OF HREFS. It is Admin-SDK-only today,
 * but the value ends up in an `href` on a page a member is looking at, and
 * `javascript:` and `data:` URLs in an href are script execution in the
 * member's session. Anchoring on `^https?://` is what makes "rendered
 * verbatim" safe to say, and it costs nothing: a real feedback form is a
 * web page. Anything else degrades to "" and the drop-out simply asks for
 * nothing, which is already a complete state.
 */
function externalUrlOrEmpty(v: unknown): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

function positiveNumber(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

function positiveInt(v: unknown, fallback: number): number {
  const n = positiveNumber(v, fallback);
  return Math.floor(n);
}

/**
 * The most hours either chase may wait: a fortnight. Past that a reminder or
 * a task is about a session nobody remembers, which is noise rather than a
 * nudge. The route refuses more; the reader below falls back on it.
 */
export const REGISTER_CHASE_MAX_HOURS = 336;

/**
 * The most days before a session next week's email may go. A group meets
 * weekly, so seven days before one session is the previous session's own
 * evening, before its register could even have been taken.
 */
export const NEXT_WEEK_EMAIL_MAX_DAYS = 6;

/** A whole number of days in 1 to the maximum, or the fallback. */
function daysBefore(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isInteger(v)) return fallback;
  return v >= 1 && v <= NEXT_WEEK_EMAIL_MAX_DAYS ? v : fallback;
}

/** Hours in (0, the maximum], or the fallback. */
function chaseHours(v: unknown, fallback: number): number {
  const n = positiveNumber(v, fallback);
  return n <= REGISTER_CHASE_MAX_HOURS ? n : fallback;
}

export async function readCoursesConfig(db: Firestore): Promise<CoursesConfig> {
  const snap = await db
    .collection(COURSE_CONFIG_PATH.collection)
    .doc(COURSE_CONFIG_PATH.doc)
    .get();
  if (!snap.exists) return { ...DEFAULT_COURSES_CONFIG };
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    unmarkedRegisterGraceHours: chaseHours(
      data.unmarkedRegisterGraceHours,
      DEFAULT_COURSES_CONFIG.unmarkedRegisterGraceHours,
    ),
    registerTaskHours: chaseHours(
      data.registerTaskHours,
      DEFAULT_COURSES_CONFIG.registerTaskHours,
    ),
    nextWeekEmailDaysBefore: daysBefore(
      data.nextWeekEmailDaysBefore,
      DEFAULT_COURSES_CONFIG.nextWeekEmailDaysBefore,
    ),
    // Scheme-checked, not merely type-checked: this one is rendered as an
    // href. See `externalUrlOrEmpty`.
    dropOutFeedbackUrl: externalUrlOrEmpty(data.dropOutFeedbackUrl),
    // Same treatment, and for a sharper reason: this one is substituted into
    // an email that reaches a whole cohort, where a bad href cannot be fixed
    // after the fact.
    weeklyFeedbackUrl: externalUrlOrEmpty(data.weeklyFeedbackUrl),
    nextSessionMaxDays: positiveInt(
      data.nextSessionMaxDays,
      DEFAULT_COURSES_CONFIG.nextSessionMaxDays,
    ),
    unmarkedScanBudgetMs: positiveInt(
      data.unmarkedScanBudgetMs,
      DEFAULT_COURSES_CONFIG.unmarkedScanBudgetMs,
    ),
    maxFollowUpTasksPerTick: positiveInt(
      data.maxFollowUpTasksPerTick,
      DEFAULT_COURSES_CONFIG.maxFollowUpTasksPerTick,
    ),
  };
}
