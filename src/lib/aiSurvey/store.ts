import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import * as firestoreSdk from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import * as adminSdk from "@/lib/firebase/admin";
import { AI_SURVEY, closesAtInstant } from "./definition";
import type { AiSurveyAnswerSet, AiSurveyDefinition, AiSurveyPageAnswers, AiSurveyStage } from "./types";

/**
 * Where the AI at Nottingham survey keeps what it keeps.
 *
 * The start screen tells students "we can't tell which answers are yours".
 * This file is most of what makes that true, so the rules it follows are
 * written here once:
 *
 *  - AN ANSWER SET CARRIES NO DATE AND NO TIME, and neither may the datastore
 *    on its behalf. Firestore stamps a create and an update time on every
 *    document, so an answer set is never a document: it is a FIELD inside one
 *    of a few shared documents, and so is each entry in the used-email list.
 *  - A SHARED DOCUMENT'S UPDATE TIME MUST NOT DATE A SAVE. A document that
 *    holds two answer sets and was last written at 14:03 points at whoever was
 *    sent a code at 14:02. So new people are spread over FEW documents while
 *    there are few people (`shardsInUse`), and the documents are rewritten
 *    TOGETHER (`levelWrites`), so their times never differ for long: on every
 *    save while the survey is small, and at most `LEVEL_EVERY_MS` apart once
 *    it is busy.
 *  - AN ADDRESS NEVER MEETS AN ANSWER. The used-email list holds keyed hashes
 *    and nothing else. Nothing here takes an address and an answer set in one
 *    call.
 *  - NOTHING IS LOGGED but counts.
 *
 * Every collection is written by the server alone: `firestore.rules` locks
 * each one to everybody, and scripts/rules-tests holds that.
 */

/*
 * The SDK's values are read off the two modules' namespaces, on purpose, and
 * not imported by name. The scheduler's registry imports every job by value
 * and one job reaches this file, so this file is loaded by every suite that
 * loads the registry, each with a small stand-in for the SDK. A named import
 * of something a stand-in does not carry fails that whole suite as it loads;
 * a namespace is simply missing the name until something here runs.
 */
const { FieldPath, FieldValue, Timestamp } = firestoreSdk;
type Timestamp = firestoreSdk.Timestamp;

export const STATE_COLLECTION = "aiSurveyState";
export const ANSWERS_COLLECTION = "aiSurveyAnswers";
export const USED_COLLECTION = "aiSurveyUsedEmails";
export const CODES_COLLECTION = "aiSurveyCodes";
export const LIMITS_COLLECTION = "aiSurveyCodeLimits";

/** Answer documents are made sixteen at a time. */
export const SHARDS_PER_GENERATION = 16;
/** The used-email list is sixteen documents, picked by a hash's first character. */
const USED_SHARDS = "0123456789abcdef".split("");
/**
 * How many people one generation of answer documents takes before the next is
 * made. An answer set is about 1.2 KB and at most 2 KB, a document holds
 * 1 MiB, so 350 to a document leaves room to spare.
 */
export const PEOPLE_PER_GENERATION = SHARDS_PER_GENERATION * 350;
/** Below this many people, every save levels the documents in use. */
export const SMALL_SURVEY = 128;
/** Once busy, the documents are levelled at most this far apart. */
export const LEVEL_EVERY_MS = 20_000;
/** A session under way when the survey closes can save for this much longer. */
export const CLOSING_GRACE_MS = 30 * 60 * 1000;
/** Codes sent in an hour, across the whole survey, before "we're busy". */
export const CODE_CEILING_PER_HOUR = 600;

export type SurveyState = {
  stage: AiSurveyStage;
  /** Names this generation of storage. Clearing pilot data replaces it, and every pass made under it stops working. */
  epoch: string;
  /** Signs the pass a browser holds (pass.ts). Replaced with the epoch. */
  passKey: string;
  /** Hashes addresses in Pilot only, and only where the real key is not set (emailKey below). */
  pilotKey: string;
  /** How many people have passed the email check under this epoch. A count, and the only thing it decides is how many documents are in use. */
  accepted: number;
  /** How many answer documents exist under this epoch. */
  shardDocs: number;
  /** The accounts that may open the survey's admin page. Not a role. */
  adminUids: string[];
  /** When it was closed by hand, if it was. */
  closedEarly: Timestamp | null;
  /** When the shared documents were last rewritten together. */
  lastLevel: Timestamp | null;
  /** Set by the job once the used-email list has been deleted after closing. */
  usedListDeleted: Timestamp | null;
};

/**
 * The database the survey's records live in: a database of its own when
 * `AI_SURVEY_DATABASE` names one, the site's otherwise. A database of its own
 * can be kept with no point-in-time recovery and no backups, which is the only
 * thing that stops an earlier state of a shared document being read back.
 */
export function surveyDb(): Firestore | undefined {
  const named = process.env.AI_SURVEY_DATABASE?.trim();
  return named ? adminSdk.getAdminDbNamed(named) : adminSdk.getAdminDb();
}

export const stateRef = (db: Firestore) => db.collection(STATE_COLLECTION).doc("main");
export const countsRef = (db: Firestore) => db.collection(STATE_COLLECTION).doc("codes");

export function answersRef(db: Firestore, epoch: string, shard: number) {
  return db.collection(ANSWERS_COLLECTION).doc(`${epoch}-${String(shard).padStart(3, "0")}`);
}

export function usedRef(db: Firestore, epoch: string, hash: string) {
  return db.collection(USED_COLLECTION).doc(`${epoch}-${hash[0]}`);
}

function freshState(): Omit<SurveyState, "adminUids"> {
  return {
    stage: "pilot",
    epoch: randomBytes(6).toString("hex"),
    passKey: randomBytes(32).toString("base64"),
    pilotKey: randomBytes(32).toString("base64"),
    accepted: 0,
    shardDocs: SHARDS_PER_GENERATION,
    closedEarly: null,
    lastLevel: null,
    usedListDeleted: null,
  };
}

function asState(data: FirebaseFirestore.DocumentData): SurveyState {
  return {
    stage: data.stage === "open" || data.stage === "closed" ? data.stage : "pilot",
    epoch: String(data.epoch ?? ""),
    passKey: String(data.passKey ?? ""),
    pilotKey: String(data.pilotKey ?? ""),
    accepted: typeof data.accepted === "number" && data.accepted > 0 ? Math.floor(data.accepted) : 0,
    shardDocs: typeof data.shardDocs === "number" && data.shardDocs > 0 ? data.shardDocs : SHARDS_PER_GENERATION,
    adminUids: Array.isArray(data.adminUids) ? data.adminUids.filter((u: unknown) => typeof u === "string") : [],
    closedEarly: data.closedEarly instanceof Timestamp ? data.closedEarly : null,
    lastLevel: data.lastLevel instanceof Timestamp ? data.lastLevel : null,
    usedListDeleted: data.usedListDeleted instanceof Timestamp ? data.usedListDeleted : null,
  };
}

/** Make the empty shared documents of one epoch, sixteen answer documents from `fromShard`. */
async function makeDocuments(db: Firestore, epoch: string, fromShard: number, withUsedList: boolean) {
  const batch = db.batch();
  for (let i = 0; i < SHARDS_PER_GENERATION; i++) {
    batch.set(answersRef(db, epoch, fromShard + i), { sets: {}, beat: 0 }, { merge: true });
  }
  if (withUsedList) {
    for (const first of USED_SHARDS) batch.set(usedRef(db, epoch, first), { h: {}, beat: 0 }, { merge: true });
  }
  await batch.commit();
}

/**
 * The survey's state, made on first use: Pilot, with its shared documents
 * already there, so a save is always an UPDATE of a document that exists and
 * a save against cleared storage fails rather than quietly making it again.
 */
export async function readState(db: Firestore): Promise<SurveyState> {
  const snap = await stateRef(db).get();
  if (snap.exists) return asState(snap.data() ?? {});

  const fresh = freshState();
  await makeDocuments(db, fresh.epoch, 0, true);
  const made = await db.runTransaction(async (tx) => {
    const again = await tx.get(stateRef(db));
    if (again.exists) return asState(again.data() ?? {});
    tx.set(stateRef(db), { ...fresh, adminUids: [] });
    return { ...fresh, adminUids: [] as string[] };
  });
  return made;
}

/** The survey's state if it has one, and null if nobody has visited yet. Never makes it. */
export async function peekState(db: Firestore): Promise<SurveyState | null> {
  const snap = await stateRef(db).get();
  return snap.exists ? asState(snap.data() ?? {}) : null;
}

export type StageNow = {
  stage: AiSurveyStage;
  /** Somebody new may ask for a code and start. */
  takesNewPeople: boolean;
  /** Somebody already under way may still save a page. */
  takesSaves: boolean;
};

/**
 * The stage as it is NOW: an Open survey is Closed the moment its closing
 * time passes, whether or not anybody has pressed anything. Somebody under way
 * at that moment has thirty more minutes to save.
 */
export function stageAt(state: SurveyState, now: number, def: AiSurveyDefinition = AI_SURVEY): StageNow {
  const closesAt = closesAtInstant(def).getTime();
  if (state.stage === "pilot") return { stage: "pilot", takesNewPeople: true, takesSaves: true };
  if (state.stage === "open" && now < closesAt) return { stage: "open", takesNewPeople: true, takesSaves: true };
  const closedFrom = state.stage === "closed" && state.closedEarly ? state.closedEarly.toMillis() : closesAt;
  return { stage: "closed", takesNewPeople: false, takesSaves: now < closedFrom + CLOSING_GRACE_MS };
}

/** How many of a generation's documents new people are spread over, by how many people there have been. */
export function shardsInUse(accepted: number): { from: number; count: number } {
  const generation = Math.floor(accepted / PEOPLE_PER_GENERATION);
  if (generation > 0) return { from: generation * SHARDS_PER_GENERATION, count: SHARDS_PER_GENERATION };
  const count = accepted < 48 ? 2 : accepted < SMALL_SURVEY ? 4 : accepted < 320 ? 8 : 16;
  return { from: 0, count };
}

/** Every answer document that somebody may be writing to: all of them once past the first generation's growth. */
function shardsToLevel(state: SurveyState): number[] {
  const { from, count } = shardsInUse(state.accepted);
  const upTo = state.accepted < 320 ? from + count : state.shardDocs;
  return Array.from({ length: upTo }, (_, i) => i);
}

/**
 * The key addresses are hashed with. The real one is a secret used for
 * nothing else (`AI_SURVEY_EMAIL_KEY`). In PILOT, on a copy of the site where
 * that secret has not been made yet, a stand-in kept with the state is used so
 * the survey can be tried: pilot hashes are thrown away when the survey opens,
 * and it CANNOT open without the real key (`openingChecks`). Outside
 * Pilot there is no stand-in: no key, no codes.
 */
export function emailKey(state: SurveyState): Buffer | null {
  const real = process.env.AI_SURVEY_EMAIL_KEY?.trim();
  if (real && real.length >= 32) return Buffer.from(real, "utf8");
  if (state.stage === "pilot" && state.pilotKey) return Buffer.from(`pilot:${state.pilotKey}`, "utf8");
  return null;
}

export function hasRealEmailKey(): boolean {
  const real = process.env.AI_SURVEY_EMAIL_KEY?.trim();
  return Boolean(real && real.length >= 32);
}

export type AddressHashes = { used: string; pending: string; limit: string };

/**
 * The three keyed hashes of one address. Each has its own label, so an entry
 * in the used-email list cannot be matched to a pending code or to a limit
 * record without the key, and so no time on either of those attaches to an
 * entry in the list.
 */
export function hashAddress(address: string, key: Buffer): AddressHashes {
  const of = (label: string) => createHmac("sha256", key).update(`ai-survey.${label}.v1:`).update(address).digest("hex");
  return { used: of("used"), pending: of("pending"), limit: of("limit") };
}

const beat = () => randomBytes(4).readUInt32BE(0);

/**
 * Add, to a batch or a transaction, a rewrite of every shared document
 * somebody may be writing to, so that after the commit they all carry one
 * update time and none of them dates a save.
 */
function levelWrites(
  db: Firestore,
  writer: { update: (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) => unknown },
  state: SurveyState,
  options: { withAnswers: boolean; skipAnswers?: number; withUsedList: boolean; skipUsed?: string },
) {
  const value = beat();
  if (options.withAnswers) {
    for (const shard of shardsToLevel(state)) {
      if (shard !== options.skipAnswers) writer.update(answersRef(db, state.epoch, shard), { beat: value });
    }
  }
  if (options.withUsedList) {
    for (const first of USED_SHARDS) {
      if (first !== options.skipUsed) writer.update(usedRef(db, state.epoch, first), { beat: value });
    }
  }
  return value;
}

/** Rewrite every shared document together. The job calls this on every tick. */
export async function levelAll(db: Firestore, state: SurveyState): Promise<void> {
  const batch = db.batch();
  const all = { ...state, accepted: Math.max(state.accepted, 320) };
  levelWrites(db, batch, all, { withAnswers: true, withUsedList: !state.usedListDeleted });
  batch.update(stateRef(db), { lastLevel: FieldValue.serverTimestamp() });
  await batch.commit();
}

// ---------------------------------------------------------------------------
// The used-email list
// ---------------------------------------------------------------------------

export type AcceptOutcome = "accepted" | "alreadyAnswered" | "wrongCode" | "tooManyWrongTries" | "codeRunOut";

/** A pending code runs out after this long. */
export const CODE_LIFETIME_MS = 15 * 60 * 1000;
export const MAX_WRONG_TRIES = 5;

/**
 * Check a code, and on the right one use the address up, in ONE transaction.
 *
 * The pending code is deleted on the right code whatever follows, so a code
 * works once. Then the used-email list is read for this address's hash and
 * the hash added: two browsers with the same code, or two codes for one
 * address, cannot both get through, because whichever commits second finds no
 * pending code or finds the hash.
 *
 * "Already answered" is only ever an outcome of THIS function, after the
 * right code, so typing somebody else's address tells you nothing.
 */
export async function acceptCode(
  db: Firestore,
  state: SurveyState,
  hashes: AddressHashes,
  codeMatches: (stored: string) => boolean,
  now: number,
): Promise<AcceptOutcome> {
  const pendingRef = db.collection(CODES_COLLECTION).doc(hashes.pending);
  const listRef = usedRef(db, state.epoch, hashes.used);
  const entry = new FieldPath("h", hashes.used);

  return db.runTransaction(async (tx) => {
    const pending = await tx.get(pendingRef);
    if (!pending.exists) return "codeRunOut";
    const data = pending.data() ?? {};
    const runsOut = data.runsOut instanceof Timestamp ? data.runsOut.toMillis() : 0;
    if (runsOut <= now) {
      tx.delete(pendingRef);
      return "codeRunOut";
    }
    if (!codeMatches(String(data.code ?? ""))) {
      const tries = (typeof data.tries === "number" ? data.tries : 0) + 1;
      if (tries >= MAX_WRONG_TRIES) {
        tx.delete(pendingRef);
        return "tooManyWrongTries";
      }
      tx.update(pendingRef, { tries });
      return "wrongCode";
    }

    const [list] = await tx.getAll(listRef, { fieldMask: [entry] });
    tx.delete(pendingRef);
    if (!list.exists) return "codeRunOut"; // storage was cleared under this request
    if (list.get(entry) === true) return "alreadyAnswered";

    if (state.accepted < SMALL_SURVEY) {
      // Small survey: every document of the list is rewritten with this one.
      const value = levelWrites(db, tx, state, { withAnswers: false, withUsedList: true, skipUsed: hashes.used[0] });
      tx.update(listRef, entry, true, "beat", value);
    } else {
      tx.update(listRef, entry, true);
    }
    return "accepted";
  });
}

/** One more person has passed the email check. Makes the next generation of answer documents when this one is full. */
export async function countAccepted(db: Firestore, state: SurveyState): Promise<void> {
  const next = state.accepted + 1;
  const needed = (Math.floor(next / PEOPLE_PER_GENERATION) + 1) * SHARDS_PER_GENERATION;
  if (needed > state.shardDocs) {
    await makeDocuments(db, state.epoch, state.shardDocs, false);
    await stateRef(db).update({ accepted: FieldValue.increment(1), shardDocs: needed });
    return;
  }
  await stateRef(db).update({ accepted: FieldValue.increment(1) });
}

// ---------------------------------------------------------------------------
// Pending codes, the per-address limits and the hourly ceiling
// ---------------------------------------------------------------------------

export type ReserveOutcome = "reserved" | "askedAgainTooSoon" | "tooManyCodesToday";

export const CODES_PER_DAY = 5;
export const CODE_COOLDOWN_SECONDS = 60;

/**
 * Take one of an address's codes for today, and store the new pending code in
 * place of any old one: one code a minute and five a day for each address.
 * Nothing here is keyed by, or keeps, an IP address: a room of students shares
 * a few.
 */
export async function reserveCode(
  db: Firestore,
  hashes: AddressHashes,
  codeHash: string,
  now: number,
  today: string,
): Promise<ReserveOutcome> {
  const limitRef = db.collection(LIMITS_COLLECTION).doc(hashes.limit);
  const pendingRef = db.collection(CODES_COLLECTION).doc(hashes.pending);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(limitRef);
    const data = snap.data() ?? {};
    const last = data.last instanceof Timestamp ? data.last.toMillis() : 0;
    if (now - last < CODE_COOLDOWN_SECONDS * 1000) return "askedAgainTooSoon";
    const sentToday = data.day === today && typeof data.sent === "number" ? data.sent : 0;
    if (sentToday >= CODES_PER_DAY) return "tooManyCodesToday";
    tx.set(limitRef, { day: today, sent: sentToday + 1, last: Timestamp.fromMillis(now) });
    tx.set(pendingRef, { code: codeHash, runsOut: Timestamp.fromMillis(now + CODE_LIFETIME_MS), tries: 0 });
    return "reserved";
  });
}

/** The code could not be sent: take the pending code away and let them ask again at once. Today's count stands. */
export async function releaseCode(db: Firestore, hashes: AddressHashes): Promise<void> {
  await Promise.all([
    db.collection(CODES_COLLECTION).doc(hashes.pending).delete(),
    db.collection(LIMITS_COLLECTION).doc(hashes.limit).update({ last: Timestamp.fromMillis(0) }),
  ]).catch(() => undefined);
}

const minuteKey = (at: number) => new Date(at).toISOString().slice(0, 16).replace(/[-T:]/g, "");

/** How many codes went out in the sixty minutes up to `now`. */
export async function codesInLastHour(db: Firestore, now: number): Promise<number> {
  const snap = await countsRef(db).get();
  const minutes = (snap.data()?.m ?? {}) as Record<string, unknown>;
  const from = minuteKey(now - 60 * 60 * 1000);
  let total = 0;
  for (const [key, count] of Object.entries(minutes)) {
    if (key > from && typeof count === "number") total += count;
  }
  return total;
}

export async function countCodeSent(db: Firestore, now: number): Promise<void> {
  await countsRef(db).set({ m: { [minuteKey(now)]: FieldValue.increment(1) } }, { merge: true });
}

// ---------------------------------------------------------------------------
// Answer sets
// ---------------------------------------------------------------------------

type StoredSet = { v?: unknown; o?: unknown; f?: unknown; p?: unknown };

function asAnswerSet(stored: StoredSet): AiSurveyAnswerSet {
  const pages: Record<string, AiSurveyPageAnswers> = {};
  if (stored.p && typeof stored.p === "object") {
    for (const [pageId, answers] of Object.entries(stored.p as Record<string, unknown>)) {
      if (answers && typeof answers === "object") pages[pageId] = answers as AiSurveyPageAnswers;
    }
  }
  return {
    surveyVersion: typeof stored.v === "number" ? stored.v : 0,
    finished: stored.f === true,
    proposalPageOrder: Array.isArray(stored.o) ? stored.o.filter((id): id is string => typeof id === "string") : [],
    pages,
  };
}

export type SetProgress = { exists: boolean; finished: boolean; savedPages: string[] };

/**
 * Which pages of one answer set are saved, and whether it is finished. THE
 * ANSWERS THEMSELVES ARE NEVER READ BACK TO A BROWSER: on a shared computer
 * the next person must not see the last person's, so there is no function
 * here that returns them for a pass.
 */
export async function readProgress(db: Firestore, epoch: string, shard: number, setKey: string): Promise<SetProgress | null> {
  const path = new FieldPath("sets", setKey);
  const [snap] = await db.getAll(answersRef(db, epoch, shard), { fieldMask: [path] });
  if (!snap.exists) return null;
  const stored = snap.get(path) as StoredSet | undefined;
  if (!stored) return { exists: false, finished: false, savedPages: [] };
  const set = asAnswerSet(stored);
  return { exists: true, finished: set.finished, savedPages: Object.keys(set.pages) };
}

/**
 * Store one page of one answer set, whole, in place of any earlier save of
 * it. A blind write of a few fields, never a read-then-write, so a room of
 * people saving at once do not queue behind one another.
 *
 * While the survey is small the same write rewrites every other document in
 * use, and once it is busy it does so whenever they were last levelled more
 * than `LEVEL_EVERY_MS` ago, so this document's update time is one the others
 * share.
 */
export async function writePage(
  db: Firestore,
  state: SurveyState,
  target: { shard: number; setKey: string; order: string[] },
  pageId: string,
  answers: AiSurveyPageAnswers,
  finished: boolean,
  now: number,
  def: AiSurveyDefinition = AI_SURVEY,
): Promise<void> {
  const ref = answersRef(db, state.epoch, target.shard);
  const at = (...rest: string[]) => new FieldPath("sets", target.setKey, ...rest);
  const small = state.accepted < SMALL_SURVEY;
  const due = !state.lastLevel || now - state.lastLevel.toMillis() > LEVEL_EVERY_MS;

  // `f` is written only by the save that finishes. A save that does not
  // finish never writes it, so one that crosses a finish in flight cannot
  // put an unfinished mark back over a finished one.
  const lock = finished ? [at("f"), true] : [];

  if (!small && !due) {
    await ref.update(at("v"), def.version, at("o"), target.order, at("p", pageId), answers, ...lock);
    return;
  }
  const batch = db.batch();
  const value = levelWrites(db, batch, state, {
    withAnswers: true,
    skipAnswers: target.shard,
    withUsedList: !small && !state.usedListDeleted,
  });
  batch.update(ref, at("v"), def.version, at("o"), target.order, at("p", pageId), answers, "beat", value, ...lock);
  if (!small) batch.update(stateRef(db), { lastLevel: FieldValue.serverTimestamp() });
  await batch.commit();
}

/** Every answer set, for the export and the counts. Admin routes only. */
export async function readAllSets(db: Firestore, state: SurveyState): Promise<AiSurveyAnswerSet[]> {
  const refs = Array.from({ length: state.shardDocs }, (_, i) => answersRef(db, state.epoch, i));
  const snaps = await db.getAll(...refs);
  const sets: AiSurveyAnswerSet[] = [];
  for (const snap of snaps) {
    const stored = (snap.data()?.sets ?? {}) as Record<string, StoredSet>;
    for (const one of Object.values(stored)) sets.push(asAnswerSet(one));
  }
  return sets;
}

// ---------------------------------------------------------------------------
// Stages, and throwing storage away
// ---------------------------------------------------------------------------

async function deleteEpochDocuments(db: Firestore, epoch: string, shardDocs: number, usedList: boolean) {
  const batch = db.batch();
  for (let i = 0; i < shardDocs; i++) batch.delete(answersRef(db, epoch, i));
  if (usedList) for (const first of USED_SHARDS) batch.delete(usedRef(db, epoch, first));
  await batch.commit();
}

/** Delete every pending code, limit record and count. */
export async function deleteCodeRecords(db: Firestore): Promise<void> {
  await Promise.all([
    db.recursiveDelete(db.collection(CODES_COLLECTION)),
    db.recursiveDelete(db.collection(LIMITS_COLLECTION)),
    countsRef(db).delete(),
  ]);
}

/**
 * Throw away every answer set and the whole used-email list, and start a new
 * epoch in `stage`. The new documents are made first, then the state is
 * switched, then the old documents are deleted, so a save that was in flight
 * lands on a document that no longer exists and fails: it can never write an
 * old answer into the new storage.
 */
export async function restartStorage(db: Firestore, previous: SurveyState, stage: AiSurveyStage): Promise<SurveyState> {
  const fresh = { ...freshState(), stage };
  await makeDocuments(db, fresh.epoch, 0, true);
  await stateRef(db).set({ ...fresh, adminUids: previous.adminUids });
  await deleteEpochDocuments(db, previous.epoch, previous.shardDocs, true);
  await deleteCodeRecords(db);
  return { ...fresh, adminUids: previous.adminUids };
}

export async function closeNow(db: Firestore): Promise<void> {
  await stateRef(db).update({ stage: "closed", closedEarly: FieldValue.serverTimestamp() });
}

/** After closing: delete the used-email list and every code record, and say when. */
export async function deleteUsedList(db: Firestore, state: SurveyState): Promise<void> {
  const batch = db.batch();
  for (const first of USED_SHARDS) batch.delete(usedRef(db, state.epoch, first));
  batch.update(stateRef(db), { usedListDeleted: FieldValue.serverTimestamp() });
  await batch.commit();
  await deleteCodeRecords(db);
}

/** Run-out pending codes and limit records from before today, deleted. Returns how many. */
export async function sweepCodeRecords(db: Firestore, now: number, today: string, max: number): Promise<number> {
  const [codes, limits] = await Promise.all([
    db.collection(CODES_COLLECTION).where("runsOut", "<=", Timestamp.fromMillis(now)).limit(max).get(),
    db.collection(LIMITS_COLLECTION).where("day", "<", today).limit(max).get(),
  ]);
  const docs = [...codes.docs, ...limits.docs].slice(0, 450);
  if (docs.length > 0) {
    const batch = db.batch();
    for (const doc of docs) batch.delete(doc.ref);
    await batch.commit();
  }
  // Minute counts older than two hours.
  const counts = await countsRef(db).get();
  const minutes = (counts.data()?.m ?? {}) as Record<string, unknown>;
  const before = minuteKey(now - 2 * 60 * 60 * 1000);
  const old = Object.keys(minutes).filter((key) => key < before);
  if (old.length > 0) {
    // By FieldPath, never a dotted string: a minute's key is all digits.
    const [first, ...rest] = old.slice(0, 200);
    const more = rest.flatMap((key) => [new FieldPath("m", key), FieldValue.delete()]);
    await countsRef(db).update(new FieldPath("m", first), FieldValue.delete(), ...more);
  }
  return docs.length;
}
