import "server-only";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import { AI_SURVEY, closesAtInstant, missingBeforeOpening } from "./definition";
import { buildExport } from "./exportCsv";
import { randomBelow } from "./pass";
import {
  CODE_CEILING_PER_HOUR,
  closeNow,
  codesInLastHour,
  hasRealEmailKey,
  peekState,
  readAllSets,
  restartStorage,
  STATE_COLLECTION,
  stageAt,
  surveyDb,
  type SurveyState,
} from "./store";
import type { AiSurveyStage } from "./types";

/**
 * The admin side of the AI at Nottingham survey: who may open it, and the
 * five things they can do there.
 *
 * WHO. Not the admin role. The survey tells students that one person opens
 * individual answers, so the page, the export and every action below answer
 * to an ALLOWLIST OF ACCOUNTS kept on the survey's own record, and to nothing
 * else. An admin who is not on it is refused like anybody else.
 *
 * The list is changed only by hand, in the datastore. No route and no page
 * can add an account to it, the admin role included, so being an admin is
 * not a way onto it.
 *
 * NOTHING HERE IS ABOUT ONE PERSON. The counts are totals, the export has no
 * ids and no times, and no function returns one answer set with anything that
 * says whose it is, because nothing kept says whose it is.
 */

export type SurveyAdmin = { user: SessionUser; db: Firestore; state: SurveyState };

/**
 * The survey's admin side for one signed-in account, or null when that
 * account is not on the list. The caller proves who is asking first
 * (`getCurrentUser`) and hands the answer here, so every route's own first
 * lines say that it is gated.
 */
export async function surveyAdminFor(user: SessionUser): Promise<SurveyAdmin | null> {
  const db = surveyDb();
  if (!db) return null;
  // Looked at, never made: a survey nobody has visited has no list to be on.
  const state = await peekState(db);
  return state && state.adminUids.includes(user.uid) ? { user, db, state } : null;
}

/** For a page: who is asking, and whether the admin side is theirs. */
export async function surveyAdmin(): Promise<{ signedIn: boolean; admin: SurveyAdmin | null }> {
  const user = await getCurrentUser();
  if (!user) return { signedIn: false, admin: null };
  return { signedIn: true, admin: await surveyAdminFor(user) };
}

/** What must be true before the survey can open, each with whether it is. */
export type OpeningCheck = { name: string; set: boolean };

export function openingChecks(): OpeningCheck[] {
  const missing = missingBeforeOpening();
  return [
    ...AI_SURVEY.mustBeSetBeforeOpening.map((name) => ({ name: String(name), set: !missing.includes(name) })),
    // The real key for the used-email list: Pilot runs on a stand-in, and an
    // open survey must not.
    { name: "AI_SURVEY_EMAIL_KEY", set: hasRealEmailKey() },
    // A database of its own, with no recovery copies: a copy of an earlier
    // state is a record of when each answer arrived.
    { name: "AI_SURVEY_DATABASE", set: Boolean(process.env.AI_SURVEY_DATABASE?.trim()) },
  ];
}

export type ShortLinkRow = { slug: string; where: string; scans: number };

export type AdminView = {
  stage: AiSurveyStage;
  started: number;
  finished: number;
  codesLastHour: number;
  ceiling: number;
  checks: OpeningCheck[];
  canOpen: boolean;
  shortLinks: ShortLinkRow[];
  downloads: number;
};

/** Scans of the survey's short links, in total. Counted per code per day, and never who scanned. */
async function scansBySlug(slugs: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>(slugs.map((slug) => [slug, 0]));
  // The scan counters live in the site's own database, whichever database the
  // survey's records are in. One range on one field, so no index is needed.
  const db = getAdminDb();
  if (!db) return totals;
  const snap = await db.collection("linkScanDays").where("date", ">=", "2026-11-01").get();
  for (const doc of snap.docs) {
    const slug = doc.get("slug");
    const count = doc.get("count");
    if (typeof slug === "string" && totals.has(slug) && typeof count === "number") {
      totals.set(slug, (totals.get(slug) ?? 0) + count);
    }
  }
  return totals;
}

const downloadsRef = (db: Firestore) => db.collection(STATE_COLLECTION).doc("downloads");

export async function adminView(db: Firestore, state: SurveyState, now: number = Date.now()): Promise<AdminView> {
  const [sets, codes, scans, downloads] = await Promise.all([
    readAllSets(db, state),
    codesInLastHour(db, now),
    scansBySlug(AI_SURVEY.shortLinks.map((link) => link.slug)).catch(() => new Map<string, number>()),
    downloadsRef(db).get(),
  ]);
  const checks = openingChecks();
  const stage = stageAt(state, now).stage;
  const log = downloads.data()?.log;
  return {
    stage,
    started: sets.length,
    finished: sets.filter((set) => set.finished).length,
    codesLastHour: codes,
    ceiling: CODE_CEILING_PER_HOUR,
    checks,
    canOpen: stage === "pilot" && checks.every((check) => check.set) && now < closesAtInstant().getTime(),
    shortLinks: AI_SURVEY.shortLinks.map((link) => ({ slug: link.slug, where: link.where, scans: scans.get(link.slug) ?? 0 })),
    downloads: Array.isArray(log) ? log.length : 0,
  };
}

export type ActionResult = { ok: true } | { ok: false; error: "wrongStage" | "notReady" | "notConfirmed" };

/**
 * Open the survey. Only from Pilot, and only when everything it needs is set.
 * OPENING CLEARS PILOT DATA FIRST: every pilot answer, the pilot used-email
 * list and every pilot pass go, and the open survey starts on new storage.
 */
export async function openSurvey(db: Firestore, state: SurveyState, now: number = Date.now()): Promise<ActionResult> {
  if (stageAt(state, now).stage !== "pilot") return { ok: false, error: "wrongStage" };
  if (!openingChecks().every((check) => check.set)) return { ok: false, error: "notReady" };
  if (now >= closesAtInstant().getTime()) return { ok: false, error: "notReady" };
  await restartStorage(db, state, "open");
  return { ok: true };
}

/** Close it now. Nobody new can start; anybody part way through has thirty minutes to save. */
export async function closeSurvey(db: Firestore, state: SurveyState, now: number = Date.now()): Promise<ActionResult> {
  if (stageAt(state, now).stage !== "open") return { ok: false, error: "wrongStage" };
  await closeNow(db);
  return { ok: true };
}

/** What has to be typed to clear pilot data: the last three words of the label that asks for it. */
export const CLEAR_PHRASE = "clear pilot data";

/** Throw away the pilot answers and the pilot used-email list. Works only in Pilot, and only with the phrase typed. */
export async function clearPilot(db: Firestore, state: SurveyState, typed: unknown, now: number = Date.now()): Promise<ActionResult> {
  if (stageAt(state, now).stage !== "pilot") return { ok: false, error: "wrongStage" };
  if (typeof typed !== "string" || typed.trim().toLowerCase() !== CLEAR_PHRASE) return { ok: false, error: "notConfirmed" };
  await restartStorage(db, state, "pilot");
  return { ok: true };
}

/**
 * The answers as a file, with the download recorded FIRST: who, when and how
 * many rows, in the survey's own record. A download that cannot be recorded
 * is refused, so none goes unrecorded.
 *
 * Not in `dataExports`: the privacy policy names each kind of download kept
 * there, and this file holds no names.
 */
export async function exportAnswers(db: Firestore, state: SurveyState, actorUid: string): Promise<{ csv: string; rows: number }> {
  const sets = await readAllSets(db, state);
  await downloadsRef(db).set(
    { log: FieldValue.arrayUnion({ at: Timestamp.now(), by: actorUid, rows: sets.length }) },
    { merge: true },
  );
  return { csv: buildExport(sets, randomBelow), rows: sets.length };
}
