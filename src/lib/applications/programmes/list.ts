import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { formatRoundDate } from "@/lib/admissions/window";
import { readRunEnd, type RunEnd } from "@/lib/courses/finishing/record";
import { programmeWeekNow, registerEnding } from "@/lib/courses/programmeAttendance";
import { firstNeedsYou } from "@/lib/courses/programmeOverview";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import { holdsStanding, isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { registerSwitchesIn } from "@/lib/scheduler/registerSwitches";
import { opensProgrammeGroups, roleOnProgramme, type ProgrammeRole } from "../access";
import { listVisibleForms, withNames } from "../editor/load";
import { applicationFormPath } from "../editor/olderRounds";
import { projectFormForStaff } from "../editor/views";
import { RUNS_COLLECTION } from "../handover/run";
import { own } from "../keys";
import { loadTermNumbers, type TermNumbers } from "../lifecycle/loadTermHome";
import type { TermStage } from "../lifecycle/status";
import { lineFor, stageSummaryFor } from "../lifecycle/view";
import type { ProgrammeKind, ProgrammeSettings } from "../model";
import type { ApplicationForm } from "../normalise";
import { menuHeadingFor, type MenuTerm } from "./menu";

/**
 * THE PROGRAMMES A READER MAY OPEN, term by term: what the Programmes page
 * draws, made once on the server so that anything else that lists
 * programmes asks the same question. Home's Programmes card is made from
 * this list (`./home.ts`), and the menu from a cut of it that reads none of
 * the cards' figures (`loadProgrammesMenu`, at the foot).
 *
 * ## Who is given what
 *
 * Decided here, on the server, before anything leaves: a term's entry holds
 * only the programmes the reader has a role on (`roleOnProgramme`): an admin
 * every programme, a lead the ones they lead, a reviewer the ones they
 * review, and nobody else any. A form the reader has no role on is not read
 * past its listing (`listVisibleForms` leaves it out). Nothing about an
 * applicant leaves this module but counts, and a card's counts are the ones
 * the screen behind it would show the same reader.
 *
 *  - The run's line ("Week 2 of 6 · 4 groups · 26 holding a place") and the
 *    first thing that needs somebody are for an admin and the programme's
 *    lead alone, the two who open its groups (`opensProgrammeGroups`).
 *  - "N for you to read" and "Review N" are worked out only while a term
 *    takes or decides applications, and count only on a programme the reader
 *    leads or reviews, as the term's page counts them (`buildTermHome`'s
 *    `isTheirs`): an admin who leads nothing reads "none for you to read" on
 *    somebody else's programme, and is offered no Review there.
 *  - "Holding a place" is the run's own count of the people on it: its
 *    learners' seats that are active or completed, by an aggregate count.
 *    The hand-over writes one seat for each person who holds a place on the
 *    programme, and giving the place back takes the seat off in the same
 *    transaction, so once the people are handed over this is the term page's
 *    "places accepted". Before the hand-over there are no seats, and the
 *    card says nothing about places.
 *
 * ## When a term is over
 *
 * A term is over when its form is cancelled or archived, or when decision
 * day has gone out and every programme on it is over. A programme is over
 * when it is closed (it holds nothing open), when the run it names is gone,
 * being destroyed or archived, when that run is marked completed or
 * cancelled, or once the run's last session has ended (`runEndOf`: the
 * latest end of a session any live group holds, a cancelled session and an
 * archived group left out). A programme that names no run, and one whose run
 * has no group with a dated session, is never over, so it keeps its term in
 * the list until an admin marks the run completed or cancelled, or closes
 * the programme. A term that is over is listed under Earlier terms, by name.
 *
 * ## What it reads, and in what order
 *
 *  1. Every form, one equality on one field (`listVisibleForms`).
 *  2. For every term past decision day and not cancelled or archived, every
 *     run its programmes name, in one `getAll`.
 *  3. In parallel, the groups of each run that is not marked completed or
 *     cancelled, not archived and not being destroyed (one equality each). A
 *     past term whose runs are marked over costs step 2 and nothing more.
 *  4. For each term that is not over, all at once: the names on its form;
 *     while it takes or decides applications and the reader leads or reviews
 *     a programme on it, its sent applications and decisions (and for a
 *     reviewer its question sets and reviews: `loadTermNumbers`, the term
 *     page's own numbers, the reader's own application left out); and for
 *     each programme whose groups the reader opens, past decision day, two
 *     aggregate counts of the run's seats and its first needs-you line
 *     (`firstNeedsYou`: the weeks groups have reached in one batch, and only
 *     when none is unready, the run's registers and the scheduler's
 *     settings, once for the page).
 *
 * Every query is one equality on one field, or equalities only, so none
 * needs a declared index. Nothing is written.
 */

/** Where a term is, in the Programmes page's words. */
export type TermStageWords = "Not open yet" | "Taking applications" | "Deciding" | "Starting" | "Running";

/** One programme, as its card draws it. */
export type ProgrammeCard = {
  id: string;
  kind: ProgrammeKind;
  /** "Fellowship" or "Incubator". */
  kindWord: string;
  /** What the card and its button call it: the programme's short name ("AGI Strategy"), its kind on a line of its own. */
  shortName: string;
  /** "Lead: Maya Rao", "Lead: you", "Lead: No lead yet". */
  lead: string;
  /** "Week 2 of 6 · 4 groups · 26 holding a place", "14 applications · 3 for you to read", or null. */
  line: string | null;
  /** The first thing that needs the lead, in the Overview's words, or null. */
  needsYou: string | null;
  /** The card's first button. */
  open: { label: string; href: string };
  /** "Review 3" beside it, for a programme the reader leads with applications waiting for them. */
  review: { label: string; href: string } | null;
  /** Whether the reader opens its groups (an admin or its lead): the Overview is theirs, and Home lists it. */
  opensGroups: boolean;
  /** How many applications wait for this reader's reading on it: the N of "Review N", 0 with none. */
  waiting: number;
  /** Where its run is ("Week 2 of 6"), for the reader who opens its groups, or null. */
  week: string | null;
  /** Whether nobody leads it yet. */
  noLead: boolean;
};

/** One term that is not over. */
export type TermEntry = {
  id: string;
  /** The form's own name: "Autumn 2026". */
  label: string;
  stage: TermStageWords;
  /** Where the term is, in a sentence. */
  line: string;
  /** The term's page. */
  href: string;
  /** "Autumn 2026’s term page". */
  pageLabel: string;
  programmes: ProgrammeCard[];
};

export type EarlierTerm = { id: string; label: string; href: string };

export type ProgrammesList = {
  terms: TermEntry[];
  earlier: EarlierTerm[];
  /**
   * What the reader leads or reviews on the terms that are not over, for the
   * page's lede: an admin is told about every programme, and a reader with no
   * term that is not over is given none.
   */
  reader: "admin" | "lead" | "reviewer" | "both" | "none";
  /** Whether the reader may see any form at all, over or not: the area's empty state is for none. */
  anyForm: boolean;
};

// ---------------------------------------------------------------------------
// The rules, pure
// ---------------------------------------------------------------------------

/**
 * A named run as read: its document, its live groups and its end (null for a
 * run marked over, whose groups are not read), or gone (not there, or being
 * destroyed).
 */
export type RunRead = { run: CourseRunDoc; groups: CourseGroupDoc[]; end: RunEnd | null } | "gone";

/** A run whose own record says it is over: marked completed or cancelled, or archived. Its groups are not read. */
function markedOver(run: Pick<CourseRunDoc, "status" | "archived">): boolean {
  return run.status === "completed" || run.status === "cancelled" || run.archived;
}

/** Is this programme over? See the module's comment. `run` is undefined for a programme that names none. */
export function programmeIsOver(programme: Pick<ProgrammeSettings, "closed" | "runId">, run: RunRead | undefined): boolean {
  if (programme.closed) return true;
  if (!programme.runId || run === undefined) return false;
  if (run === "gone") return true;
  if (markedOver(run.run)) return true;
  return run.end?.over === true;
}

/** Is this term over? `runs` holds what was read of the runs its programmes name. */
export function termIsOver(
  form: ApplicationForm,
  stage: TermStage,
  runs: ReadonlyMap<string, RunRead>,
): boolean {
  if (stage === "cancelled" || stage === "archived") return true;
  if (form.decisionsSentAt === null) return false;
  return form.programmeIds.every((id) => {
    const programme = own(form.programmes, id);
    if (!programme) return true;
    return programmeIsOver(programme, programme.runId ? runs.get(programme.runId) : undefined);
  });
}

/** Has this run's own calendar begun? */
function runHasBegun(read: RunRead | undefined, now: Date): boolean {
  if (!read || read === "gone" || read.run.status === "cancelled") return false;
  const current = programmeWeekNow(read.run, now);
  return current !== null && current.phase !== "before";
}

/** The term's words: from its form until decision day, and from its runs after. */
export function stageWordsFor(stage: TermStage, anyRunBegun: boolean): TermStageWords {
  switch (stage) {
    case "draft":
    case "opens-later":
      return "Not open yet";
    case "open":
      return "Taking applications";
    case "deciding":
      return "Deciding";
    default:
      return anyRunBegun ? "Running" : "Starting";
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "14 applications · 3 for you to read", "9 applications · none for you to read". */
export function applicationsLine(all: number, forYou: number): string {
  return `${plural(all, "application", "applications")} · ${forYou === 0 ? "none" : forYou} for you to read`;
}

/**
 * Where the run is: "Week 2 of 6", a break's own name, "Finished · Wed 9
 * Dec", "Finished" for a run marked completed, or null before it begins and
 * for a run cancelled or archived.
 */
export function runWeekWords(read: RunRead | undefined, now: Date): string | null {
  if (!read || read === "gone") return null;
  if (read.run.status === "completed") return "Finished";
  if (markedOver(read.run)) return null;
  if (read.end?.over && read.end.lastDay) return `Finished · ${read.end.lastDay}`;
  const total = read.run.weekPlan.filter((entry) => entry.kind === "week").length;
  const current = total > 0 ? programmeWeekNow(read.run, now) : null;
  if (!current || current.phase === "before") return null;
  if (current.phase === "after") return "Finished";
  return current.weekNumber !== null ? `Week ${current.weekNumber} of ${total}` : current.breakLabel?.trim() || "A week off";
}

/**
 * "The fellowships end on Wed 9 Dec.", for a running term whose every
 * fellowship the reader sees, when they all end on one day still to come.
 * Null otherwise.
 */
export function fellowshipsEndLine(
  form: ApplicationForm,
  runs: ReadonlyMap<string, RunRead>,
  seesEvery: boolean,
): string | null {
  if (!seesEvery) return null;
  const fellowships = form.programmeIds
    .map((id) => own(form.programmes, id))
    .filter((programme): programme is ProgrammeSettings => !!programme && !programme.closed && programme.kind === "fellowship");
  if (fellowships.length === 0) return null;
  const days = new Set<string>();
  for (const programme of fellowships) {
    const read = programme.runId ? runs.get(programme.runId) : undefined;
    if (!read || read === "gone" || !read.end?.lastDay || read.end.over) return null;
    days.add(read.end.lastDay);
  }
  if (days.size !== 1) return null;
  const [day] = days;
  return fellowships.length === 1 ? `The fellowship ends on ${day}.` : `The fellowships end on ${day}.`;
}

// ---------------------------------------------------------------------------
// The reads
// ---------------------------------------------------------------------------

/** Every run the forms' programmes name, in one `getAll`, with the groups of each still to be asked. */
async function readRuns(db: Firestore, runIds: readonly string[], now: Date): Promise<Map<string, RunRead>> {
  const out = new Map<string, RunRead>();
  const ids = [...new Set(runIds)].filter((id) => id !== "" && !id.includes("/"));
  if (ids.length === 0) return out;
  const snaps = await db.getAll(...ids.map((id) => db.collection(RUNS_COLLECTION).doc(id)));
  await Promise.all(
    snaps.map(async (snap) => {
      if (!snap.exists || snap.data()?.destroying === true) {
        out.set(snap.id, "gone");
        return;
      }
      const run = normalizeCourseRun(snap.id, snap.data() ?? {});
      // A run its own record says is over is over whatever its groups say: they are not read.
      if (markedOver(run)) {
        out.set(snap.id, { run, groups: [], end: null });
        return;
      }
      const { groups, end } = await readRunEnd(db, run, now);
      out.set(snap.id, { run, groups, end });
    }),
  );
  return out;
}

type Visible = { programme: ProgrammeSettings; role: ProgrammeRole };

type Staged = { form: ApplicationForm; stage: TermStage };

/**
 * These terms split into the ones that are not over and the ones that are,
 * with the runs read to tell: every run named by a term past decision day
 * that is not cancelled or archived, in one `getAll`, and the groups of each
 * run not marked over (see `readRuns`). Both orders are the forms' own.
 */
async function splitByOver<T extends Staged>(
  db: Firestore,
  staged: readonly T[],
  now: Date,
): Promise<{ runs: Map<string, RunRead>; current: T[]; over: T[] }> {
  const runIds = staged
    .filter(({ form, stage }) => form.decisionsSentAt !== null && stage !== "cancelled" && stage !== "archived")
    .flatMap(({ form }) =>
      form.programmeIds.map((id) => own(form.programmes, id)?.runId ?? null).filter((id): id is string => !!id),
    );
  const runs = await readRuns(db, runIds, now);
  const current: T[] = [];
  const over: T[] = [];
  for (const each of staged) (termIsOver(each.form, each.stage, runs) ? over : current).push(each);
  return { runs, current, over };
}

/** The programmes on a form this reader may open, in the form's order. */
function visibleOn(user: SessionUser, form: ApplicationForm): Visible[] {
  const out: Visible[] = [];
  for (const id of form.programmeIds) {
    const programme = own(form.programmes, id);
    const role = programme ? roleOnProgramme(user, form, id) : null;
    if (programme && role) out.push({ programme, role });
  }
  return out;
}

/**
 * A programme the reader leads or reviews, as against one an admin merely
 * oversees: `buildTermHome`'s rule. An admin who is also the programme's lead
 * is asked as a lead is, through the live bar (`isNamedWithStanding`).
 */
function isTheirs(user: SessionUser, { programme, role }: Visible): boolean {
  return (
    role === "lead" ||
    role === "reviewer" ||
    isNamedWithStanding(user, "admissionRounds.leadUid", programme.leadUid)
  );
}

/**
 * How many people the run holds: its seats that are a learner's and active
 * or completed, as two aggregate counts (every such seat, less a
 * facilitator's), each one equality and one `in`. A seat stored before roles
 * were written reads as a learner's, which the subtraction keeps.
 */
async function countHolding(db: Firestore, runId: string): Promise<number> {
  const seats = db.collection("courseEnrolments").where("runId", "==", runId).where("status", "in", ["active", "completed"]);
  const [all, facilitators] = await Promise.all([
    seats.count().get(),
    seats.where("role", "==", "facilitator").count().get(),
  ]);
  return Math.max(0, all.data().count - facilitators.data().count);
}

/** One programme's first needs-you line, or none when it cannot be read: one card never takes the page down. */
async function needsYouOf(
  db: Firestore,
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
  ending: () => Promise<"finished" | "pushed">,
  now: Date,
): Promise<string | null> {
  try {
    return await firstNeedsYou(db, run, groups, ending, now);
  } catch {
    return null;
  }
}

/** How much of the list a caller wants. */
export type ListOptions = {
  /**
   * Only the programmes whose groups the reader opens (an admin every one, a
   * lead the ones they lead): Home's Programmes card, which has no row for a
   * programme the reader only reviews. A form holding none of them is left
   * out before anything past the forms is read, so a reviewer who leads
   * nothing costs the one query of the forms.
   */
  groupsOnly?: boolean;
};

/**
 * The Programmes page's list for this reader. Each read is in the module's
 * comment; `now` is the instant every "over" and every week is worked out at.
 */
export async function loadProgrammesList(
  db: Firestore,
  user: SessionUser,
  now: Date = new Date(),
  options: ListOptions = {},
): Promise<ProgrammesList> {
  const groupsOnly = options.groupsOnly === true;
  const forms = await listVisibleForms(db, user);
  const staged = forms
    .filter((form) => !groupsOnly || visibleOn(user, form).some(({ role }) => opensProgrammeGroups(role)))
    .map((form) => ({ form, stage: stageSummaryFor(form, now).stage }));
  const { runs, current, over } = await splitByOver(db, staged, now);
  const earlier = over.map(({ form }) => ({ id: form.round.id, label: form.round.label, href: applicationFormPath(form.round.id) }));

  // The register's own word for finishing it, read once, and only if a card needs it.
  let ending: Promise<"finished" | "pushed"> | null = null;
  const endingWord = () => (ending ??= readSchedulerConfig(db).then((config) => registerEnding(registerSwitchesIn(config))));

  // The term being run first, then the next: the order the forms were made in. Every term at once.
  const terms = await Promise.all(
    [...current].reverse().map(({ form, stage }) => termEntry(db, user, form, stage, runs, endingWord, now, groupsOnly)),
  );

  const roles = current.flatMap(({ form }) => visibleOn(user, form).map((each) => each.role));
  const leads = roles.includes("lead");
  const reviews = roles.includes("reviewer");
  const reader =
    current.length === 0
      ? "none"
      : user.role === "admin"
        ? "admin"
        : leads && reviews
          ? "both"
          : leads
            ? "lead"
            : reviews
              ? "reviewer"
              : "none";
  return { terms: terms.filter((term) => term.programmes.length > 0), earlier, reader, anyForm: forms.length > 0 };
}

async function termEntry(
  db: Firestore,
  user: SessionUser,
  form: ApplicationForm,
  stage: TermStage,
  runs: ReadonlyMap<string, RunRead>,
  endingWord: () => Promise<"finished" | "pushed">,
  now: Date,
  groupsOnly: boolean,
): Promise<TermEntry> {
  const visible = visibleOn(user, form).filter(({ role }) => !groupsOnly || opensProgrammeGroups(role));
  const decided = form.decisionsSentAt !== null;
  const inSession = stage === "open" || stage === "deciding";
  const home = applicationFormPath(form.round.id);

  // The applications' numbers, as the term's page counts them for this reader
  // (their own application left out), only while the term takes or decides
  // them, and only for a reader who leads or reviews a programme on it.
  const wantsNumbers = inSession && visible.some((each) => isTheirs(user, each));

  // Each card whose run the reader opens, past decision day: its seats and its first needs-you line.
  const runCards = new Map<string, Promise<{ holding: number | null; needsYou: string | null }>>();
  for (const { programme, role } of visible) {
    const read = programme.runId ? runs.get(programme.runId) : undefined;
    if (programme.closed || !decided || !opensProgrammeGroups(role) || !read || read === "gone") continue;
    const live = read.end !== null && !programmeIsOver(programme, read);
    runCards.set(
      programme.id,
      Promise.all([
        countHolding(db, read.run.id).catch(() => null),
        live ? needsYouOf(db, read.run, read.groups, endingWord, now) : null,
      ]).then(([holding, needsYou]) => ({ holding, needsYou })),
    );
  }

  const [context, numbers, cards] = await Promise.all([
    withNames(db, user, form, now).then((loaded) => loaded.context),
    wantsNumbers ? loadTermNumbers(db, user, form) : Promise.resolve<TermNumbers | null>(null),
    Promise.all([...runCards].map(async ([id, card]) => [id, await card] as const)).then((pairs) => new Map(pairs)),
  ]);
  const view = projectFormForStaff(form, context);

  const anyRunBegun = form.programmeIds.some((id) => {
    const programme = own(form.programmes, id);
    return !!programme?.runId && !programme.closed && runHasBegun(runs.get(programme.runId), now);
  });
  const words = stageWordsFor(stage, anyRunBegun);

  const programmes = visible.map(({ programme, role }): ProgrammeCard => {
    const base = `${home}/programmes/${programme.id}`;
    const applications = `${base}/applications`;
    const work = numbers ? own(numbers.work, programme.id) : undefined;
    const projected = view.programmes.find((entry) => entry.id === programme.id);
    const waiting = work && isTheirs(user, { programme, role }) ? work.waiting : 0;
    const lead = projected?.lead ? (projected.lead.you ? "Lead: you" : `Lead: ${projected.lead.name}`) : "Lead: No lead yet";
    const read = programme.runId ? runs.get(programme.runId) : undefined;
    const groupsOpen = opensProgrammeGroups(role);
    const card = cards.get(programme.id);

    const week = !programme.closed && groupsOpen && decided ? runWeekWords(read, now) : null;
    let line: string | null = null;
    if (programme.closed) {
      line = "Closed";
    } else if (work) {
      line = applicationsLine(work.counts.all, waiting);
    } else if (groupsOpen && decided) {
      const parts: string[] = [];
      if (week) parts.push(week);
      if (read && read !== "gone" && read.end) parts.push(plural(read.groups.length, "group", "groups"));
      if (card?.holding) parts.push(`${card.holding} holding a place`);
      line = parts.length > 0 ? parts.join(" · ") : null;
    }

    const shortName = programme.shortName.trim() || programme.name;
    return {
      id: programme.id,
      kind: programme.kind,
      kindWord: programme.kind === "incubator" ? "Incubator" : "Fellowship",
      shortName,
      lead,
      line,
      needsYou: card?.needsYou ?? null,
      open: groupsOpen
        ? { label: `Open ${shortName}`, href: `${base}/overview` }
        : { label: waiting > 0 ? `Review ${waiting}` : "See applications", href: applications },
      review: groupsOpen && waiting > 0 ? { label: `Review ${waiting}`, href: applications } : null,
      opensGroups: groupsOpen,
      waiting,
      week,
      noLead: !projected?.lead,
    };
  });

  const seesEvery = visible.length === form.programmeIds.length;
  const sentence =
    stage === "open" && form.round.closesAt
      ? `Applications close on ${formatRoundDate(form.round.closesAt)}.`
      : lineFor(stage, form, false, view.sent, now);
  const ends = words === "Running" ? fellowshipsEndLine(form, runs, seesEvery) : null;
  return {
    id: form.round.id,
    label: form.round.label,
    stage: words,
    line: ends ? `${sentence} ${ends}` : sentence,
    href: home,
    pageLabel: `${form.round.label}’s term page`,
    programmes,
  };
}

// ---------------------------------------------------------------------------
// The menu's part: the same programmes, cut down to what the menu draws
// ---------------------------------------------------------------------------

/**
 * The programmes the menu lists under Programmes for this reader: those of
 * each term that is not over whose groups the reader opens (an admin every
 * one, a lead the ones they lead; a reviewer, a run's track lead and a
 * facilitator none), each by its short name, opening its Overview, with the
 * N of "Review N" where applications wait for this reader's reading as the
 * list counts them. Terms in the list's order, the term being run first.
 *
 * It decides "over" as the list does and reads nothing the menu does not
 * draw: no names on the form, no seats, no needs-you line.
 *
 *  1. Every form, one equality on one field. A reader who opens no
 *     programme's groups on any of them is answered here, with nothing.
 *  2. For the forms that hold one of the reader's programmes and are past
 *     decision day, every run they name, in one `getAll`, and in parallel
 *     the groups of each run not marked over.
 *  3. Only while a term takes or decides applications and the reader leads
 *     one of its programmes: its sent applications and decisions
 *     (`loadTermNumbers`). A failed read of them leaves that term's Review
 *     counts at nothing.
 */
export async function loadProgrammesMenu(db: Firestore, user: SessionUser, now: Date = new Date()): Promise<MenuTerm[]> {
  const forms = await listVisibleForms(db, user);
  const staged = forms
    .map((form) => ({
      form,
      stage: stageSummaryFor(form, now).stage,
      entries: visibleOn(user, form).filter(({ role }) => opensProgrammeGroups(role)),
    }))
    .filter(({ entries }) => entries.length > 0);
  if (staged.length === 0) return [];
  const { current } = await splitByOver(db, staged, now);
  const terms = await Promise.all(
    [...current].reverse().map(async ({ form, stage, entries }): Promise<MenuTerm> => {
      const inSession = stage === "open" || stage === "deciding";
      const numbers =
        inSession && entries.some((each) => isTheirs(user, each))
          ? await loadTermNumbers(db, user, form).catch(() => null)
          : null;
      const home = applicationFormPath(form.round.id);
      return {
        heading: menuHeadingFor(form.round.label, stage),
        programmes: entries.map((each) => {
          const work = numbers ? own(numbers.work, each.programme.id) : undefined;
          return {
            name: each.programme.shortName.trim() || each.programme.name,
            href: `${home}/programmes/${each.programme.id}/overview`,
            review: work && isTheirs(user, each) ? work.waiting : 0,
          };
        }),
      };
    }),
  );
  return terms;
}

/**
 * Whether the menu's route answers this reader, and Home reads the list for
 * them: an admin, or an account named on a form as a lead or a reviewer that
 * still stands (the flag the admissions tree's gate reads). Anybody else has
 * no programme to be shown and is not asked about.
 */
export function readsProgrammesFor(user: SessionUser): boolean {
  return user.role === "admin" || (user.admissionsReviewer === true && holdsStanding(user, "admissionRounds.reviewerUids"));
}
