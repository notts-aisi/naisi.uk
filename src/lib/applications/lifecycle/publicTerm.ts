import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { AdmissionRoundDoc } from "@/lib/firestore/admissionRounds";
import type { ProgrammeKind, ProgrammeSettings } from "../model";
import type { ApplicationForm } from "../normalise";
import { openProgrammes } from "../sections";
import { applyPathFor, readForms } from "./openForm";
import { termStageFor } from "./status";

/**
 * WHAT A VISITOR MAY BE TOLD ABOUT THIS TERM.
 *
 * One question, asked by pages any visitor can load (the homepage, the
 * programme pages, the signed-in home): where is the term, and what is on
 * it? `findPublicTerm` answers with one stage, the term's own dates and the
 * public half of each programme. It is the sibling of `./openForm.ts`, which
 * answers where the Apply button leads.
 *
 * ## Safe for a page any visitor can load
 *
 * A form is stored on an admission round, which is closed to every browser
 * and carries things no visitor may be told: who leads and who reviews each
 * programme, the live counts of applications, each programme's places and
 * group sizes, the wording of its decision emails, and when and by whom
 * decision day was sent. The read is made on the Admin SDK, so the rules are
 * no defence here, and those things are kept in by PROJECTION: `PublicTerm`
 * is written out field by field below, and no round or form leaves this
 * file. A field added to the round later stays private until somebody names
 * it here on purpose.
 *
 * It imports nothing that reads a review or a decision, and nothing that
 * says who has a role on a form. `tests/applications-public-term.test.mjs`
 * walks its imports to hold that, so a public page may import it.
 *
 * A page hands a component the fields it uses, never the term: every prop of
 * a client component is written into the public HTML.
 *
 * ## The stage is the form's own
 *
 * `termStageFor` (`./status.ts`) says where a form is, from its status, its
 * dates and whether decision day has been sent. It is what the committee's
 * own term page reads, and it rests on `roundWindowState`, the one predicate
 * the form's routes refuse on. Nothing here decides "open" a second time:
 * this module only says each answer again in a visitor's terms.
 *
 * | `termStageFor` says | A visitor is told |
 * | --- | --- |
 * | `draft`, `archived`, `cancelled` | nothing: the form is passed over |
 * | `opens-later` | `before` |
 * | `open` | `open` |
 * | `deciding` | `closed` |
 * | `decided`, `settled` | `running` |
 *
 * With no form left to tell about, the stage is `none`. A form with no
 * programme left on the site is passed over as well, whatever its status: it
 * has nothing to tick and nothing to show.
 *
 * ## When `running` ends
 *
 * `running` begins when decision day has been sent, and it does NOT end when
 * the term is settled. Settling is the committee's own record-keeping: it
 * finishes the term's applications and keeps each applicant's record, an
 * admin is asked to do it as soon as decisions are out, and the committee's
 * term page marks the start as the step a settled term is on, exactly as it
 * does for one that is only decided. What is running is the programmes, and
 * settling says nothing about those.
 *
 * Nothing stored says when a term's programmes finish (a programme's
 * `starts` is a label that is only ever shown), so no clock ends `running`
 * either, and no date is written here to do it. It ends when one of these
 * happens:
 *
 *  - another form becomes this term: the next term's form is opened, with
 *    its opening still ahead or not (`byStanding` below);
 *  - the form is archived, which takes it out of sight everywhere;
 *  - an admin closes the last programme on it, which takes each one off the
 *    site.
 *
 * ## The read
 *
 * `readForms` in `./openForm.ts`: one equality on one field, which needs no
 * declared index, shared with the two lookups there. This module makes no
 * read of its own.
 */

/** Where the term is, as a visitor's page draws it. */
export type PublicTermStage = "none" | "before" | "open" | "closed" | "running";

/** The public half of one programme, under the names it is stored by. */
export type PublicTermProgramme = {
  id: string;
  kind: ProgrammeKind;
  /** "AGI Strategy Fellowship". */
  name: string;
  /** "AGI Strategy". */
  shortName: string;
  /** The one-line description under the name. */
  pitch: string;
  /** The facts line, set in mono: "6 WEEKS · ~5 HRS A WEEK". */
  facts: string;
  /** When it starts, as its lead wrote it: "w/c 26 Oct". Shown, never parsed. */
  starts: string;
  /**
   * The course this programme is for, or null for one with no course page.
   * A course can be unpublished or deleted after the tie was made, so a page
   * treats a course that is not there as no course.
   */
  courseId: string | null;
  /** The course run it places people on, once one is set. A lookup key, never printed. */
  runId: string | null;
};

/** The form that opens after this one: what it is called, and when it opens. */
export type PublicTermNext = { label: string; opensAt: Date };

/** The round's three dates, under the round's own names. */
type TermDates = Pick<AdmissionRoundDoc, "opensAt" | "closesAt" | "decisionsByDate">;

/** What every stage but `none` carries. */
type ToldTerm = TermDates & {
  /** The term, as applicants read it at the top of the form: "Autumn 2026". */
  label: string;
  /**
   * A form that opens after this one, when a visitor may be told about one.
   * Null while the stage is `closed` or `running`: a form whose opening is
   * ahead is this term itself by then (`byStanding`).
   */
  next: PublicTermNext | null;
  /** The programmes on the site, in the form's order. Closed ones are left out. */
  programmes: PublicTermProgramme[];
};

/** No term a visitor may be told about: every fact is null and nothing is on. */
export type NoPublicTerm = { [Field in keyof TermDates]: null } & {
  stage: "none";
  label: null;
  applyPath: null;
  next: null;
  programmes: PublicTermProgramme[];
};

/**
 * The term, as a stranger may know it.
 *
 * `applyPath` is where the form is served, and it is handed over only while
 * the stage is `open`, so a page cannot link to a form that would turn the
 * visitor away.
 *
 * ONCE APPLICATIONS HAVE CLOSED, ONLY THE TIMES THAT HAVE PASSED ARE HANDED
 * OVER. A form closes at the time written on it, or earlier when an admin
 * closes it by hand, and closed by hand either time can still be ahead. A
 * page that printed one would say applications opened or closed on a day
 * that has not come, so in `closed` and `running` such a time is null. It is
 * the rule `CourseFormView` keeps for a course's page.
 */
export type PublicTerm =
  | (ToldTerm & { stage: "open"; applyPath: string })
  | (ToldTerm & { stage: "before" | "closed" | "running"; applyPath: null })
  | NoPublicTerm;

const NO_DATES: { [Field in keyof TermDates]: null } = { opensAt: null, closesAt: null, decisionsByDate: null };

/** The answer when there is no term to tell about. A new object each time, so no caller can change another's. */
export function noPublicTerm(): NoPublicTerm {
  const { opensAt, closesAt, decisionsByDate } = NO_DATES;
  return { stage: "none", label: null, opensAt, closesAt, decisionsByDate, applyPath: null, next: null, programmes: [] };
}

// ---------------------------------------------------------------------------
// Which forms a visitor may be told about, and where each is
// ---------------------------------------------------------------------------

type ToldStage = Exclude<PublicTermStage, "none">;

/** A form a visitor may be told about, with the stage it is at. */
type Told = { form: ApplicationForm; stage: ToldStage };

/** The stage a visitor is told for this form, or null for a form told to nobody. */
function toldStageOf(form: ApplicationForm, now: Date): ToldStage | null {
  if (openProgrammes(form).length === 0) return null;
  const { status, archived, opensAt, closesAt } = form.round;
  const stage = termStageFor({ status, archived, opensAt, closesAt, decisionsSentAt: form.decisionsSentAt }, now);
  switch (stage) {
    case "draft":
    case "archived":
    case "cancelled":
      return null;
    case "opens-later":
      return "before";
    case "open":
      return "open";
    case "deciding":
      return "closed";
    case "decided":
    case "settled":
      return "running";
  }
}

/** Taking applications, then opening later, then closed whether or not decisions have gone. */
function standingOf(stage: ToldStage): number {
  if (stage === "open") return 0;
  if (stage === "before") return 1;
  return 2;
}

function compare(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** A time to order by. A missing one stands wherever `missing` puts it. */
function timeOf(at: Date | null, missing: number): number {
  return at === null ? missing : at.getTime();
}

/**
 * WHICH FORM IS THIS TERM. There is one form a term, but last term's is still
 * stored when next term's is made, so a visitor could be told about more
 * than one. This is the one place the choice is made: the forms are put in
 * this order and the first is this term.
 *
 *  1. A form that is taking applications. With two, the one that closes
 *     first, because that is the one somebody could miss.
 *  2. Otherwise the form that opens next: the soonest opening, and between
 *     two that open together the one that closes first.
 *  3. Otherwise the form whose applications closed most recently, whether
 *     its decisions are still awaited or have gone out. A form with no close
 *     written on it says nothing about how recent it is, so it comes last.
 *
 * The id settles whatever is left, so two reads give the same answer
 * whichever order the database returns the forms in.
 *
 * Taking applications, then opening later, then closed is the order
 * `pickLiveRound` gives a course's page, so the homepage and the programme
 * pages change over to the next term at the same moment: when an admin opens
 * its form. A draft for next term changes nothing, because a draft is never
 * in this list.
 */
function byStanding(a: Told, b: Told): number {
  const standing = compare(standingOf(a.stage), standingOf(b.stage));
  if (standing !== 0) return standing;
  const first = a.form.round;
  const second = b.form.round;
  const later = Number.POSITIVE_INFINITY;
  const earlier = Number.NEGATIVE_INFINITY;
  let order: number;
  if (a.stage === "open") {
    order = compare(timeOf(first.closesAt, later), timeOf(second.closesAt, later));
  } else if (a.stage === "before") {
    order =
      compare(timeOf(first.opensAt, later), timeOf(second.opensAt, later)) ||
      compare(timeOf(first.closesAt, later), timeOf(second.closesAt, later));
  } else {
    order = compare(timeOf(second.closesAt, earlier), timeOf(first.closesAt, earlier));
  }
  return order || first.id.localeCompare(second.id);
}

/**
 * The form that opens after this term's, or null. Only a form whose opening
 * is still ahead can be next, and when this term's own opening is ahead too,
 * only one that opens later than it does. `others` is in `byStanding` order,
 * so the first that fits is the soonest.
 */
function nextAfter(chosen: Told, others: readonly Told[]): PublicTermNext | null {
  const after = chosen.stage === "before" ? timeOf(chosen.form.round.opensAt, Number.NEGATIVE_INFINITY) : null;
  for (const other of others) {
    if (other === chosen || other.stage !== "before") continue;
    const opensAt = other.form.round.opensAt;
    if (opensAt === null) continue;
    if (after !== null && opensAt.getTime() <= after) continue;
    return { label: other.form.round.label, opensAt };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

/** A time that has come, or null for one still ahead. */
function passed(at: Date | null, now: Date): Date | null {
  return at !== null && at.getTime() <= now.getTime() ? at : null;
}

/** One programme, field by field. Its lead, reviewers, places and group size stay behind. */
function programmeOf(programme: ProgrammeSettings): PublicTermProgramme {
  return {
    id: programme.id,
    kind: programme.kind,
    name: programme.name,
    shortName: programme.shortName,
    pitch: programme.pitch,
    facts: programme.facts,
    starts: programme.starts,
    courseId: programme.courseId,
    runId: programme.runId,
  };
}

/** The one projection. Everything a visitor's page is handed is named here. */
function termOf(chosen: Told, next: PublicTermNext | null, now: Date): PublicTerm {
  const { form, stage } = chosen;
  const { id, label, decisionsByDate } = form.round;
  const over = stage === "closed" || stage === "running";
  const opensAt = over ? passed(form.round.opensAt, now) : form.round.opensAt;
  const closesAt = over ? passed(form.round.closesAt, now) : form.round.closesAt;
  const programmes = openProgrammes(form).map(programmeOf);
  if (stage === "open") {
    return { stage, label, opensAt, closesAt, decisionsByDate, applyPath: applyPathFor(id), next, programmes };
  }
  return { stage, label, opensAt, closesAt, decisionsByDate, applyPath: null, next, programmes };
}

/**
 * What a visitor may be told about this term at `now`. Always an answer:
 * with no form to tell about, the stage is `none` and every fact is null.
 *
 * The stage is true at `now`. A page that is kept and served again for a
 * while can be that much behind the clock, and the form's own page decides
 * again when somebody arrives.
 */
export async function findPublicTerm(db: Firestore, now: Date = new Date()): Promise<PublicTerm> {
  const told: Told[] = [];
  for (const form of await readForms(db)) {
    const stage = toldStageOf(form, now);
    if (stage !== null) told.push({ form, stage });
  }
  if (told.length === 0) return noPublicTerm();
  told.sort(byStanding);
  const [chosen] = told;
  return termOf(chosen, nextAfter(chosen, told), now);
}
