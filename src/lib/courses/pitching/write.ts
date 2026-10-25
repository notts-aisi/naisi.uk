import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import type { SessionUser } from "@/lib/firebase/session";
import {
  PITCHES_COLLECTION,
  PITCH_LIMITS,
  normalizePitch,
  type PickInput,
  type PitchInput,
  type PitchPaper,
  type PitchingView,
} from "./model";
import {
  peopleNamed,
  pitchesOfGroup,
  pitchingIsOpen,
  pitchingPerson,
  pitchingView,
  type Refusal,
} from "./load";
import { seatsOn } from "./people";

/**
 * PITCHING WEEK'S TWO WRITES: a person saving their pitch, and a person
 * saying they would (or would no longer) join one of their group's pitches.
 *
 * Both are the person's own act. They are reached only through the routes
 * under `/api/courses/runs/[runId]/pitching/`, which refuse a view-as session
 * before anything else; `coursePitches` is shut to every browser.
 *
 * Each write is a transaction over the run's pitches, so the two rules that
 * span documents hold under two presses at once:
 *
 *  - one pitch per person per group: nobody is put on a second pitch, as its
 *    sender or as somebody's partner;
 *  - never more picks than the run allows (`pickLimit`).
 *
 * Both refuse once the group's session in pitching week has started.
 */

const CLOSED: Refusal = {
  ok: false,
  status: 409,
  error: "Pitching has closed: your group’s session has started.",
};

/** A refusal decided inside a transaction, carried out of it. */
class PitchRefusal extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function refusalOf(err: unknown): Refusal {
  if (err instanceof PitchRefusal) return { ok: false, status: err.status, error: err.message };
  throw err;
}

/**
 * Save the caller's pitch: make it, or change the one they are on.
 *
 * Both pitchers may change its words. Who is on it is the choice of the one
 * who sent it: they pitch alone or with one partner, who has to be somebody
 * else in their group, told, whose account stands, and on no other pitch.
 * A partner taken off a pitch is free to pitch again; somebody put on one is
 * taken off its list of people who would join it.
 */
export async function savePitch(
  db: Firestore,
  user: SessionUser,
  runId: string,
  input: PitchInput,
  now: Date = new Date(),
): Promise<{ ok: true; view: PitchingView } | Refusal> {
  const gate = await pitchingPerson(db, user, runId);
  if (!gate.ok) return gate;
  const person = gate.person;
  const { run, group, week } = person;
  if (!pitchingIsOpen(run, person.start, now)) return CLOSED;

  // The paper: one of the week's readings as this group has the week, or typed.
  let paper: PitchPaper;
  if (input.paper.kind === "reading") {
    const { week: weekDoc } = await resolveWeekDoc(db, runId, group.id, week.weekId);
    const materialId = input.paper.materialId;
    const reading = (weekDoc?.materials ?? []).find(
      (material) => material.type === "reading" && material.id === materialId && material.title.trim(),
    );
    if (!reading) {
      return {
        ok: false,
        status: 400,
        error: "That paper isn’t one of this week’s readings. Pick another, or type it in.",
      };
    }
    paper = { kind: "reading", materialId: reading.id, title: reading.title.trim().slice(0, PITCH_LIMITS.paper) };
  } else {
    paper = { kind: "typed", title: input.paper.title };
  }

  // The partner, checked before the transaction against who is in the group.
  let partnerName: string | null = null;
  if (input.partnerUid !== null) {
    if (input.partnerUid === user.uid) {
      return { ok: false, status: 400, error: "Pick somebody else as your partner, or pitch alone." };
    }
    const seats = await seatsOn(db, runId, { isAdmin: user.role === "admin" });
    const inGroup = seats.some((seat) => seat.uid === input.partnerUid && seat.groupId === group.id);
    const named = await peopleNamed(db, [input.partnerUid]);
    const partner = named.get(input.partnerUid);
    if (!inGroup || !partner?.approved) {
      return { ok: false, status: 400, error: "Your partner has to be somebody in your group." };
    }
    partnerName = partner.name;
  }

  const pitchesRef = db.collection(PITCHES_COLLECTION);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(pitchesRef.where("runId", "==", runId));
      const pitches = pitchesOfGroup(
        snap.docs.map((doc) => normalizePitch(doc.id, doc.data() ?? {})),
        week.weekId,
        group.id,
      );
      const mine = pitches.find((pitch) => pitch.pitcherUids.includes(user.uid)) ?? null;
      const sentByMe = !mine || mine.pitcherUids[0] === user.uid;

      let pitcherUids: string[];
      if (sentByMe) {
        pitcherUids = input.partnerUid ? [user.uid, input.partnerUid] : [user.uid];
      } else {
        // A partner changes the words. Who is on the pitch stays its sender's choice.
        const sender = mine.pitcherUids[0];
        if (input.partnerUid !== null && input.partnerUid !== sender) {
          throw new PitchRefusal(409, "Only the person who sent this pitch can change who’s on it.");
        }
        pitcherUids = mine.pitcherUids;
      }

      for (const uid of pitcherUids) {
        if (uid === user.uid) continue;
        const elsewhere = pitches.some((pitch) => pitch.id !== mine?.id && pitch.pitcherUids.includes(uid));
        if (elsewhere) {
          throw new PitchRefusal(
            409,
            `${partnerName ?? "Your partner"} already has a pitch. Pick somebody else, or pitch alone.`,
          );
        }
      }

      const words = {
        title: input.title,
        paper,
        twist: input.twist,
        pitcherUids,
        wouldJoinUids: (mine?.wouldJoinUids ?? []).filter((uid) => !pitcherUids.includes(uid)),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (mine) {
        tx.update(pitchesRef.doc(mine.id), words);
      } else {
        tx.set(pitchesRef.doc(), {
          runId,
          courseId: run.courseId,
          groupId: group.id,
          weekId: week.weekId,
          weekNumber: week.weekNumber,
          ...words,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (err) {
    return refusalOf(err);
  }
  return { ok: true, view: await pitchingView(db, person, now) };
}

/**
 * "I’d join this", pressed (`join: true`) or unpressed. A person picks only
 * their own group's pitches this week, never their own, and never more than
 * the run's pick limit. Pressing what is already so changes nothing.
 */
export async function setPick(
  db: Firestore,
  user: SessionUser,
  runId: string,
  input: PickInput,
  now: Date = new Date(),
): Promise<{ ok: true; view: PitchingView } | Refusal> {
  const gate = await pitchingPerson(db, user, runId);
  if (!gate.ok) return gate;
  const person = gate.person;
  const { run, group, week } = person;
  if (!pitchingIsOpen(run, person.start, now)) return CLOSED;
  const limit = run.pitchSettings.pickLimit;
  if (limit === null) {
    return {
      ok: false,
      status: 409,
      error: "Picking isn’t open yet: how many pitches each person may pick hasn’t been set.",
    };
  }

  const pitchesRef = db.collection(PITCHES_COLLECTION);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(pitchesRef.where("runId", "==", runId));
      const pitches = pitchesOfGroup(
        snap.docs.map((doc) => normalizePitch(doc.id, doc.data() ?? {})),
        week.weekId,
        group.id,
      );
      const pitch = pitches.find((candidate) => candidate.id === input.pitchId);
      if (!pitch) throw new PitchRefusal(404, "That pitch isn’t one of your group’s this week.");
      if (pitch.pitcherUids.includes(user.uid)) {
        throw new PitchRefusal(409, "That’s your own pitch, so you can’t pick it.");
      }
      const already = pitch.wouldJoinUids.includes(user.uid);
      if (input.join === already) return;
      if (input.join) {
        const picked = pitches.filter((candidate) => candidate.wouldJoinUids.includes(user.uid)).length;
        if (picked >= limit) {
          throw new PitchRefusal(409, `You’ve picked ${limit}. Take one off before you pick another.`);
        }
        tx.update(pitchesRef.doc(pitch.id), { wouldJoinUids: [...pitch.wouldJoinUids, user.uid] });
      } else {
        tx.update(pitchesRef.doc(pitch.id), {
          wouldJoinUids: pitch.wouldJoinUids.filter((uid) => uid !== user.uid),
        });
      }
    });
  } catch (err) {
    return refusalOf(err);
  }
  return { ok: true, view: await pitchingView(db, person, now) };
}
