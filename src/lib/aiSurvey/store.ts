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
 *    sent a code at 14:02. So the documents are rewritten TOGETHER
 *    (`levelWrites`), and then they all carry one time: by EVERY save while
 *    few people are saving, by one save in each `LEVEL_EVERY_MS` once a room
 *    is (`BUSY_SAVES`), and by the job when people stop. In a room a save
 *    that is not due writes ONE document and nothing else, because that is
 *    what keeps the room from queueing, and there no one save stands out.
 *  - WHICH DOCUMENT AN ANSWER SET IS IN SAYS NOTHING ABOUT WHEN. People are
 *    spread at random over all sixteen from the first person on, so a
 *    document's number is not a clock.
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
 * made: 80 to a document, on average.
 *
 * Two of Firestore's limits on ONE document decide it, and an answer set is a
 * field inside one:
 *  - 40,000 index entries. Unless the database is told otherwise, every field
 *    is indexed: two entries for each answer, two for each group that holds
 *    answers (a set, a page), and two more for each item of a list (a
 *    ranking, a tick-all-that-apply). Measured against the database on
 *    17 November 2026: 19,999 plain fields fit in one document and 20,000 do
 *    not. A set with every question answered is a little under 300 entries.
 *  - 1 MiB. A full set is about 3 KB before its comment boxes, and each box
 *    takes up to 5,000 characters.
 * People are spread over the documents at random, so one document can hold a
 * few dozen more than the average. tests/ai-survey.test.mjs works both sums
 * out from the survey as it stands and fails when a longer survey would not
 * fit. `firestore.ai-survey.indexes.json` also tells the survey's own
 * database not to index the answers at all, which lifts the first limit
 * where it has been deployed; the number here does not rely on it.
 */
export const PEOPLE_PER_DOCUMENT = 80;
export const PEOPLE_PER_GENERATION = SHARDS_PER_GENERATION * PEOPLE_PER_DOCUMENT;
/**
 * While A ROOM is saving, the shared documents are levelled this far apart,
 * by whichever save finds them due.
 *
 * NOT ON EVERY SAVE THEN, and this was measured, not guessed (dev's
 * datastore, 17 November 2026). A save that writes one document: 360 a second
 * with forty at once, 95th percentile 180ms, none failed. A save that also
 * rewrites the other fifteen: 5 a second however many arrive, because commits
 * that share documents take turns, and fifty at once waited ten seconds each.
 * A lecture theatre pressing Next is exactly that load.
 */
export const LEVEL_EVERY_MS = 20_000;
/**
 * How many saves one server takes inside `LEVEL_EVERY_MS` before it counts
 * as a room. UP TO THIS MANY, EVERY SAVE LEVELS: with few people answering, a
 * save that wrote its one document would leave that document's time standing
 * apart until the next levelling, and with few people that time and the
 * document point at one of them. Past it there are enough people saving at
 * once that no one save stands out, and the saves stop queueing.
 */
export const BUSY_SAVES = 8;
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
  /**
   * Codes an hour across the whole survey, when somebody has set one by hand
   * on the survey's record; otherwise `CODE_CEILING_PER_HOUR`. Changed in the
   * datastore, so raising it for a big room needs no deploy.
   */
  codeCeiling: number | null;
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
    codeCeiling: null,
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
    codeCeiling:
      typeof data.codeCeiling === "number" && Number.isInteger(data.codeCeiling) && data.codeCeiling > 0 ? data.codeCeiling : null,
  };
}

/** How many codes an hour the survey sends before it says it is busy. */
export function ceilingOf(state: SurveyState): number {
  return state.codeCeiling ?? CODE_CEILING_PER_HOUR;
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

/**
 * The answer documents new people are spread over: all sixteen of the current
 * generation, from the first person on.
 *
 * NOT fewer documents while there are fewer people. That was tried, and it
 * made the document's number a clock: an answer set in the third document
 * could only belong to somebody who arrived after the forty-eighth person.
 * Answers carry no timing of any kind, so the spread is flat. A new
 * generation of sixteen is made only when this one is full
 * (`PEOPLE_PER_GENERATION`), which is a capacity the survey is not expected
 * to reach.
 */
export function shardsInUse(accepted: number): { from: number; count: number } {
  const generation = Math.floor(accepted / PEOPLE_PER_GENERATION);
  return { from: generation * SHARDS_PER_GENERATION, count: SHARDS_PER_GENERATION };
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

/**
 * The key a browser's pass is signed with (pass.ts), or null when there is
 * none and so no pass can be made or read.
 *
 * MADE FROM THE SECRET, not kept in the datastore. The state holds a random
 * value that names this epoch's passes (`passKey`), and the signing key is
 * that value under the same secret the addresses are hashed with. So reading
 * the datastore is not enough to write a pass, and with it an answer set that
 * nobody's email check stands behind. In Pilot, where the stand-in is in use,
 * it is the stand-in, and those passes go when the survey opens.
 *
 * A state with no `passKey` or no epoch (a record somebody made by hand) has
 * no signing key: an empty value would be a key anybody could guess.
 */
export function passSigningKey(state: SurveyState): Buffer | null {
  const secret = emailKey(state);
  if (!secret || !state.passKey || !state.epoch) return null;
  return createHmac("sha256", secret).update("ai-survey.pass-key.v1:").update(state.passKey).digest();
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
 * Add, to a batch, a rewrite of every shared document, so that after the
 * commit they all carry one update time and none of them dates a save.
 */
function levelWrites(
  db: Firestore,
  batch: FirebaseFirestore.WriteBatch,
  state: SurveyState,
  options: { skipAnswers?: number } = {},
) {
  const value = beat();
  for (let shard = 0; shard < state.shardDocs; shard++) {
    if (shard !== options.skipAnswers) batch.update(answersRef(db, state.epoch, shard), { beat: value });
  }
  if (!state.usedListDeleted) {
    for (const first of USED_SHARDS) batch.update(usedRef(db, state.epoch, first), { beat: value });
  }
  batch.update(stateRef(db), { lastLevel: FieldValue.serverTimestamp() });
  return value;
}

/** Rewrite every shared document together. The job calls this on every tick. */
export async function levelAll(db: Firestore, state: SurveyState): Promise<void> {
  const batch = db.batch();
  levelWrites(db, batch, state);
  await batch.commit();
}

/**
 * When THIS server last levelled this epoch's documents, so a burst of saves
 * on one server makes one levelling and not one each: every save in the burst
 * read the state before the first levelling had been written to it.
 */
let levelledHere = { epoch: "", at: 0 };

/** True when the documents are due a levelling and this server has not just done one. */
function levelIsDue(state: SurveyState, now: number): boolean {
  const here = levelledHere.epoch === state.epoch ? levelledHere.at : 0;
  const last = Math.max(state.lastLevel ? state.lastLevel.toMillis() : 0, here);
  return now - last > LEVEL_EVERY_MS;
}

/**
 * How many saves THIS server has taken in the last `LEVEL_EVERY_MS`: a few
 * moments in memory, of nobody in particular, never stored and gone when the
 * server is. It is how a save tells a room from two people.
 */
let savesHere: { epoch: string; at: number[] } = { epoch: "", at: [] };

/** Count this save, and say whether this server is busy enough that it need not level. */
function busyHere(state: SurveyState, now: number): boolean {
  const lately = savesHere.epoch === state.epoch ? savesHere.at.filter((at) => at <= now && now - at < LEVEL_EVERY_MS) : [];
  lately.push(now);
  // Only the newest few are kept: enough to tell busy from not.
  savesHere = { epoch: state.epoch, at: lately.slice(-(BUSY_SAVES + 1)) };
  return lately.length > BUSY_SAVES;
}

// ---------------------------------------------------------------------------
// The used-email list
// ---------------------------------------------------------------------------

export type AcceptOutcome =
  | { outcome: "accepted"; first: boolean }
  | { outcome: "alreadyAnswered" | "wrongCode" | "tooManyWrongTries" | "codeRunOut" };

/** A pending code runs out after this long. */
export const CODE_LIFETIME_MS = 15 * 60 * 1000;
export const MAX_WRONG_TRIES = 5;

/**
 * Check a code, and on the right one use the address up, in ONE transaction.
 *
 * The used-email list is read for this address's hash and the hash added in
 * the transaction that accepts the code, so two browsers with the same code,
 * or two codes for one address, cannot both get through.
 *
 * "Already answered" is only ever an outcome of THIS function, after the
 * right code. And NOTHING SHORT OF THE RIGHT CODE SAYS ANYTHING ELSE: a wrong
 * code gets "that code doesn't match" whether a code is waiting, was used a
 * moment ago, or was never asked for. If a missing code answered differently,
 * somebody could type a classmate's address with any six digits, twice, and
 * learn from the change that the classmate had just got in.
 *
 * A CODE THAT HAS BEEN USED IS KEPT UNTIL IT RUNS OUT, marked done, with a
 * hash of a value only the browser that used it holds (`claimHash`). That is
 * for the phone whose request arrived and whose answer did not: it asks again
 * with the same code and the same value, and is let in again as the same
 * person. Without that, a lost reply would leave a student shut out for good,
 * their address used and no pass to show for it. Another browser, with the
 * same code and a value of its own, gets "that code doesn't match".
 */
export async function acceptCode(
  db: Firestore,
  state: SurveyState,
  hashes: AddressHashes,
  codeMatches: (stored: string) => boolean,
  claimHash: string,
  now: number,
): Promise<AcceptOutcome> {
  const pendingRef = db.collection(CODES_COLLECTION).doc(hashes.pending);
  const listRef = usedRef(db, state.epoch, hashes.used);
  const entry = new FieldPath("h", hashes.used);

  return db.runTransaction(async (tx): Promise<AcceptOutcome> => {
    const pending = await tx.get(pendingRef);
    if (!pending.exists) return { outcome: "wrongCode" };
    const data = pending.data() ?? {};
    const runsOut = data.runsOut instanceof Timestamp ? data.runsOut.toMillis() : 0;
    if (runsOut <= now) {
      tx.delete(pendingRef);
      return { outcome: "codeRunOut" };
    }
    const matches = codeMatches(String(data.code ?? ""));
    if (data.done === true) {
      // Used already. The browser that used it may ask again; nobody else may.
      return matches && data.claim === claimHash ? { outcome: "accepted", first: false } : { outcome: "wrongCode" };
    }
    if (!matches) {
      const tries = (typeof data.tries === "number" ? data.tries : 0) + 1;
      if (tries >= MAX_WRONG_TRIES) {
        tx.delete(pendingRef);
        return { outcome: "tooManyWrongTries" };
      }
      tx.update(pendingRef, { tries });
      return { outcome: "wrongCode" };
    }

    const [list] = await tx.getAll(listRef, { fieldMask: [entry] });
    if (!list.exists) {
      tx.delete(pendingRef);
      return { outcome: "codeRunOut" }; // storage was cleared under this request
    }
    if (list.get(entry) === true) {
      tx.delete(pendingRef);
      return { outcome: "alreadyAnswered" };
    }
    tx.update(listRef, entry, true);
    tx.update(pendingRef, { done: true, claim: claimHash });
    return { outcome: "accepted", first: true };
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

export const CODES_PER_DAY = 10;
export const CODE_COOLDOWN_SECONDS = 60;

/**
 * Take one of an address's codes for today, and store the new pending code in
 * place of any old one: one code a minute and ten a day for each address.
 * A refusal inside the minute changes nothing, so the code sent a moment ago
 * still works.
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
 * WITH FEW PEOPLE SAVING, EVERY SAVE LEVELS: it and a rewrite of every other
 * shared document go in one commit, so this document's update time is one
 * they all share and no save can be dated by it. In a room (`BUSY_SAVES`) a
 * save writes this document alone, and the documents are levelled by
 * whichever save finds them last levelled more than `LEVEL_EVERY_MS` ago.
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

  // `f` is written only by the save that finishes. A save that does not
  // finish never writes it, so one that crosses a finish in flight cannot
  // put an unfinished mark back over a finished one.
  const lock = finished ? [at("f"), true] : [];

  const busy = busyHere(state, now);
  if (busy && !levelIsDue(state, now)) {
    await ref.update(at("v"), def.version, at("o"), target.order, at("p", pageId), answers, ...lock);
    return;
  }
  levelledHere = { epoch: state.epoch, at: now };
  const batch = db.batch();
  const value = levelWrites(db, batch, state, { skipAnswers: target.shard });
  batch.update(ref, at("v"), def.version, at("o"), target.order, at("p", pageId), answers, "beat", value, ...lock);
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
export async function restartStorage(db: Firestore, previous: SurveyState, stage: AiSurveyStage): Promise<SurveyState | null> {
  const fresh = { ...freshState(), stage, codeCeiling: previous.codeCeiling };
  await makeDocuments(db, fresh.epoch, 0, true);
  // Two presses at once (Open twice, or Open and Clear) must not both win: the
  // state is switched only if it is still the one this press started from.
  const switched = await db.runTransaction(async (tx) => {
    const now = await tx.get(stateRef(db));
    if (now.get("epoch") !== previous.epoch) return false;
    tx.set(stateRef(db), { ...fresh, adminUids: previous.adminUids });
    return true;
  });
  if (!switched) {
    await deleteEpochDocuments(db, fresh.epoch, SHARDS_PER_GENERATION, true);
    return null;
  }
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
  // Each record is deleted ONLY IF IT IS STILL THE ONE THAT WAS READ. Somebody
  // may ask for a new code between the read and the delete, and that replaces
  // the run-out record under the same id: an unconditional delete would take
  // their new code with it.
  const docs = [...codes.docs, ...limits.docs].slice(0, 450);
  const results = await Promise.allSettled(docs.map((doc) => doc.ref.delete({ lastUpdateTime: doc.updateTime })));
  const deleted = results.filter((result) => result.status === "fulfilled").length;
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
  return deleted;
}
