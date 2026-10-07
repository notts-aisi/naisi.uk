import "server-only";
import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_PAUSED_MESSAGE,
  DEFAULT_SITE_NOTICE,
  SITE_NOTICE_PATH,
  isSurfacePaused,
  normaliseSiteNotice,
} from "@/lib/siteNotice";

/**
 * The request plumbing the applicant's two write routes share: how often a
 * save and a send may be asked for, how a body is read, and the site-wide
 * pause.
 *
 * It reaches the site notice and nothing else. In particular it does not
 * import the older form's `applyContext`, which can address the collection
 * holding access-requirements answers: a route that only saves a draft has no
 * business with that collection in its import graph.
 */

/**
 * Abuse throttles. The per-address numbers are generous on purpose: a society
 * shares campus NAT, and on the two days of a fair a whole queue applies from
 * one address. The per-account numbers are where a single caller is bounded.
 *
 * SAVE is its own axis. The form saves a few seconds after somebody stops
 * typing, so ten minutes spent on one long answer is a few dozen legitimate
 * saves before a single button is pressed. SEND is a deliberate press, and a
 * person has no reason to be near its limit.
 */
export const APPLICANT_RATE_LIMITS = {
  windowMs: 10 * 60 * 1000,
  saveIpMax: 6000,
  saveUidMax: 300,
  sendIpMax: 240,
  sendUidMax: 12,
} as const;

/** The most a save may carry. A real form is a few thousand characters. */
export const MAX_DRAFT_BODY_CHARS = 200_000;

export const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a few minutes and try again.";

export function tooManyAttempts(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: TOO_MANY_ATTEMPTS },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/**
 * The request's JSON object, or null when it is not one. An oversized body is
 * refused before it is parsed.
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_DRAFT_BODY_CHARS * 4) return null;
    const text = await req.text();
    if (text.length > MAX_DRAFT_BODY_CHARS) return null;
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The maintenance pause on applications, as the sentence to show, or null.
 *
 * FAIL-OPEN on an unreadable notice: refusing an application because the
 * outage banner could not be read would be an outage caused by the outage
 * banner. The stored flag is the one the older rounds read
 * (`courseApplications`), so one switch in the admin area pauses both.
 */
export async function applicationsPaused(db: Firestore): Promise<string | null> {
  let notice = DEFAULT_SITE_NOTICE;
  try {
    const snap = await db.collection(SITE_NOTICE_PATH.collection).doc(SITE_NOTICE_PATH.doc).get();
    notice = normaliseSiteNotice(snap.exists ? snap.data() : null, new Date());
  } catch {
    return null;
  }
  if (!isSurfacePaused(notice, "courseApplications")) return null;
  return notice.bannerMessage || DEFAULT_PAUSED_MESSAGE;
}
