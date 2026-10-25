import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { googleSubscribeUrl, outlookSubscribeUrl, webcalUrl } from "@/lib/events/ics";
import {
  CALENDAR_LINKS_COLLECTION,
  isCalendarToken,
  normalizeCalendarLink,
  type CalendarLinkDoc,
} from "@/lib/firestore/calendarLinks";
import { CALENDAR_NAME } from "./calendarWords";

/**
 * A PERSON'S CALENDAR LINK, made, found and replaced (board
 * st-calendar-phone). The record is `calendarLinks/{uid}`
 * (`src/lib/firestore/calendarLinks.ts`); what a link's calendar holds is
 * `src/lib/courses/calendarFeed.ts`.
 *
 * THE TOKEN IS A SECRET. Nothing here writes it to a log line or puts it in
 * an error.
 */

const TOKEN_BYTES = 32;

/** A new token: 32 bytes from the platform's secure source. */
export function mintCalendarToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * WHOSE LINK THIS IS, or null. A token of the wrong shape is nobody's and is
 * not looked up; an unknown or replaced one is nobody's; so is one that more
 * than one document claims, which no writer here makes. One equality on the
 * token, which the automatic index serves.
 */
export async function calendarLinkOwner(db: Firestore, token: string): Promise<string | null> {
  if (!isCalendarToken(token)) return null;
  const snap = await db.collection("calendarLinks").where("token", "==", token).limit(2).get();
  if (snap.docs.length !== 1) return null;
  const doc = snap.docs[0];
  const link = normalizeCalendarLink(doc.id, doc.data() ?? {});
  return link && link.token === token ? link.uid : null;
}

/** The person's link as stored, or null when they have none. */
export async function readCalendarLink(db: Firestore, uid: string): Promise<CalendarLinkDoc | null> {
  const snap = await db.collection("calendarLinks").doc(uid).get();
  return snap.exists ? normalizeCalendarLink(snap.id, snap.data() ?? {}) : null;
}

/**
 * THE PERSON'S TOKEN: the one they have, made the first time they ask, or,
 * with `replace`, a new one written over it, after which the old one opens
 * nothing. In one transaction, so two dialogs opened at once make one link.
 */
export async function openCalendarLink(
  db: Firestore,
  uid: string,
  { replace }: { replace: boolean },
): Promise<string> {
  const ref = db.collection("calendarLinks").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? normalizeCalendarLink(snap.id, snap.data() ?? {}) : null;
    if (stored && !replace) return stored.token;
    const token = mintCalendarToken();
    tx.set(ref, { uid, token, createdAt: FieldValue.serverTimestamp() });
    return token;
  });
}

/**
 * Delete the person's calendar link, with their account
 * (`deleteAccountCascade`): the one document at their uid, and nobody else's.
 * True when there was one. Its token then opens nothing.
 */
export async function deleteCalendarLink(db: Firestore, uid: string): Promise<boolean> {
  const ref = db.collection(CALENDAR_LINKS_COLLECTION).doc(uid);
  if (!(await ref.get()).exists) return false;
  await ref.delete();
  return true;
}

/** This site's own address, with no trailing slash. "" when it is not set. */
export function siteAddress(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
}

/** The feed's path for a token. */
export function calendarFeedPath(token: string): string {
  return `/api/courses/calendar/${token}/sessions.ics`;
}

/** A run's own page in the member area, where an online week's way to join is, or null when the site does not know its own address. */
export function programmePageAddress(runId: string): string | null {
  const base = siteAddress();
  return base ? `${base}/learn/${encodeURIComponent(runId)}` : null;
}

/** Where each of the dialog's four buttons goes, for one token. */
export type CalendarTargets = {
  /** The link itself, as Copy the link copies it. */
  url: string;
  /** `webcal:`, which Apple Calendar subscribes to. */
  apple: string;
  google: string;
  outlook: string;
};

/** The four targets, or null when the site does not know its own address. */
export function calendarTargets(token: string): CalendarTargets | null {
  const base = siteAddress();
  if (!base) return null;
  const url = `${base}${calendarFeedPath(token)}`;
  return {
    url,
    apple: webcalUrl(url),
    google: googleSubscribeUrl(url),
    outlook: outlookSubscribeUrl(url, CALENDAR_NAME),
  };
}
