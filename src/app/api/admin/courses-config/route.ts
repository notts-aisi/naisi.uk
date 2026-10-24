import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import {
  COURSE_CONFIG_PATH,
  DEFAULT_COURSES_CONFIG,
  NEXT_WEEK_EMAIL_MAX_DAYS,
  REGISTER_CHASE_MAX_HOURS,
  readCoursesConfig,
  type CoursesConfig,
} from "@/lib/firestore/config";

/**
 * Admin-only read and write of the `config/courses` knobs a human ever has
 * cause to change: the two feedback forms, how long an unfinished register
 * waits before its facilitators are reminded and before the lead and admins
 * get a task, and how many days before each session next week's email goes.
 *
 * ── WHY A ROUTE AT ALL ──────────────────────────────────────────────────────
 * `config` has no client read rule and no client write rule, in either
 * direction, and it stays that way: it sits beside `config/taskEmails` in a
 * collection whose whole posture is Admin SDK only. So the panel cannot read
 * or write the doc itself, and this route is the only door.
 *
 * ── WHY ONLY THESE FIELDS ───────────────────────────────────────────────────
 * The other three (`nextSessionMaxDays`, `unmarkedScanBudgetMs`,
 * `maxFollowUpTasksPerTick`) are scheduler cost dials. They have sensible
 * defaults, changing one wrongly degrades a background job in ways nobody
 * would connect to a form they filled in, and the console is the right place
 * for that. Exposing every field because they happen to share a document
 * would make the panel a way to break the tick.
 *
 * ── MERGE, NEVER REPLACE ────────────────────────────────────────────────────
 * The write is `set(..., { merge: true })` over the named keys. A full
 * overwrite from a panel that only knows some fields would silently reset the
 * ones it does not, which is exactly the class of bug the narrow surface
 * above is meant to avoid.
 *
 * ── THE TASK COMES AFTER THE REMINDER ───────────────────────────────────────
 * The two chases are read as a pair on the register page ("Not finished 36
 * hours after the session? ... At 60 hours, ..."), so a task hour at or
 * before the reminder hour is refused, checked against the stored value of
 * whichever of the two the request does not carry.
 *
 * This route ADMINISTERS configuration and lives under /api/admin, so nothing
 * here may be gated on the maintenance notice (tests/no-admin-gating.test.mjs).
 */

/** The fields an admin reads and writes here, and nothing else on the document. */
function view(config: CoursesConfig) {
  return {
    dropOutFeedbackUrl: config.dropOutFeedbackUrl,
    weeklyFeedbackUrl: config.weeklyFeedbackUrl,
    unmarkedRegisterGraceHours: config.unmarkedRegisterGraceHours,
    registerTaskHours: config.registerTaskHours,
    nextWeekEmailDaysBefore: config.nextWeekEmailDaysBefore,
  };
}

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const config = await readCoursesConfig(db);
  return NextResponse.json({
    ...view(config),
    defaults: view(DEFAULT_COURSES_CONFIG),
  });
}

export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  /**
   * The two link fields validate identically, so they share one check rather
   * than two copies that could drift. Named per field so an admin reads about
   * the box they typed in.
   */
  const readUrlField = (
    key: "dropOutFeedbackUrl" | "weeklyFeedbackUrl",
    what: string,
  ): string | NextResponse => {
    const raw = body[key];
    if (typeof raw !== "string") {
      return NextResponse.json({ error: `${what} must be text.` }, { status: 400 });
    }
    const url = raw.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        {
          error: `${what} needs to start with http:// or https://. Leave it empty to show no link at all.`,
        },
        { status: 400 },
      );
    }
    if (url.length > 500) {
      return NextResponse.json({ error: "That link is too long to store." }, { status: 400 });
    }
    return url;
  };

  if ("weeklyFeedbackUrl" in body) {
    // Rides the weekly reminder the attendance push sends, so an unset value
    // is not a broken state: the renderer drops the sentence whole.
    const url = readUrlField("weeklyFeedbackUrl", "The weekly feedback link");
    if (typeof url !== "string") return url;
    update.weeklyFeedbackUrl = url;
  }

  if ("dropOutFeedbackUrl" in body) {
    // The scheme is checked HERE as well as in `readCoursesConfig`, and the
    // duplication is deliberate: the reader's check is what makes rendering
    // the value in an href safe whatever is already stored, and this one is
    // what tells an admin they typed something wrong instead of silently
    // storing a value that will never appear.
    const url = readUrlField("dropOutFeedbackUrl", "The drop-out feedback link");
    if (typeof url !== "string") return url;
    update.dropOutFeedbackUrl = url;
  }

  /** A number of hours above 0 and up to the ceiling, or null. */
  const readHours = (key: "unmarkedRegisterGraceHours" | "registerTaskHours") => {
    const hours = body[key];
    return typeof hours === "number" &&
      Number.isFinite(hours) &&
      hours > 0 &&
      hours <= REGISTER_CHASE_MAX_HOURS
      ? hours
      : null;
  };

  if ("unmarkedRegisterGraceHours" in body) {
    const hours = readHours("unmarkedRegisterGraceHours");
    if (hours === null) {
      return NextResponse.json(
        {
          error: `The reminder needs a number of hours between 1 and ${REGISTER_CHASE_MAX_HOURS}.`,
        },
        { status: 400 },
      );
    }
    update.unmarkedRegisterGraceHours = hours;
  }

  if ("registerTaskHours" in body) {
    const hours = readHours("registerTaskHours");
    if (hours === null) {
      return NextResponse.json(
        {
          error: `The task needs a number of hours between 1 and ${REGISTER_CHASE_MAX_HOURS}.`,
        },
        { status: 400 },
      );
    }
    update.registerTaskHours = hours;
  }

  if ("nextWeekEmailDaysBefore" in body) {
    const days = body.nextWeekEmailDaysBefore;
    if (
      typeof days !== "number" ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > NEXT_WEEK_EMAIL_MAX_DAYS
    ) {
      return NextResponse.json(
        {
          error: `Next week's email needs a whole number of days between 1 and ${NEXT_WEEK_EMAIL_MAX_DAYS}.`,
        },
        { status: 400 },
      );
    }
    update.nextWeekEmailDaysBefore = days;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // The pair is checked as it will be STORED: a request that moves one of the
  // two is held against the other's current value.
  if ("unmarkedRegisterGraceHours" in update || "registerTaskHours" in update) {
    const stored = await readCoursesConfig(db);
    const reminder =
      typeof update.unmarkedRegisterGraceHours === "number"
        ? update.unmarkedRegisterGraceHours
        : stored.unmarkedRegisterGraceHours;
    const task =
      typeof update.registerTaskHours === "number"
        ? update.registerTaskHours
        : stored.registerTaskHours;
    if (task <= reminder) {
      return NextResponse.json(
        {
          error:
            "The task has to come after the reminder. Give the task more hours than the reminder.",
        },
        { status: 400 },
      );
    }
  }

  update.updatedAt = FieldValue.serverTimestamp();
  update.updatedByUid = actor.uid;
  update.updatedByName = actor.displayName ?? "";

  await db
    .collection(COURSE_CONFIG_PATH.collection)
    .doc(COURSE_CONFIG_PATH.doc)
    .set(update, { merge: true });

  const config = await readCoursesConfig(db);
  return NextResponse.json({ ok: true, ...view(config) });
}
