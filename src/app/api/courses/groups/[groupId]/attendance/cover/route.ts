import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { groupNoticeWindow, sendGroupChangeNotice, type NoticeTally } from "@/lib/courses/groupChange/notice";
import { heldOnline } from "@/lib/courses/joiningOnline/model";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { didNotHappenLine } from "@/lib/courses/programmeAttendance";
import { displayNameOf, gateGroupRegister, isAddressableId } from "@/lib/courses/registerAccess";
import {
  GIVE_LIMITS,
  coverIsLive,
  coverUntil,
  holdsGivenCover,
  sessionHasEnded,
  startedByFacilitator,
} from "@/lib/courses/registerCover/model";
import { parseCoverPress } from "@/lib/courses/registerCover/parse";
import { approvedPerson, facilitatorsByFirstName, runsThingsOn, type CoverPerson } from "@/lib/courses/registerCover/people";
import { sessionInTransaction } from "@/lib/courses/registerCover/sessionInTransaction";
import {
  COVER_REFUSAL,
  GIVE_LIMIT_WORDS,
  coverCountChangedWords,
  coverEmailWords,
  coverNoticeWords,
  gaveDetail,
  tookDetail,
  type CoverSessionFacts,
} from "@/lib/courses/registerCover/words";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { updateEmailAudience, type UpdateRecipient } from "@/lib/courses/updates/audience";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { coverRegisterUrl, sendCoverGivenEmail, type CoverGivenOutcome } from "@/lib/email/coverGivenEmail";
import { DAY_MS, HOUR_MS, reserveNoticeSlots } from "@/lib/email/noticeCaps";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  COVER,
  FACILITATOR_RECORD,
  attendanceDocId,
  normalizeCourseAttendance,
} from "@/lib/firestore/courseAttendance";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { campusForWeek, sessionModeForWeek } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * TAKING A SESSION'S REGISTER IN A FACILITATOR'S PLACE, or GIVING ONE SESSION
 * TO SOMEBODY ELSE.
 *
 *   POST { weekNumber, occurrence?, person?, reason?, tell?, emailCount?, preview? }
 *
 *  - No `person`: "I'm covering it". The caller takes this one session's
 *    register (`cover.kind = "self"`), before any line is set.
 *  - `person`: "Someone else is covering". This one session's register, its
 *    check-in and its report go to that person (`cover.kind = "given"`),
 *    somebody who runs things on the programme (`runsThingsOn`: an admin, a
 *    committee member, the programme's lead, one of the run's track leads, a
 *    facilitator of one of the run's groups) but never the caller, until the
 *    end of the London day on which the later of now and the session's start
 *    falls. They are
 *    emailed (transactional, to them alone). With `tell`, the group's told
 *    people are sent a notice that they are running it, the count on the tick
 *    checked again first (409 with the new count); never the caller, never
 *    the person given it.
 *  - `preview: true` changes nothing and says whose place is taken, until
 *    when, both emails' words and how many the notice would reach.
 *
 * A new grant for the same session replaces the old one, and "I'm covering
 * it" replaces a grant; the same session given to the same person again,
 * while it holds, is a 409 that writes and sends nothing. The facilitators
 * whose place is taken are the group's facilitators with standing when it is
 * first taken (a replacement keeps them), and each is recorded as not there
 * unless they already have an entry, when it is taken or given before the
 * session ends; taken after it ended, nobody is recorded. One history row,
 * in the registers category. Neither email carries a meeting link.
 *
 * LIMITS: a give emails the person given it, so it is held to stored
 * counters, claimed before anything is written (`GIVE_LIMITS`): twelve by
 * one giver on one group in an hour, twenty on one group in a day, twelve to
 * one person in a day across every group (so handing one person the rest of
 * a ten-week term in one sitting is not refused), and, with `tell`, the group's ten
 * notices a day. Past any of them the give is refused in one sentence (429)
 * that says the session was not given, and nothing is written, claimed or
 * sent; past the group's notices, the sentence says the give goes without
 * the tick. A preview claims nothing.
 *
 * WHO: admins and the people leading the programme that names the run (its
 * lead, the run's track leads), who are not facilitators of the group: a
 * facilitator takes the register as usual. Everybody else is one 403, before
 * the body is read. View-as is refused first.
 *
 * REFUSED: a session the group does not hold; one called off; a finished
 * register; one that one of the group's facilitators has started; a session
 * given with no day to give it until; a person who is the caller, has no
 * approved account, runs nothing on the programme, or facilitates the group.
 */

type Answer = {
  ok: true;
  cover: { kind: "self" | "given"; byName: string; until: string | null };
  /** What the email to the person given the session did, or null when nobody was given it. */
  email: CoverGivenOutcome | "no-address" | null;
  /** What the notice to the group did, or null when it was not ticked. */
  notice: NoticeTally | null;
};

class CoverRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate, before the body ─────────────────────────────────────────────
  const gated = await gateGroupRegister(groupId, actor, db);
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status });
  if (gated.facilitates) return NextResponse.json({ error: COVER_REFUSAL.facilitates }, { status: 403 });
  if (!gated.isAdmin && !gated.leads) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { group, runId } = gated;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: COVER_REFUSAL.body }, { status: 400 });
  }
  const parsed = parseCoverPress(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const press = parsed.value;

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const session = resolveSessions(run, group).find(
    (each) => each.weekNumber === press.weekNumber && each.occurrence === press.occurrence,
  );
  if (!session) return NextResponse.json({ error: COVER_REFUSAL.session }, { status: 400 });
  if (session.cancelled) {
    return NextResponse.json({ error: didNotHappenLine(group.name.trim() || "This group", session.dateKey) }, { status: 409 });
  }

  const now = new Date();
  const { startsAt } = sessionInstants(session);
  const ref = db.collection("courseAttendance").doc(attendanceDocId(runId, group.id, session.weekNumber, session.occurrence));
  const groupName = group.name.trim() || "Your group";

  try {
    // ── The person given it ─────────────────────────────────────────────────
    let person: CoverPerson | null = null;
    let address = "";
    if (press.person !== null) {
      if (press.person === actor.uid) throw new CoverRefusal(COVER_REFUSAL.yourself, 400);
      person = await approvedPerson(db, press.person);
      if (!person) throw new CoverRefusal(COVER_REFUSAL.noAccount, 400);
      if (person.facilitates(group.facilitatorUids)) throw new CoverRefusal(COVER_REFUSAL.theyFacilitate, 400);
      // Somebody who runs things on the programme, never any account.
      if (!(await runsThingsOn(db, run, person))) throw new CoverRefusal(COVER_REFUSAL.notRunning, 400);
      address = person.address;
      if (!startsAt) throw new CoverRefusal(COVER_REFUSAL.undated, 400);
    }

    // ── The register as it stands ───────────────────────────────────────────
    const snap = await ref.get();
    const before = snap.exists ? normalizeCourseAttendance(snap.id, snap.data() ?? {}) : null;
    if (before?.pushedAt) throw new CoverRefusal(COVER_REFUSAL.finished, 409);
    if (startedByFacilitator(before, group.facilitatorUids)) throw new CoverRefusal(COVER_REFUSAL.started, 409);
    // The same session given to the same person again (a retry after a lost
    // answer, or the same pick twice): nothing is written, claimed or sent.
    if (!press.preview && person && holdsGivenCover(before?.cover ?? null, person.uid, now)) {
      throw new CoverRefusal(COVER_REFUSAL.alreadyGiven, 409);
    }

    // Whose place is taken: kept from a cover being replaced, else the
    // group's facilitators with standing now.
    const standing = await facilitatorsByFirstName(db, group);
    const covering = before?.cover
      ? standing.filter((each) => before.cover?.covering.includes(each.uid))
      : standing;
    const coveringUids = before?.cover ? before.cover.covering : standing.map((each) => each.uid);
    const coveringNames = covering.map((each) => each.firstName);
    const until = person ? coverUntil(now, startsAt) : null;

    // ── The words of both emails ─────────────────────────────────────────────
    const actorAccount = (await db.collection("users").doc(actor.uid).get()).data() ?? {};
    const giverFirst = firstNameOfUser(actorAccount) || (actor.displayName ?? "").trim().split(/\s+/)[0] || "";
    const facts: CoverSessionFacts = {
      groupName,
      weekNumber: session.weekNumber,
      dateKey: session.dateKey,
      startTimeLocal: session.session.startTimeLocal,
      durationMinutes: session.session.durationMinutes,
      room: session.session.location,
      // Held online for everybody, the way the rest of the site asks it: the
      // week's own mode, the campus for that week, and the room.
      online: heldOnline({
        mode: session.occurrence === 1 ? sessionModeForWeek(group, session.weekId) : null,
        campus: session.occurrence === 1 ? campusForWeek(group, session.weekId) : group.campus,
        room: session.session.location,
      }),
      today: session.dateKey === londonDateKey(now),
    };
    const email = person ? coverEmailWords(facts, giverFirst) : null;
    const notice = person ? coverNoticeWords(facts, { firstName: person.firstName, name: person.name, committee: person.committee }, coveringNames) : null;

    // ── Who the notice would reach: the group's told people, never the
    // caller, never the person given it ────────────────────────────────────
    let recipients: UpdateRecipient[] = [];
    let noticeRefused = false;
    if (person) {
      const audience = await updateEmailAudience(db, run, [group], "group", group.id, actor.uid);
      noticeRefused = audience.refused;
      recipients = audience.recipients.filter((each) => each.uid !== person?.uid);
    }

    if (press.preview) {
      // Who has the session now, by the name they go by, so the panel can say
      // so before anybody presses: the same name the group's page shows.
      const holder = before?.cover ? (await db.collection("users").doc(before.cover.byUid).get()).data() : undefined;
      return NextResponse.json({
        ok: true,
        preview: {
          kind: person ? "given" : "self",
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          dateKey: session.dateKey,
          startTimeLocal: session.session.startTimeLocal,
          covering: covering.map((each) => ({ uid: each.uid, name: each.name })),
          replaces: before?.cover
            ? {
                kind: before.cover.kind,
                byUid: before.cover.byUid,
                name: holder ? displayNameOf(holder) : "NAISI member",
                live: coverIsLive(before.cover, now),
              }
            : null,
          until: until ? until.toISOString() : null,
          person: person ? { uid: person.uid, name: person.name, emailed: address ? 1 : 0 } : null,
          email,
          notice: notice ? { ...notice, emails: noticeRefused ? 0 : recipients.length, refused: noticeRefused } : null,
          at: now.toISOString(),
        },
      });
    }

    // ── The count on the tick, checked before anything changes ─────────────
    if (press.tell) {
      if (noticeRefused) throw new CoverRefusal(COVER_REFUSAL.overCap, 400);
      if (recipients.length === 0) throw new CoverRefusal(COVER_REFUSAL.nobodyToEmail, 400);
      if (recipients.length !== press.emailCount) {
        throw new CoverRefusal(coverCountChangedWords(recipients.length), 409, { emails: recipients.length });
      }
    }

    // ── The limits, claimed on stored counters before anything is written ──
    // A give emails the person given it, so it is held to three counts (by
    // the giver on this group in an hour, on this group in a day, to this
    // person in a day across every group) and, with the tick, to the group's
    // ten notices a day: all in one transaction, so a refusal on any one
    // claims none of them, gives nothing and emails nobody.
    if (person) {
      let claim;
      try {
        claim = await reserveNoticeSlots(db, {
          hour: {
            key: `covergive__${group.id}__${actor.uid}`,
            limit: GIVE_LIMITS.perGiverHour,
            windowMs: HOUR_MS,
            refusal: GIVE_LIMIT_WORDS.giverHour(GIVE_LIMITS.perGiverHour),
          },
          day: {
            key: `covergiveday__${group.id}`,
            limit: GIVE_LIMITS.perGroupDay,
            windowMs: DAY_MS,
            refusal: GIVE_LIMIT_WORDS.groupDay(GIVE_LIMITS.perGroupDay),
          },
          also: [
            {
              key: `covergiven__${person.uid}`,
              limit: GIVE_LIMITS.perPersonDay,
              windowMs: DAY_MS,
              refusal: GIVE_LIMIT_WORDS.personDay(person.firstName, GIVE_LIMITS.perPersonDay),
            },
            ...(press.tell
              ? [{ ...groupNoticeWindow(group.id), refusal: GIVE_LIMIT_WORDS.groupNotices(groupNoticeWindow(group.id).limit) }]
              : []),
          ],
          noun: "notices",
        });
      } catch (err) {
        // Fail closed: a limit that cannot be read is no licence to email.
        console.error("[courses register cover] limits read failed", groupId, err);
        throw new CoverRefusal(COVER_REFUSAL.limitsUnread, 500);
      }
      if (!claim.ok) {
        throw new CoverRefusal(claim.refusal ?? COVER_REFUSAL.limitsUnread, 429, { retryAfterSeconds: claim.retryAfterSeconds });
      }
    }

    const emailedCount = (person && address ? 1 : 0) + (press.tell ? recipients.length : 0);

    // ── The write ─────────────────────────────────────────────────────────
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      // The session as the group says it now, read in this transaction: the
      // start the register keeps is never one worked out before it. A session
      // re-dated since the words above were worked out is refused, so nothing
      // is stored or emailed about a time it no longer has.
      const current = await sessionInTransaction(tx, db, run, group.id, session);
      if (!current.ok) {
        throw current.reason === "cancelled"
          ? new CoverRefusal(didNotHappenLine(group.name.trim() || "This group", current.dateKey), 409)
          : new CoverRefusal(COVER_REFUSAL.session, 400);
      }
      if ((current.startsAt?.getTime() ?? null) !== (startsAt?.getTime() ?? null)) throw new CoverRefusal(COVER_REFUSAL.changed, 409);
      const register = fresh.exists ? normalizeCourseAttendance(fresh.id, fresh.data() ?? {}) : null;
      if (register?.pushedAt) throw new CoverRefusal(COVER_REFUSAL.finished, 409);
      if (startedByFacilitator(register, group.facilitatorUids)) throw new CoverRefusal(COVER_REFUSAL.started, 409);
      // Asked again on the register as it is now: two presses at once write one grant and one email.
      if (person && holdsGivenCover(register?.cover ?? null, person.uid, now)) throw new CoverRefusal(COVER_REFUSAL.alreadyGiven, 409);
      const covers = register?.cover ? register.cover.covering : coveringUids;
      // A replacement writes the whole cover: what the old one held and this
      // one does not is taken away, never left behind by the merge.
      const cover: Record<string, unknown> = {
        kind: person ? "given" : "self",
        byUid: person ? person.uid : actor.uid,
        at: now,
        covering: covers,
      };
      const optional: Record<string, unknown> = {
        grantedByUid: person ? actor.uid : null,
        grantedAt: person ? now : null,
        until,
        reason: press.reason || null,
      };
      const old = register?.cover as Record<string, unknown> | null | undefined;
      for (const [field, value] of Object.entries(optional)) {
        if (value !== null) cover[field] = value;
        else if (old && old[field] !== undefined) cover[field] = FieldValue.delete();
      }
      // Taken or given before the session ends, its facilitators are recorded
      // not there. Taken after it ended (catching up an old register), nobody
      // knows that, so nothing is recorded: an admin or the programme's lead
      // can say who was there.
      const presence: Record<string, unknown> = {};
      if (!register?.cover && !sessionHasEnded(current.endsAt, now)) {
        for (const uid of covers) {
          if (register?.facilitatorRecord[uid]) continue;
          presence[uid] = { state: "not-there", byUid: actor.uid, at: now, how: "cover" };
        }
      }
      tx.set(
        ref,
        {
          runId,
          groupId: group.id,
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          [COVER]: cover,
          ...(Object.keys(presence).length > 0 ? { [FACILITATOR_RECORD]: presence } : {}),
          ...(current.startsAt ? { sessionAt: current.startsAt } : {}),
        },
        { merge: true },
      );
      tx.set(
        db.collection(COURSE_AUDIT_COLLECTION).doc(),
        groupHistoryRow({
          kind: person ? "register-given" : "register-covered",
          run,
          group,
          actor,
          subjectUid: person?.uid ?? null,
          detail: person
            ? gaveDetail(session.weekNumber, person.name, coveringNames, press.reason, press.tell ? recipients.length : 0)
            : tookDetail(session.weekNumber, coveringNames, press.reason),
          weekId: session.weekId,
          after: person
            ? { kind: "given", person: person.name, until: until ? until.toISOString() : null, covering: covers.length }
            : { kind: "self", covering: covers.length },
          reason: press.reason || null,
          emailed: emailedCount,
        }),
      );
    });

    // ── The emails, after the write: a failed send never undoes the grant ───
    let emailOutcome: Answer["email"] = null;
    let tally: NoticeTally | null = null;
    if (person && email) {
      emailOutcome = address
        ? await sendCoverGivenEmail({
            to: address,
            name: person.firstName,
            actorUid: actor.uid,
            runId,
            link: coverRegisterUrl(process.env.NEXT_PUBLIC_APP_URL ?? "", runId, group.id, session.sessionKey),
            words: email,
          })
        : "no-address";
      if (press.tell && notice) {
        tally = await sendGroupChangeNotice(db, {
          run,
          group,
          actor,
          recipients,
          words: { subject: notice.subject, before: notice.lines, after: [], asks: false, incubator: false },
        });
      }
    }

    const answer: Answer = {
      ok: true,
      cover: {
        kind: person ? "given" : "self",
        byName: person ? person.name : actor.displayName ?? "",
        until: until ? until.toISOString() : null,
      },
      email: emailOutcome,
      notice: tally,
    };
    return NextResponse.json(answer);
  } catch (err) {
    if (err instanceof CoverRefusal) {
      const headers =
        typeof err.detail.retryAfterSeconds === "number" ? { "Retry-After": String(err.detail.retryAfterSeconds) } : undefined;
      return NextResponse.json({ error: err.message, ...err.detail }, { status: err.status, headers });
    }
    console.error("[courses register cover] failed", groupId, err);
    return NextResponse.json({ error: "That didn’t go through, so nothing changed." }, { status: 500 });
  }
}
