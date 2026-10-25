import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import TeamEmail from "@/emails/TeamEmail";
import { readRunLead } from "@/lib/courses/programmeLead";
import { TEAMS_COLLECTION, normalizeTeam, type TeamsView } from "@/lib/courses/teams/model";
import {
  TEAMS_MARKERS,
  TEAMS_TEST_KIND,
  membersAsTold,
  teamsTellLockId,
  teamsTestId,
  type TeamMemberStanding,
} from "@/lib/courses/teams/told";
import {
  NO_RUN,
  RUN_GONE,
  teamEmailWords,
  testSubject,
  tellReportWords,
  type TeamEmailWords,
  type TellReport,
} from "@/lib/courses/teams/words";
import { sendEmail } from "@/lib/email/send";
import type { SessionUser } from "@/lib/firebase/session";
import { gateRefusal, type ActRefusal } from "./teamsAct";
import {
  buildTeamsView,
  hasTestedTeams,
  readTeamsContext,
  teamsGate,
  teamsRun,
  type TeamsContext,
} from "./teamsLoad";

/**
 * "TELL EVERYONE THEIR TEAM": the email to each person in a team, its test,
 * and the press.
 *
 * ## Who is emailed
 *
 * Each person in a team (`standingTeams`: taking part, told by Publish, in the
 * team's own group, with an account that stands) who has never been told
 * their team, or was told something that has changed since: what their email
 * would say now has another fingerprint than the one stored when it last
 * went (`toldFingerprint`: the team, its name and project line, and who else
 * is in it). So a second press after a move tells the person moved and the
 * people of the two teams they left and joined, and nobody else. Somebody in
 * no team is not emailed, and nor is anybody with no address on file: the
 * page names them.
 *
 * ## What it says
 *
 * Their team's name, its project line, and the other people in it by name,
 * never an address; signed with the first name of the programme's lead
 * (`teamEmailWords`). No time and no place. Replies go to ai-safety@uonsu.com.
 *
 * ## The order of a press
 *
 *  1. The presser has sent themselves a test of this email on this run (a
 *     marker per person, `teamstest__{runId}__{uid}`), or nothing goes.
 *  2. Every email is written before any is sent; one that cannot be written
 *     whole stops the press, and nothing is sent.
 *  3. The number on the button is sent back and compared: when the people
 *     owed an email are not that many any more, nothing is sent and the page
 *     is told the new number.
 *  4. One press at a time on a run (`teamstell__{runId}`, taken in a
 *     transaction, let go when the press ends or five minutes later).
 *  5. One message per person. After each one goes (or is held by this copy
 *     of the site, or stopped by the do-not-email list, neither of which a
 *     second press would change), its fingerprint is stored on the person's
 *     team, while they are still in it. A send that fails stores nothing, so
 *     the next press tries them again.
 */

/** Where replies to the team email go. */
export const TEAMS_REPLY_TO = "ai-safety@uonsu.com";

/**
 * Hard cap on emails per press: App Hosting's 60 second request budget, each
 * send being SMTP plus a pause. Whoever is past it is still owed, and the
 * next press carries on.
 */
export const MAX_TEAM_EMAILS_PER_PRESS = 200;

/** The pause between two sends, as Publish paces its own. */
const PACE_MS = 200;

/** How long a press in progress holds the run before another may take it. */
const PRESS_STALE_MS = 5 * 60_000;

const NO_ADDRESS_FOR_TEST = "Your account has no email address on file, so there is nowhere to send a test.";
const NOBODY_IN_A_TEAM = "Nobody is in a team yet, so there’s no email to test.";
const TEST_FIRST = "Send yourself a test first. Send a test to me does it.";
const PRESS_IN_PROGRESS =
  "Somebody is telling everyone their team on this programme right now. Wait a minute, then press again.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One person's email, written. */
type Letter = {
  member: TeamMemberStanding;
  name: string;
  /** Their own address, or "" when there is none on file. Never sent to a browser. */
  address: string;
  words: TeamEmailWords;
};

/** Every member's email, written whole, or the sentence that says why one cannot be. */
async function writeLetters(
  db: Firestore,
  context: TeamsContext,
  members: readonly TeamMemberStanding[],
): Promise<{ ok: true; letters: Letter[] } | ActRefusal> {
  const lead = members.length > 0 ? await readRunLead(db, context.run.id) : null;
  const programmeName = context.programme.shortName.trim() || context.programme.name.trim();
  const nameOf = (uid: string) => context.takingPart.get(uid)?.name ?? "";
  const letters: Letter[] = [];
  for (const member of members) {
    const account = context.accounts.get(member.uid);
    const words = teamEmailWords({
      firstName: account?.firstName ?? "",
      teamName: member.team.name,
      project: member.team.project,
      teammates: member.teammateUids.map(nameOf),
      programmeName,
      leadFirstName: lead?.firstName || null,
    });
    if (!words) {
      return {
        ok: false,
        status: 409,
        error: `The email to ${nameOf(member.uid)} can’t be written whole: their team has no name. Nothing was sent.`,
      };
    }
    letters.push({ member, name: nameOf(member.uid), address: account?.address ?? "", words });
  }
  return { ok: true, letters };
}

/** The run, read for a press or a test, after the gate. */
async function readForTelling(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<{ ok: true; context: TeamsContext } | ActRefusal> {
  const gate = await teamsGate(db, user, roundId, programmeId);
  if (!gate.ok) return gateRefusal(gate);
  const found = await teamsRun(db, gate.programme);
  if (!found.ok) return { ok: false, status: 409, error: found.blank === "no-run" ? NO_RUN : RUN_GONE };
  return { ok: true, context: await readTeamsContext(db, user, gate, found.run) };
}

/** The tab as it stands now. */
async function viewNow(db: Firestore, context: TeamsContext, now: Date): Promise<TeamsView> {
  const after = await readTeamsContext(
    db,
    context.user,
    { ok: true, form: context.form, programme: context.programme, viewer: context.viewer },
    context.run,
  );
  return buildTeamsView(after, await hasTestedTeams(db, context.run.id, context.user.uid), now);
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

export type TestOutcome =
  | { ok: true; delivery: "sent" | "held" | "suppressed"; subject: string; view: TeamsView }
  | (ActRefusal | { ok: false; status: 400; error: string });

/**
 * "Send a test to me": the email of the first person a press would tell (or,
 * when everybody has been told, of the first person in a team), marked as a
 * test, to the address on the caller's own session and nobody else. A test
 * that reached them is recorded, which lets them press.
 */
export async function sendTeamsTest(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date = new Date(),
): Promise<TestOutcome> {
  const address = (user.email ?? "").trim();
  if (!address) return { ok: false, status: 400, error: NO_ADDRESS_FOR_TEST };
  const read = await readForTelling(db, user, roundId, programmeId);
  if (!read.ok) return read;
  const { context } = read;
  const members = membersAsTold(context.standing);
  const first = members.find((member) => member.owed) ?? members[0];
  if (!first) return { ok: false, status: 409, error: NOBODY_IN_A_TEAM };
  const written = await writeLetters(db, context, [first]);
  if (!written.ok) return written;
  const { words } = written.letters[0];
  const subject = testSubject(words.subject);
  const result = await sendEmail({
    to: address,
    subject,
    react: TeamEmail({ subject, greeting: words.greeting, paragraphs: words.paragraphs, signOff: words.signOff }),
    replyTo: TEAMS_REPLY_TO,
    kind: "course-test",
    actorUid: user.uid,
    referenceId: context.run.id,
  });
  const delivery = result.delivered.length > 0 ? "sent" : result.suppressed.length > 0 ? "suppressed" : "held";
  if (delivery === "sent") {
    await db.collection(TEAMS_MARKERS).doc(teamsTestId(context.run.id, user.uid)).set({
      kind: TEAMS_TEST_KIND,
      runId: context.run.id,
      byUid: user.uid,
      at: FieldValue.serverTimestamp(),
    });
  }
  return { ok: true, delivery, subject, view: await viewNow(db, context, now) };
}

// ---------------------------------------------------------------------------
// The press
// ---------------------------------------------------------------------------

export type TellOutcome =
  | { ok: true; report: TellReport; said: string[]; view: TeamsView }
  | (ActRefusal & { emails?: number });

/** Take the run for one press, unless another press holds it and started under five minutes ago. */
async function takeTellLock(db: Firestore, runId: string, byUid: string): Promise<string | null> {
  const ref = db.collection(TEAMS_MARKERS).doc(teamsTellLockId(runId));
  const token = randomUUID();
  return db.runTransaction<string | null>(async (tx) => {
    const snap = await tx.get(ref);
    const held = snap.exists ? (snap.data() ?? {}) : null;
    const since = typeof held?.claimedAtMs === "number" ? held.claimedAtMs : null;
    if (held && since !== null && Date.now() - since < PRESS_STALE_MS) return null;
    tx.set(ref, { kind: "teams-press", runId, byUid, token, claimedAtMs: Date.now() });
    return token;
  });
}

/** Give the run back, if this press still holds it. */
async function releaseTellLock(db: Firestore, runId: string, token: string): Promise<void> {
  const ref = db.collection(TEAMS_MARKERS).doc(teamsTellLockId(runId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && (snap.data() ?? {}).token === token) tx.delete(ref);
  });
}

/** Store what one person was told, on their team, while they are still in it. */
async function recordTold(db: Firestore, member: TeamMemberStanding): Promise<void> {
  const ref = db.collection(TEAMS_COLLECTION).doc(member.team.id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const team = normalizeTeam(snap.id, snap.data() ?? {});
    if (!team.memberUids.includes(member.uid)) return;
    tx.update(ref, {
      toldAs: [
        ...team.toldAs.filter((told) => told.uid !== member.uid),
        { uid: member.uid, fingerprint: member.fingerprint },
      ],
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/** "Tell everyone their team". `request.emails` is the number the button showed. */
export async function tellEveryone(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  request: { emails: number },
  now: Date = new Date(),
): Promise<TellOutcome> {
  const read = await readForTelling(db, user, roundId, programmeId);
  if (!read.ok) return read;
  const { context } = read;
  if (!(await hasTestedTeams(db, context.run.id, user.uid))) return { ok: false, status: 409, error: TEST_FIRST };

  const owed = membersAsTold(context.standing).filter((member) => member.owed);
  const written = await writeLetters(db, context, owed);
  if (!written.ok) return written;
  const noAddress = written.letters.filter((letter) => !letter.address).map((letter) => letter.name);
  const batch = written.letters.filter((letter) => letter.address).slice(0, MAX_TEAM_EMAILS_PER_PRESS);
  if (batch.length !== request.emails) {
    return {
      ok: false,
      status: 409,
      error: `The number of people to email is now ${batch.length}. Check the teams, then press again.`,
      emails: batch.length,
    };
  }

  const token = await takeTellLock(db, context.run.id, user.uid);
  if (!token) return { ok: false, status: 409, error: PRESS_IN_PROGRESS };
  const report: TellReport = { sent: 0, held: 0, suppressed: 0, failed: [], noAddress };
  try {
    for (const [at, letter] of batch.entries()) {
      if (at > 0) await sleep(PACE_MS);
      const { words } = letter;
      let delivery: "sent" | "held" | "suppressed";
      try {
        const result = await sendEmail({
          to: letter.address,
          subject: words.subject,
          react: TeamEmail({ subject: words.subject, greeting: words.greeting, paragraphs: words.paragraphs, signOff: words.signOff }),
          replyTo: TEAMS_REPLY_TO,
          kind: "course-application",
          actorUid: user.uid,
          referenceId: context.run.id,
        });
        delivery = result.delivered.length > 0 ? "sent" : result.suppressed.length > 0 ? "suppressed" : "held";
      } catch (err) {
        // One bad send must not strand the rest. Nothing is stored, so the
        // next press tries this person again.
        console.error("[teams] email failed", context.run.id, letter.member.uid, err);
        report.failed.push(letter.name);
        continue;
      }
      report[delivery] += 1;
      try {
        await recordTold(db, letter.member);
      } catch (err) {
        // The email went; only the record of it did not. They are owed again,
        // and a second press would send it twice, which is the lesser harm.
        console.error("[teams] could not record who was told", context.run.id, letter.member.uid, err);
      }
    }
  } finally {
    await releaseTellLock(db, context.run.id, token).catch((err) => {
      console.error("[teams] could not give the run back", context.run.id, err);
    });
  }
  return { ok: true, report, said: tellReportWords(report), view: await viewNow(db, context, now) };
}
