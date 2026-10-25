import { NextResponse } from "next/server";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { dayLabel, didNotHappenLine, groupSessions, readRunRecords } from "@/lib/courses/programmeAttendance";
import { readReminderState, sendReminders } from "@/lib/courses/registerRemind";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { readCoursesConfig } from "@/lib/firestore/config";

/**
 * "Remind Grace" on a programme's Overview (board wk-overview): the register
 * reminder, now, to the facilitators of one group whose session has ended
 * and whose register is not finished. It emails them and nobody else.
 *
 * ## In this order
 *
 *  1. A view-as session is refused before anything else.
 *  2. Signed in, then the body, before any document is read: which group,
 *     which session, and how many people the button said it emails.
 *  3. The gate, from the form, the Overview's own (`loadProgrammeRun`): an
 *     admin and the programme's lead. A reviewer is refused; a form, a
 *     programme or a role that is not there is answered as nothing being
 *     there.
 *  4. The group must be one of the run's groups that still meet, the session
 *     one of its own, over, held, and its register not finished.
 *  5. Who it emails is worked out the way the reminder's job works it out
 *     (`readReminderState`), and must be the number the button showed; a
 *     different number is refused, so nobody is emailed by a count they did
 *     not see.
 *  6. Each facilitator's send claims the job's own marker, so nobody is
 *     reminded twice about one register, by a press or by the job.
 *
 * The answer is built field by field: how many were emailed, how many sends
 * failed, and the first names of those emailed.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

/** A week's session key: "w03", or "w03-2" for a week's second session. */
const SESSION_KEY = /^w\d{2,3}(?:-\d)?$/;

/** No group has more facilitators than this many (`courseGroups` caps it at five). */
const MOST_EMAILS = 20;

type Body = { groupId: string; sessionKey: string; emails: number };

function parseBody(raw: unknown): { ok: true; value: Body } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Say which group’s register to remind its facilitators about." };
  }
  const body = raw as Record<string, unknown>;
  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") {
    return { ok: false, error: "Say which group’s register to remind its facilitators about." };
  }
  const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey : "";
  if (!SESSION_KEY.test(sessionKey)) {
    return { ok: false, error: "Say which session’s register it is." };
  }
  const emails = body.emails;
  if (typeof emails !== "number" || !Number.isInteger(emails) || emails < 1 || emails > MOST_EMAILS) {
    return { ok: false, error: "Say how many people the reminder emails, as the button showed it." };
  }
  return { ok: true, value: { groupId, sessionKey, emails } };
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { groupId, sessionKey, emails } = parsed.value;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (outcome.status === "none") {
    return NextResponse.json({ error: "There is no programme here." }, { status: 404 });
  }
  if (outcome.status === "not-yours") {
    return NextResponse.json(
      { error: "Only the programme’s lead and admins can remind a group’s facilitators." },
      { status: 403 },
    );
  }
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json(
      { error: `${view.programmeName} doesn’t name a course run, so it has no registers.` },
      { status: 409 },
    );
  }

  const records = await readRunRecords(db, view.run.id);
  if (!records) {
    return NextResponse.json(
      { error: `The course run ${view.programmeName} names is no longer on the site.` },
      { status: 409 },
    );
  }
  const group = records.groups.find((entry) => entry.id === groupId);
  if (!group) {
    return NextResponse.json({ error: `That group isn’t one of ${view.programmeName}’s.` }, { status: 404 });
  }
  const now = new Date();
  const facts = [...groupSessions(records, group, now).values()].find(
    (entry) => entry.session.sessionKey === sessionKey,
  );
  if (!facts) {
    return NextResponse.json({ error: `That session isn’t one of ${group.name}’s.` }, { status: 404 });
  }
  const day = dayLabel(facts.session.dateKey);
  // The register's own word for its ending, as its page and the Overview say it.
  const ending = records.switches.scheduled ? "finished" : "pushed";
  if (!facts.held) {
    return NextResponse.json({ error: didNotHappenLine(group.name, facts.session.dateKey) }, { status: 409 });
  }
  if (facts.finished) {
    return NextResponse.json({ error: `${group.name}’s register for ${day} is already ${ending}.` }, { status: 409 });
  }
  if (!facts.ended || !facts.startsAt) {
    return NextResponse.json(
      { error: `${group.name}’s session on ${day} hasn’t finished yet, so there’s nothing to remind anybody about.` },
      { status: 409 },
    );
  }

  const state = await readReminderState(db, group, sessionKey, now);
  if (state.sendable.length === 0) {
    return NextResponse.json(
      {
        error: `Nobody is left to remind about ${group.name}’s register: its facilitators have been reminded already, or can’t be emailed.`,
      },
      { status: 409 },
    );
  }
  if (state.sendable.length !== emails) {
    return NextResponse.json(
      { error: "The number of people this reminder emails has changed. Reload the page to see who it reaches now." },
      { status: 409 },
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!appUrl) {
    return NextResponse.json(
      { error: "This copy of the site doesn’t know its own address, so the reminder can’t link to the register." },
      { status: 503 },
    );
  }

  const config = await readCoursesConfig(db);
  const sent = await sendReminders(db, {
    run: records.run,
    group,
    sessionKey,
    sessionStartsAt: facts.startsAt,
    sendable: state.sendable,
    switches: records.switches,
    config,
    appUrl,
    pressedByUid: actor.uid,
  });
  if (sent.emailed === 0 && sent.failed === 0) {
    // Every marker was taken between the count and the claim: by the job, or
    // by somebody else's press a moment ago.
    return NextResponse.json(
      { error: `${group.name}’s facilitators have just been reminded. Reload the page to see when.` },
      { status: 409 },
    );
  }
  if (sent.emailed === 0) {
    return NextResponse.json(
      { error: "The reminder couldn’t be sent just now. Try again in a few minutes." },
      { status: 502 },
    );
  }
  return NextResponse.json({ emailed: sent.emailed, failed: sent.failed, names: sent.names });
}
