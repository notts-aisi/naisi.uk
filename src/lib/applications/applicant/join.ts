import { DEFAULT_AVAILABILITY_GRID, emptyMask } from "@/lib/admissions/availability";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "@/lib/firestore/notifications";
import { STATUSES_WITH_GRADUATION, type AffiliationStatus } from "@/lib/firestore/users";
import type { AboutYou, ApplicationContent } from "../model";
import { issuesFor } from "../validate";
import { aboutYouFromAccount } from "./account";
import { own } from "./keys";

/**
 * JOINING ON THE FORM.
 *
 * Somebody with no account meets the form's first step, About you, which
 * asks the same questions as joining the site. For them that step IS the
 * join request: they answer it once, make an account (Google, or an email
 * address), and what they typed is sent as their join request by the same
 * client function the register page calls (`completeRegistration`), then
 * copied into the application.
 *
 * This module is the rules of that, with no import that runs on a server or
 * in a browser only, so the step, the send route and the tests all read the
 * same ones:
 *
 *  - WHAT STOPS A JOIN REQUEST (`joinIssues`). The form's other steps never
 *    block Continue. This one does, because a join request is a document the
 *    committee reads and approves, not a draft.
 *  - WHAT IS SENT (`joinRequestFrom`). Field by field, so nothing typed
 *    anywhere else can ride along.
 *  - WHAT IS KEPT WHILE THEY SIGN IN (`packKept`, `readKept`). The answers to
 *    this one step and nothing else, for a day at most.
 *  - WHAT HOLDS A SEND (`sendHoldFor`). An account still waiting to be
 *    approved cannot send an application until its university address has
 *    been checked. See the note on that function for why.
 *  - WHERE THE EMAILED LINK MAY RETURN TO (`joinReturnFor`,
 *    `formJoinReturn`).
 *  - WHERE SIGNING IN RETURNS TO (`signInHrefFor`, `newAccountReturn`).
 */

/** The About you answers a join request carries. The address's verified flag is never one of them. */
const JOIN_FIELDS = [
  "preferredName",
  "universityEmail",
  "status",
  "statusOther",
  "subject",
  "expectedGraduation",
  "motivation",
  "interests",
] as const satisfies readonly (keyof AboutYou)[];

/** A step nobody has typed in yet. */
export function emptyJoinAnswers(): AboutYou {
  return aboutYouFromAccount(null);
}

/** True when any answer holds something. */
export function hasJoinAnswers(about: AboutYou): boolean {
  return JOIN_FIELDS.some((field) => about[field].trim().length > 0);
}

// ---------------------------------------------------------------------------
// What stops a join request
// ---------------------------------------------------------------------------

/** The sentence the register page shows for the same omission. */
export const CONSENT_NEEDED = "Please agree to the Terms of Use and Privacy Policy to continue.";

/** A form with nothing on it: only the About you rules have anything to say. */
const NO_FORM = { programmeIds: [], programmes: {}, questionSetIds: [], asksFacilitating: false };

function aboutOnly(about: AboutYou): ApplicationContent {
  return {
    aboutYou: about,
    rankedProgrammeIds: [],
    wantsToFacilitate: null,
    answers: {},
    availability: emptyMask(DEFAULT_AVAILABILITY_GRID),
    suMembership: null,
  };
}

/**
 * Everything that stops these answers being sent as a join request, as
 * sentences, in the order the step asks. Empty means it can be sent.
 *
 * The About you rules are the contract's own (`issuesFor`), asked of a form
 * with nothing else on it, so the step and a later send of the application
 * cannot disagree about what a complete About you is. Agreeing to the terms
 * is the one rule that belongs to joining alone.
 */
export function joinIssues(about: AboutYou, agreed: boolean): string[] {
  const issues = issuesFor(NO_FORM, [], aboutOnly(about))
    .filter((issue) => issue.step === "about")
    .map((issue) => issue.message);
  if (!agreed) issues.push(CONSENT_NEEDED);
  return issues;
}

// ---------------------------------------------------------------------------
// What is sent
// ---------------------------------------------------------------------------

/** The profile `completeRegistration` is handed. Its fields, and no others. */
export type JoinRequest = {
  preferredName: string;
  universityEmail: string;
  status: AffiliationStatus;
  statusOther?: string;
  subject: string;
  expectedGraduation?: string;
  motivation: string;
  interests?: string;
  notifications: NotificationPrefs;
};

/**
 * The join request these answers make.
 *
 * Two things a maintainer has to keep:
 *
 *  - IT NEVER SAYS THE UNIVERSITY ADDRESS IS VERIFIED. The register page can
 *    pass a verified token because its form waits for the emailed link. This
 *    step does not wait, so the address goes in unproved and is stamped
 *    later, on the server, when its owner follows the link.
 *  - THE EMAIL PREFERENCES ARE THE ONES FOR SOMEBODY WHO WAS NOT ASKED. The
 *    register page shows three switches and sends what they say. This step
 *    shows none, so the newsletter and events rows, which are opt-in, go in
 *    switched OFF. Sending the register page's ticked defaults from here
 *    would subscribe somebody to bulk email they were never offered.
 *
 * Call it only for answers `joinIssues` has passed.
 */
export function joinRequestFrom(about: AboutYou): JoinRequest {
  const status = about.status as AffiliationStatus;
  const graduates = (STATUSES_WITH_GRADUATION as readonly string[]).includes(status);
  const statusOther = about.statusOther.trim();
  const interests = about.interests.trim();
  return {
    preferredName: about.preferredName.trim(),
    universityEmail: about.universityEmail.trim(),
    status,
    statusOther: status === "other" && statusOther ? statusOther : undefined,
    subject: about.subject.trim(),
    expectedGraduation: graduates && about.expectedGraduation ? about.expectedGraduation : undefined,
    motivation: about.motivation.trim(),
    interests: interests || undefined,
    notifications: {
      channels: { ...DEFAULT_NOTIFICATION_PREFS.channels },
      categories: { ...DEFAULT_NOTIFICATION_PREFS.categories },
      push: { ...DEFAULT_NOTIFICATION_PREFS.push },
    },
  };
}

// ---------------------------------------------------------------------------
// What is kept while they sign in
// ---------------------------------------------------------------------------

/** How long kept answers are believed. Longer than any sign-in takes. */
export const KEPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const KEPT_VERSION = 1;

/** The one key the step keeps its answers under, per form. */
export function keptKey(roundId: string): string {
  return `naisi.apply.join:${roundId}`;
}

/**
 * The text to keep for these answers.
 *
 * Built field by field from `JOIN_FIELDS`, so the only things that can ever
 * be kept are the answers to this step. A password, the address somebody
 * signs in with, the consent tick and anything about an account are not
 * among them and cannot be added by passing a bigger object.
 */
export function packKept(about: AboutYou, now: number): string {
  const fields: Record<string, string> = {};
  for (const field of JOIN_FIELDS) fields[field] = about[field];
  return JSON.stringify({ v: KEPT_VERSION, at: now, about: fields });
}

/**
 * The answers a kept text holds, or null when there is nothing to believe:
 * no text, text that is not ours, another version, or older than a day.
 *
 * What comes back is read the way a stored profile is read
 * (`aboutYouFromAccount`): each answer capped to its limit, the status one of
 * the site's own, and the address NOT verified whatever the text says.
 */
export function readKept(raw: string | null | undefined, now: number): AboutYou | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { v, at, about } = parsed as { v?: unknown; at?: unknown; about?: unknown };
  if (v !== KEPT_VERSION) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (at > now || now - at > KEPT_MAX_AGE_MS) return null;
  if (!about || typeof about !== "object" || Array.isArray(about)) return null;
  const given = about as Record<string, unknown>;
  const profile: Record<string, unknown> = {};
  for (const field of JOIN_FIELDS) {
    const value = own(given, field);
    if (value !== undefined) profile[field] = value;
  }
  const read = aboutYouFromAccount({ profile });
  return hasJoinAnswers(read) ? read : null;
}

/**
 * Kept answers laid under what is on the screen: an answer already typed is
 * left alone, a blank one takes what was kept.
 */
export function withKept(current: AboutYou, kept: AboutYou): AboutYou {
  const merged: AboutYou = { ...current };
  for (const field of JOIN_FIELDS) {
    if (!current[field].trim()) merged[field] = kept[field];
  }
  // A graduation date belongs to a status. Never keep one beside a status
  // that does not ask for it.
  if (!(STATUSES_WITH_GRADUATION as readonly string[]).includes(merged.status)) merged.expectedGraduation = "";
  if (merged.status !== "other") merged.statusOther = "";
  return merged;
}

// ---------------------------------------------------------------------------
// What holds a send
// ---------------------------------------------------------------------------

/** One thing that stops a send, in the shape the send route reports issues. */
export type SendHold = { step: "about" | "check"; questionId: null; message: string };

export const JOIN_FIRST = "Send your join request first. It is the first step of this form.";
export const VERIFY_FIRST =
  "Check your university email before you send. Open the link we emailed to that address, then send.";

/**
 * True for an account whose university address has to be checked before it
 * can send an application: one that is still waiting to be approved.
 *
 * WHY ONLY A WAITING ACCOUNT. Being accepted onto a programme approves a
 * waiting account, with no committee member looking at it again. So for a
 * waiting account the emailed link is the only check that the person is at
 * the university, and it has to have happened before there is an application
 * to accept. An account that is already approved was checked when it was
 * approved, and is not asked again here.
 */
export function mustVerifyBeforeSending(role: string): boolean {
  return role === "pending";
}

/**
 * What holds this person's send, or null when nothing of this module's does.
 *
 * `joined` is whether the account has a join request at all (a `users`
 * document). `about` is the account's own About you, never the draft's.
 * Saving is never held: an application can be written and saved before the
 * address is checked.
 */
export function sendHoldFor(who: { joined: boolean; role: string; about: AboutYou }): SendHold | null {
  if (!who.joined) return { step: "about", questionId: null, message: JOIN_FIRST };
  if (!mustVerifyBeforeSending(who.role)) return null;
  // An account with no address at all is told to add one by the About you
  // rules. This hold is for an address that is there and not yet proved.
  if (!who.about.universityEmail.trim()) return null;
  if (who.about.universityEmailVerified) return null;
  return { step: "check", questionId: null, message: VERIFY_FIRST };
}

// ---------------------------------------------------------------------------
// Where the emailed link may return to
// ---------------------------------------------------------------------------

/**
 * The return address the step gives the register route: this form, marked as
 * a form that takes the join request itself.
 *
 * The mark is what lets the page that receives the emailed link tell this
 * form from the older rounds at the same kind of address, which still need
 * the register page's own profile form first.
 */
export function joinReturnFor(roundId: string): string {
  return `/apply/${encodeURIComponent(roundId)}?join=1`;
}

const JOIN_RETURN = /^\/apply\/[A-Za-z0-9_-]{1,200}\?join=1$/;

/**
 * `raw` when it is exactly an address `joinReturnFor` makes, otherwise null.
 * The whole shape is matched, so nothing can be appended to one.
 */
export function formJoinReturn(raw: string | null | undefined): string | null {
  return typeof raw === "string" && JOIN_RETURN.test(raw) ? raw : null;
}

// ---------------------------------------------------------------------------
// Where signing in returns to
// ---------------------------------------------------------------------------

/**
 * The sign-in page, with this form as the place to come back to.
 *
 * THE ONE WAY THE FORM'S FIRST STEP MAKES AN ADDRESS OF THE SIGN-IN PAGE. The
 * step has three links there (somebody who already has an account, the same
 * from the screen that says to check an inbox, and the route to Google where
 * Google's own button cannot be drawn), and all three carry this.
 *
 * The return address is the MARKED one. A sign-in page that is handed it
 * knows, from the address alone, that an account with no join request belongs
 * back on this step, which is that account's join request, and not on the
 * register page's own profile form.
 */
export function signInHrefFor(roundId: string): string {
  return `/login?next=${encodeURIComponent(joinReturnFor(roundId))}`;
}

const BARE_FORM_ADDRESS = /^\/apply\/([A-Za-z0-9_-]{1,200})$/;

/**
 * What a sign-in page does with an account that has NO JOIN REQUEST, read
 * from the return address it was handed and from nothing else.
 *
 *  - `form`: the address is one a form's first step marked. Go to `href`.
 *  - `ask`: the address has the shape of a form's and carries no mark: a link
 *    that does not come from the step, a bookmark, an address typed by hand.
 *    Older rounds live at the same kind of address and need the register
 *    page's profile form first, and an address cannot say which this is. So
 *    the caller asks the form's own route about `roundId`, and goes to `href`
 *    only when the answer is a form that is open and has no join request from
 *    this account. Anything else is `register`.
 *  - `register`: every other address, and no address. The register page, as
 *    it has always been.
 *
 * Two things a maintainer has to keep:
 *
 *  - `href` IS BUILT HERE, FROM THE ID ALONE (`joinReturnFor`). Nothing else
 *    of the address handed in is carried, so nothing can ride on it, and the
 *    whole shape is matched before an id is read out of it.
 *  - NEVER TURN `ask` INTO `form`. Sending an account with no join request to
 *    an older round's page, or to a form that is not open, leaves it with no
 *    way to join at all.
 */
export type NewAccountReturn =
  | { to: "form"; href: string }
  | { to: "ask"; roundId: string; href: string }
  | { to: "register" };

export function newAccountReturn(raw: string | null | undefined): NewAccountReturn {
  const marked = formJoinReturn(raw);
  if (marked) return { to: "form", href: marked };
  const bare = typeof raw === "string" ? BARE_FORM_ADDRESS.exec(raw) : null;
  if (bare) return { to: "ask", roundId: bare[1], href: joinReturnFor(bare[1]) };
  return { to: "register" };
}
