import { COURSE_DOCUMENT_KEYS, facilitatorGuidePath } from "./model";
import {
  FACILITATOR_GUIDE,
  guideForWeekWords,
  guideNothingLoadedWords,
  guideWeekNotLoadedWords,
} from "./words";

/**
 * THE GUIDE'S LINKS ON A SESSION CARD, decided once for every page that draws
 * them: a facilitator's Home (its This week card, and its card after the last
 * session), the ticket on the facilitator's group page, and the register.
 *
 * A read of the guide answers one of three ways (`GuideRead`):
 *
 *  - FAILED: the read threw, the route answered not-ok, or the gate refused
 *    the caller. A page cannot tell these apart and does not try.
 *  - EMPTY: the guide has nothing loaded for the course at all.
 *  - LOADED: something is, with the week numbers that have a session plan or
 *    notes (empty when only the course's own documents are).
 *
 * And the card then draws (`guideLinksView`):
 *
 *  - the week loaded: "Facilitator guide for week 3" and "Facilitator guide";
 *  - the week not loaded, something else loaded: a sentence saying the week's
 *    plan is not in the guide yet and who loads it, and "Facilitator guide";
 *  - nothing loaded: one sentence, in place of both links;
 *  - failed: "Facilitator guide" alone, and only for somebody the page
 *    already knows the guide admits (a facilitator of the group, an admin);
 *    nothing at all for anybody else, so the register draws nothing for
 *    somebody covering one session or a run's track lead.
 *
 * Never an error and never a blocked page: the guide is a link beside the
 * page's work, not part of it.
 *
 * Pure, with no server import, so Home in the browser decides by the same
 * rule as the pages drawn on the server.
 */

export type GuideRead = { kind: "failed" } | { kind: "empty" } | { kind: "loaded"; weeks: number[] };

export const GUIDE_READ_FAILED: GuideRead = { kind: "failed" };

/** A whole week number the guide could hold. */
function isWeek(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1;
}

/**
 * The store's answer, read on the server: `readGuideIndex`'s index, or null
 * when the gate refused the caller (which reads as failed).
 */
export function guideReadOfIndex(
  index: { weeks: readonly { weekNumber: number }[]; documents: readonly unknown[] } | null,
): GuideRead {
  if (!index) return GUIDE_READ_FAILED;
  const weeks = index.weeks.map((week) => week.weekNumber).filter(isWeek);
  if (weeks.length === 0 && index.documents.length === 0) return { kind: "empty" };
  return { kind: "loaded", weeks };
}

/**
 * The guide's route's answer, read in the browser
 * (`/api/courses/[courseId]/facilitator-guide`): failed for anything but a
 * 200 about this very course; the weeks it names otherwise. The course's own
 * documents count only by a key the guide has.
 */
export function guideReadOfAnswer(ok: boolean, body: unknown, courseId: string): GuideRead {
  if (!ok || !body || typeof body !== "object") return GUIDE_READ_FAILED;
  const answer = body as { courseId?: unknown; weeks?: unknown; documents?: unknown };
  if (answer.courseId !== courseId || !Array.isArray(answer.weeks)) return GUIDE_READ_FAILED;
  const weeks = answer.weeks
    .map((week) => (week && typeof week === "object" ? (week as { weekNumber?: unknown }).weekNumber : null))
    .filter(isWeek);
  const documents = Array.isArray(answer.documents)
    ? answer.documents.filter((doc) => {
        const key = doc && typeof doc === "object" ? (doc as { key?: unknown }).key : null;
        return typeof key === "string" && (COURSE_DOCUMENT_KEYS as readonly string[]).includes(key);
      }).length
    : 0;
  if (weeks.length === 0 && documents === 0) return { kind: "empty" };
  return { kind: "loaded", weeks };
}

export type GuideLink = { href: string; label: string };

/**
 * What the programme page hands its client component about the guide, for
 * somebody the guide admits and nobody else: the course, and the weeks with
 * something loaded (none when nothing is, or when the read failed for
 * somebody the page knows the guide admits).
 */
export type FacilitatorGuideProp = { courseId: string; weeks: number[] };

/**
 * The programme page's answer from a read: the prop for a reader the guide
 * admitted, the prop with no weeks for one the read failed for whom the page
 * knows the guide admits (an admin, a facilitator of one of the run's live
 * groups), and null for everybody else.
 */
export function facilitatorGuideProp(read: GuideRead, courseId: string, knownReader: boolean): FacilitatorGuideProp | null {
  if (!courseId) return null;
  if (read.kind === "loaded") return { courseId, weeks: [...read.weeks] };
  if (read.kind === "empty" || knownReader) return { courseId, weeks: [] };
  return null;
}

/** "Facilitator guide", to the guide's course page, from the programme page's prop. */
export function standingGuideLink(guide: FacilitatorGuideProp): GuideLink {
  return { href: facilitatorGuidePath(guide.courseId), label: FACILITATOR_GUIDE };
}

/** "Facilitator guide for week 2", from the programme page's prop, when that week is loaded; null otherwise. */
export function weekGuideLink(guide: FacilitatorGuideProp | null, weekNumber: number | null): GuideLink | null {
  if (!guide || weekNumber === null || !isWeek(weekNumber) || !guide.weeks.includes(weekNumber)) return null;
  return { href: facilitatorGuidePath(guide.courseId, { kind: "week", weekNumber }), label: guideForWeekWords(weekNumber) };
}

/** What a session card draws of the guide: each part, or null where it draws none. */
export type GuideLinksView = {
  /** "Facilitator guide for week 3", to that week's page. */
  week: GuideLink | null;
  /** "Facilitator guide", to the guide's course page with every week. */
  standing: GuideLink | null;
  /** The sentence for a week, or a course, with nothing loaded. */
  sentence: string | null;
};

export const NO_GUIDE_LINKS: GuideLinksView = { week: null, standing: null, sentence: null };

/** The one rule (see the module comment). */
export function guideLinksView(args: {
  read: GuideRead;
  courseId: string;
  /** The week the card is about, or null when no session is ahead. */
  weekNumber: number | null;
  /** The page already knows the guide admits this reader: a facilitator of the group, or an admin. */
  knownReader: boolean;
  /** The programme's lead's first name, where the page knows the group; null when no lead stands. */
  leadFirstName: string | null;
}): GuideLinksView {
  const { read, courseId, weekNumber, knownReader, leadFirstName } = args;
  if (!courseId) return NO_GUIDE_LINKS;
  const standing = { href: facilitatorGuidePath(courseId), label: FACILITATOR_GUIDE };
  if (read.kind === "failed") return knownReader ? { week: null, standing, sentence: null } : NO_GUIDE_LINKS;
  if (read.kind === "empty") return { week: null, standing: null, sentence: guideNothingLoadedWords(leadFirstName) };
  if (weekNumber === null || !isWeek(weekNumber)) return { week: null, standing, sentence: null };
  if (read.weeks.includes(weekNumber)) {
    return {
      week: { href: facilitatorGuidePath(courseId, { kind: "week", weekNumber }), label: guideForWeekWords(weekNumber) },
      standing,
      sentence: null,
    };
  }
  return { week: null, standing, sentence: guideWeekNotLoadedWords(weekNumber, leadFirstName) };
}
