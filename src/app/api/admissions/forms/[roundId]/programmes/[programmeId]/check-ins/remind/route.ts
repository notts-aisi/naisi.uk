import { NextResponse } from "next/server";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { readRunRecords } from "@/lib/courses/programmeAttendance";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { sendFacilitatorReminder } from "@/lib/surveys/checkIns/facilitatorReminder";
import { facilitatorReminderPlan } from "@/lib/surveys/checkIns/weekTable";
import { FACILITATOR_REMINDER_REFUSAL as REFUSAL, reminderCountChangedWords } from "@/lib/surveys/checkIns/words";

/**
 * "Remind 2 facilitators" on a programme's Check-ins view (its Surveys tab):
 * one email to a group's live facilitators saying a session's check-in, or
 * its register, is not done, with the way to the register. It emails them and
 * nobody else, at most once a session a London day.
 *
 * ## In this order
 *
 *  1. A view-as session is refused before anything else.
 *  2. Signed in, then the body, before any document is read: which group,
 *     which session, and how many people the button said it emails.
 *  3. The gate, from the form (`loadProgrammeRun`), then an admin's alone:
 *     the table is never drawn for the programme's lead, who reads check-ins
 *     a whole week at a time and never a group's alone. A reviewer and the
 *     lead are refused; a form, a programme or a role that is not there is
 *     answered as nothing being there.
 *  4. The group must be one of the run's groups that still meet, the session
 *     one of its own, over, held, and something its facilitators can do must
 *     be left: its register not finished, or its check-in not opened while
 *     they can still open it (`facilitatorReminderPlan`, the table's own reading).
 *  5. Who it emails must be the number the button showed; a different number
 *     is refused, so nobody is emailed by a count they did not see.
 *  6. The day's marker is claimed before the first email (`sendFacilitatorReminder`), so
 *     two presses email once.
 *
 * The answer is built field by field: how many were emailed and how many
 * sends failed. Never an address or a uid.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

/** A session key: "w03", or "w03-2" for a week's second session. */
const SESSION_KEY = /^w\d{2,3}(?:-\d)?$/;

/** No group has more facilitators than this many. */
const MOST_EMAILS = 20;

type Body = { groupId: string; sessionKey: string; emails: number };

function parseBody(raw: unknown): Body | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey : "";
  const emails = body.emails;
  if (!groupId || groupId.includes("/") || groupId === "." || groupId === "..") return null;
  if (!SESSION_KEY.test(sessionKey)) return null;
  if (typeof emails !== "number" || !Number.isInteger(emails) || emails < 1 || emails > MOST_EMAILS) return null;
  return { groupId, sessionKey, emails };
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
  const body = parseBody(raw);
  if (!body) return NextResponse.json({ error: REFUSAL.body }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours" || outcome.view.viewer !== "admin") {
    return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });
  }
  const { view } = outcome;
  if (!view.run) return NextResponse.json({ error: REFUSAL.noRun }, { status: 409 });
  const records = await readRunRecords(db, view.run.id);
  if (!records) return NextResponse.json({ error: REFUSAL.noRun }, { status: 409 });
  const group = records.groups.find((entry) => entry.id === body.groupId);
  if (!group) return NextResponse.json({ error: REFUSAL.noGroup }, { status: 404 });

  const now = new Date();
  const plan = await facilitatorReminderPlan(db, { records, group, sessionKey: body.sessionKey, now });
  if (plan.state === "none") return NextResponse.json({ error: REFUSAL.noSession }, { status: 404 });
  if (plan.state === "nothing") return NextResponse.json({ error: REFUSAL.nothingLeft }, { status: 409 });
  if (plan.state === "reminded") return NextResponse.json({ error: REFUSAL.already }, { status: 409 });
  if (plan.recipients.length === 0) return NextResponse.json({ error: REFUSAL.nobody }, { status: 409 });
  if (plan.recipients.length !== body.emails) {
    return NextResponse.json({ error: reminderCountChangedWords(plan.recipients.length) }, { status: 409 });
  }
  const startsAt = plan.facts.startsAt;
  if (!startsAt) return NextResponse.json({ error: REFUSAL.noSession }, { status: 404 });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!appUrl) return NextResponse.json({ error: REFUSAL.noAddress }, { status: 503 });

  const sent = await sendFacilitatorReminder(db, {
    runId: records.run.id,
    group,
    sessionKey: body.sessionKey,
    sessionStartsAt: startsAt,
    need: plan.need,
    ended: records.switches.scheduled ? "finished" : "pushed",
    recipients: plan.recipients,
    appUrl,
    byUid: actor.uid,
    now,
  });
  if (!sent.ok) return NextResponse.json({ error: REFUSAL.already }, { status: 409 });
  if (sent.emailed === 0) return NextResponse.json({ error: REFUSAL.failed }, { status: 502 });
  return NextResponse.json({ emailed: sent.emailed, failed: sent.failed });
}
