import "server-only";
import { isCampaignSlug } from "@/lib/campaign/attribution";
import { PRINTED_LINKS } from "@/lib/campaign/printedLinks";
import { lookupTrackedLink } from "@/lib/campaign/trackedLinkStore";
import { runsCheckIn } from "@/lib/events/checkInAccess";
import { DOOR_CODE_LINE, eventOfCheckInPath } from "@/lib/events/doorCode";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeEvent } from "@/lib/firestore/events";
import { parseDestination } from "@/lib/firestore/trackedLinks";
import { eventOfSurveyCodePath, surveyCodeAtEvent } from "@/lib/surveys/events/code";
import { eventSurveyOf } from "@/lib/surveys/events/records";

/**
 * Who may draw, download or print the code of a short link, decided in one
 * place for the image route and the sign page.
 *
 *  - ADMINS, for any link that exists: a record in `trackedLinks`, or a code
 *    on the printed list that has no record yet (it is answered from that
 *    list, so its code works).
 *  - THE PEOPLE WHO RUN CHECK-IN (`runsCheckIn`), for an event's door code:
 *    the link that goes to an event's check-in page. Its sign carries the
 *    event's name and the line about who checks themselves in.
 *  - THE SAME PEOPLE, for an event survey's code (the link that goes to an
 *    event's survey page) while that survey is taking answers, which they
 *    show at the end of the event: `surveyCodeAtEvent`, the one rule the
 *    event's Survey after tab asks too.
 *
 * Everybody else is refused before any link is read. A slug that names no
 * link is refused too, so neither door is a QR drawer for made-up addresses.
 */

export type DrawableLink = {
  slug: string;
  /** What the sign says the code is: the event's name for a door code, else the link's own. */
  name: string;
  /** A line the sign prints under the address, or null for none. */
  note: string | null;
  /** Where the sign page's "Back" goes. */
  backHref: string;
};

export type CodeAccess =
  | { ok: true; link: DrawableLink }
  | { ok: false; status: 403 | 404 | 503; reason: string };

const ADMINS_ONLY = "Only admins can print or download this code.";

export async function codeForViewer(user: SessionUser, rawSlug: string): Promise<CodeAccess> {
  const slug = rawSlug.toLowerCase();
  if (!isCampaignSlug(slug)) {
    return { ok: false, status: 404, reason: "There is no short link at that address." };
  }
  const admin = user.role === "admin";
  if (!admin && !runsCheckIn(user)) return { ok: false, status: 403, reason: ADMINS_ONLY };

  const lookup = await lookupTrackedLink(slug);
  const printed = PRINTED_LINKS.find((link) => link.slug === slug) ?? null;
  const record =
    lookup.state === "found" ? lookup.link : lookup.state === "unavailable" ? lookup.lastKnown : null;

  if (record) {
    const parsed = parseDestination(record.destination);
    const eventId = parsed.ok && parsed.kind === "internal" ? eventOfCheckInPath(parsed.value) : null;
    if (eventId) {
      return {
        ok: true,
        link: {
          slug,
          name: (await eventTitle(eventId)) ?? (record.label || slug),
          note: DOOR_CODE_LINE,
          backHref: `/events/manage/${eventId}/check-in`,
        },
      };
    }
    if (!admin) {
      const surveyEventId = parsed.ok && parsed.kind === "internal" ? eventOfSurveyCodePath(parsed.value) : null;
      if (surveyEventId && (await surveyCodeShowable(user, surveyEventId))) {
        return {
          ok: true,
          link: { slug, name: record.label || slug, note: null, backHref: `/events/manage/${surveyEventId}/survey` },
        };
      }
      return { ok: false, status: 403, reason: ADMINS_ONLY };
    }
    return {
      ok: true,
      link: { slug, name: record.label || slug, note: null, backHref: "/admin/links" },
    };
  }
  if (printed) {
    if (!admin) return { ok: false, status: 403, reason: ADMINS_ONLY };
    return {
      ok: true,
      link: { slug, name: printed.label, note: null, backHref: "/admin/links" },
    };
  }
  if (lookup.state === "unavailable") {
    return { ok: false, status: 503, reason: "Couldn't read the link just now. Try again in a minute." };
  }
  return { ok: false, status: 404, reason: "There is no short link at that address." };
}

/** Whether the event's survey is one this viewer may show the code of now. */
async function surveyCodeShowable(user: SessionUser, eventId: string): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;
  return surveyCodeAtEvent(user, await eventSurveyOf(db, eventId), new Date()) === "show";
}

/** The event's name as its sign prints it, or null when the event is gone. */
async function eventTitle(eventId: string): Promise<string | null> {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("events").doc(eventId).get();
  if (!snap.exists) return null;
  return normalizeEvent(snap.id, snap.data() ?? {}).title.trim() || null;
}
