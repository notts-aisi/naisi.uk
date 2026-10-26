import { isCrestKey, type CrestKey } from "./keys";

/**
 * WHICH CREST A PAGE SHOWS. The one answer, for every page.
 *
 * A crest is set by an admin in two places: on a COURSE (`courses/{id}.crest`,
 * in the course editor) and on a PROGRAMME of a term's application form
 * (`programmes.<id>.crest`, in the programme's Settings). Either can be
 * empty. Every page that draws a crest asks one of the three functions below
 * and draws what it answers with `ProgrammeMark`; null means the NAISI emblem
 * stands in the crest's place.
 *
 *   for a programme   its own crest; else its course's; else the emblem
 *   for a run         the crest of the programme that names it; else its
 *                     course's; else the emblem
 *   for a course      its crest; else the emblem
 *
 * Rules a maintainer has to keep:
 *
 * 1. NO OTHER FILE CHOOSES BETWEEN CRESTS. A page never writes
 *    `programme.crest ?? course.crest` for itself: two pages with two rules
 *    would show one programme two ways. `tests/programme-crest-resolve.test.mjs`
 *    walks `src` and holds every reader of a stored crest to a list, with no
 *    fallback of its own.
 * 2. A CREST IS NEVER WORKED OUT FROM A NAME, A SLUG OR AN ID. The only
 *    inputs are the two stored `crest` fields. A programme called "Alignment"
 *    with no crest set shows the emblem, which is the admin's to change.
 * 3. A PROGRAMME'S COURSE IS THE ONE IT IS TIED TO (`courseId`). The run a
 *    programme names is always a run of that course: naming one is refused
 *    otherwise, and so is every hand-over to it (`runStanding` in
 *    `src/lib/applications/handover/run.ts`). So the course of the named run
 *    and the course of the tie are one course, and a programme reads its
 *    course's crest before any run is named as well as after.
 * 4. A STORED VALUE THAT IS NOT ONE OF THE FOUR KEYS IS NO CREST, here as in
 *    the readers, so a bad value shows the emblem rather than failing.
 *
 * Pure, with no read of its own and no server import, so the editors' own
 * previews ask the same functions as the pages.
 */

/** Anything that carries a stored crest: a course, or a programme on a form. */
export type HoldsCrest = { crest: CrestKey | null } | null | undefined;

/** The crest a page shows, or null for the NAISI emblem in its place. */
export type ShownCrest = CrestKey | null;

/** A stored crest, read the one way: one of the four keys, or none. */
function storedCrest(holder: HoldsCrest): CrestKey | null {
  return holder && isCrestKey(holder.crest) ? holder.crest : null;
}

/** A programme on a form: its own crest; else its course's; else the emblem. */
export function crestForProgramme(programme: HoldsCrest, course: HoldsCrest): ShownCrest {
  return storedCrest(programme) ?? storedCrest(course);
}

/** A course run: the crest of the programme that names it; else its course's; else the emblem. */
export function crestForRun(namingProgramme: HoldsCrest, course: HoldsCrest): ShownCrest {
  return storedCrest(namingProgramme) ?? storedCrest(course);
}

/** A course on its own, as a card on /courses draws it: its crest; else the emblem. */
export function crestForCourse(course: HoldsCrest): ShownCrest {
  return storedCrest(course);
}
