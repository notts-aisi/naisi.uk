import { NextResponse } from "next/server";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { own } from "@/lib/applications/keys";
import { rowMatches } from "@/lib/applications/people/filters";
import { loadProgrammePeople } from "@/lib/applications/people/load";
import { loadForm } from "@/lib/applications/repo";
import { readFreeReminders, sendFreeReminders } from "@/lib/courses/getReady/remind";
import { composeFreeReminder } from "@/lib/courses/getReady/words";
import { groupsGoOutDay } from "@/lib/courses/groupsGoOut";
import { readRunRecords } from "@/lib/courses/programmeAttendance";
import { readRunLead } from "@/lib/courses/programmeLead";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Remind 3 people" on a programme's Overview before its groups have met
 * (boards st-overview and st-overview-phone): an email, now, to each person
 * holding a place on the programme who has not said when they are free, while
 * that is still theirs to add. It emails them and nobody else.
 *
 * ## In this order
 *
 *  1. A view-as session is refused before anything else.
 *  2. Signed in, then the body, before any document is read: how many people
 *     the button said it emails.
 *  3. The gate, from the form, the Overview's own (`loadProgrammeRun`): an
 *     admin and the programme's lead. A reviewer is refused; a form, a
 *     programme or a role that is not there is answered as nothing being
 *     there.
 *  4. Only a fellowship's people add when they are free after the form.
 *  5. Who it emails is worked out as the card works it out (the People tab's
 *     own "Not said when they’re free", less anybody Publish has told, with
 *     no address, or reminded today: `readFreeReminders`), and must be the
 *     number the button showed; a different number is refused, so nobody is
 *     emailed by a count they did not see.
 *  6. Each reminder claims its person's marker for the day before it goes,
 *     so nobody is reminded twice in a day by two presses.
 *
 * The answer is built field by field: how many were emailed, how many sends
 * failed, and the first names of those emailed.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

/** No programme holds more places than this many: a ceiling on a body, not a setting. */
const MOST_EMAILS = 500;

function parseEmails(raw: unknown): number | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const emails = (raw as Record<string, unknown>).emails;
  return typeof emails === "number" && Number.isInteger(emails) && emails >= 1 && emails <= MOST_EMAILS ? emails : null;
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
  const emails = parseEmails(raw);
  if (emails === null) {
    return NextResponse.json({ error: "Say how many people the reminder emails, as the button showed it." }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (outcome.status === "none") {
    return NextResponse.json({ error: "There is no programme here." }, { status: 404 });
  }
  if (outcome.status === "not-yours") {
    return NextResponse.json(
      { error: "Only the programme’s lead and admins can remind people to say when they’re free." },
      { status: 403 },
    );
  }
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json(
      { error: `${view.programmeName} doesn’t name a course run, so nobody can be put in a group yet.` },
      { status: 409 },
    );
  }
  const [records, form] = await Promise.all([readRunRecords(db, view.run.id), loadForm(db, view.roundId)]);
  const programme = form ? own(form.programmes, view.programmeId) : undefined;
  if (!records || !programme) {
    return NextResponse.json({ error: `The course run ${view.programmeName} names is no longer on the site.` }, { status: 409 });
  }
  if (programme.kind !== "fellowship") {
    return NextResponse.json(
      { error: "Only a fellowship’s people add when they’re free after the form, so there’s nobody to remind." },
      { status: 409 },
    );
  }

  const now = new Date();
  const people = await loadProgrammePeople(db, actor, view.roundId, view.programmeId);
  const notSaid = people.status === "ok" ? people.view.rows.filter((row) => rowMatches(row, "not-said-free")) : [];
  const reminders = await readFreeReminders(db, records.run.id, notSaid, true, now);
  if (reminders.sendable.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nobody is left to remind: everyone who hasn’t said when they’re free has been reminded today, has been told their group, or can’t be emailed.",
      },
      { status: 409 },
    );
  }
  if (reminders.sendable.length !== emails) {
    return NextResponse.json(
      { error: "The number of people this reminder emails has changed. Reload the page to see who it reaches now." },
      { status: 409 },
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!appUrl) {
    return NextResponse.json(
      { error: "This copy of the site doesn’t know its own address, so the reminder can’t link to the application." },
      { status: 503 },
    );
  }
  const lead = await readRunLead(db, view.run.id);
  const groupsGoOut = groupsGoOutDay(records.run.groupsGoOutOn, londonDateKey(now));
  const link = `${appUrl}/applications/${encodeURIComponent(view.roundId)}/free`;

  const sent = await sendFreeReminders(db, {
    runId: view.run.id,
    sendable: reminders.sendable,
    compose: (person) =>
      composeFreeReminder({
        firstName: person.firstName,
        shortName: programme.shortName,
        groupsGoOut,
        link,
        leadName: lead?.firstName ?? "",
      }),
    actorUid: actor.uid,
    now,
  });
  if (sent.emailed === 0 && sent.failed === 0) {
    // Every marker was taken between the count and the claim, by another press.
    return NextResponse.json(
      { error: "They’ve just been reminded. Reload the page to see who is left." },
      { status: 409 },
    );
  }
  if (sent.emailed === 0) {
    return NextResponse.json({ error: "The reminder couldn’t be sent just now. Try again in a few minutes." }, { status: 502 });
  }
  return NextResponse.json({ emailed: sent.emailed, failed: sent.failed, names: sent.names });
}
