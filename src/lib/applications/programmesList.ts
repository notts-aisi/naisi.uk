import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { formatRoundDate } from "@/lib/admissions/window";
import { readRunEnd, type RunEnd } from "@/lib/courses/finishing/record";
import { programmeWeekNow } from "@/lib/courses/programmeAttendance";
import { firstNeedsYou } from "@/lib/courses/programmeOverview";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import type { SessionUser } from "@/lib/firebase/session";
import { registerSwitchesIn } from "@/lib/scheduler/registerSwitches";
import { opensProgrammeGroups, roleOnProgramme, type ProgrammeRole } from "./access";
import { isInTerm } from "./decisions";
import { listFormsForStaff, type LoadedForm } from "./editor/load";
import { applicationFormPath } from "./editor/olderRounds";
import { projectFormForStaff } from "./editor/views";
import { placeHoldersOn } from "./handover/holders";
import { RUNS_COLLECTION } from "./handover/run";
import { own } from "./keys";
import { loadTermNumbers, type TermNumbers } from "./lifecycle/loadTermHome";
import type { TermStage } from "./lifecycle/status";
import { lineFor, stageSummaryFor } from "./lifecycle/view";
import type { ApplicationDoc, DecisionDoc, ProgrammeKind, ProgrammeSettings } from "./model";
import type { ApplicationForm } from "./normalise";
import { listDecisions, listSentApplications } from "./staffRepo";

/**
 * THE PROGRAMMES A READER MAY OPEN, term by term: what the Programmes page
 * draws, and what the menu, Home and search will be handed.
 *
 * ## Who is given what
 *
 * Decided here, on the server, before anything leaves: a term's entry holds
 * only the programmes the reader has a role on (`roleOnProgramme`): an admin
 * every programme, a lead the ones they lead, a reviewer the ones they
 * review, and nobody else any. A form the reader has no role on is not read
 * past its listing (`listFormsForStaff` leaves it out). Nothing about an
 * applicant leaves this module but counts, and a card's counts are the ones
 * the screen behind it would show the same reader.
 *
 *  - The run's line ("Week 2 of 6 · 4 groups · 26 holding a place") and the
 *    first thing that needs somebody are for an admin and the programme's
 *    lead alone, the two who open its groups (`opensProgrammeGroups`); a
 *    reviewer is shown the applications line instead.
 *  - "N for you to read" and "Review N" count only on a programme the reader
 *    leads or reviews, as the term's page counts them (`buildTermHome`'s
 *    `isTheirs`): an admin who leads nothing reads "none for you to read" on
 *    somebody else's programme, and is offered no Review there.
 *
 * ## When a term is over
 *
 * A term is over when its form is cancelled or archived, or when decision
 * day has gone out and every programme on it is over. A programme is over
 * when it is closed (it holds nothing open), when the run it names is gone
 * or being destroyed, when that run is marked completed or cancelled, or
 * once the run's last session has ended (`runEndOf`: the latest end of a
 * session any live group holds, a cancelled session and an archived group
 * left out). A programme that names no run, and one whose run has no group
 * with a dated session, is never over, so it keeps its term in the list until
 * an admin marks the run completed or cancelled, or closes the programme.
 * A term that is over is listed under Earlier terms, linking to its page.
 *
 * ## What it reads
 *
 *  - every form, one equality on one field, and the names on each form the
 *    reader may see (`listFormsForStaff`);
 *  - for a term past decision day and not cancelled or archived: every run
 *    its programmes name, in one `getAll`, and the groups of each run not
 *    marked completed or cancelled (one equality each);
 *  - for a term the reader is shown with a programme whose applications they
 *    read the numbers of (taking or deciding applications, or one they
 *    review), or past decision day with one whose groups they open: its sent
 *    applications and its decisions, once each, and the question sets and
 *    reviews for a reviewer (`loadTermNumbers`);
 *  - for a programme whose groups the reader opens, once one of its groups
 *    has met: the run's registers and the reached weeks' documents
 *    (`firstNeedsYou`), and the scheduler's settings once for the page.
 *
 * Every query is one equality on one field, so none needs a declared index.
 * Nothing is written.
 */

/** Where a term is, in the Programmes page's words. */
export type TermStageWords = "Not open yet" | "Taking applications" | "Deciding" | "Starting" | "Running";

/** One programme, as its card draws it. */
export type ProgrammeCard = {
  id: string;
  kind: ProgrammeKind;
  /** "Fellowship" or "Incubator". */
  kindWord: string;
  name: string;
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
  /** What the reader leads or reviews, for the page's lede: an admin is told about every programme. */
  reader: "admin" | "lead" | "reviewer" | "both" | "none";
};

// ---------------------------------------------------------------------------
// The rules, pure
// ---------------------------------------------------------------------------

/** A named run as read: its document, its live groups and its end, or gone (not there, or being destroyed). */
export type RunRead = { run: CourseRunDoc; groups: CourseGroupDoc[]; end: RunEnd | null } | "gone";

/** Is this programme over? See the module's comment. `run` is undefined for a programme that names none. */
export function programmeIsOver(programme: Pick<ProgrammeSettings, "closed" | "runId">, run: RunRead | undefined): boolean {
  if (programme.closed) return true;
  if (!programme.runId || run === undefined) return false;
  if (run === "gone") return true;
  if (run.run.status === "completed" || run.run.status === "cancelled") return true;
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

/** Where the run is: "Week 2 of 6", a break's own name, "Finished · Wed 9 Dec", or null before it begins. */
export function runWeekWords(read: RunRead | undefined, now: Date): string | null {
  if (!read || read === "gone") return null;
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
      // A run marked over by hand is over whatever its groups say: they are not read.
      if (run.status === "completed" || run.status === "cancelled") {
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
 * oversees: `buildTermHome`'s rule, read from the same projection the term's
 * page draws its "(you)" from.
 */
function isTheirs(role: ProgrammeRole, leadIsYou: boolean): boolean {
  return role === "lead" || role === "reviewer" || leadIsYou;
}

function hasBegun(stage: TermStage): boolean {
  return stage === "open" || stage === "deciding" || stage === "decided" || stage === "settled";
}

/**
 * The Programmes page's list for this reader. Each read is in the module's
 * comment; `now` is the instant every "over" and every week is worked out at.
 */
export async function loadProgrammesList(
  db: Firestore,
  user: SessionUser,
  now: Date = new Date(),
): Promise<ProgrammesList> {
  const forms = await listFormsForStaff(db, user, now);
  const staged = forms.map((entry) => ({ entry, stage: stageSummaryFor(entry.form, now).stage }));

  // The runs of every term that could be over or running: past decision day, and not cancelled or archived.
  const runIds = staged
    .filter(({ entry, stage }) => entry.form.decisionsSentAt !== null && stage !== "cancelled" && stage !== "archived")
    .flatMap(({ entry }) =>
      entry.form.programmeIds.map((id) => own(entry.form.programmes, id)?.runId ?? null).filter((id): id is string => !!id),
    );
  const runs = await readRuns(db, runIds, now);

  const current = staged.filter(({ entry, stage }) => !termIsOver(entry.form, stage, runs));
  const earlier = staged
    .filter(({ entry, stage }) => termIsOver(entry.form, stage, runs))
    .map(({ entry }) => ({ id: entry.form.round.id, label: entry.form.round.label, href: applicationFormPath(entry.form.round.id) }));

  // The register's own word for finishing it, read once, and only for a page that will need it.
  let ending: "finished" | "pushed" | null = null;
  const endingWord = async () => {
    if (ending === null) ending = registerSwitchesIn(await readSchedulerConfig(db)).scheduled ? "finished" : "pushed";
    return ending;
  };

  const terms: TermEntry[] = [];
  // The term being run first, then the next: the order the forms were made in.
  for (const { entry, stage } of [...current].reverse()) {
    terms.push(await termEntry(db, user, entry, stage, runs, endingWord, now));
  }

  const roles = staged.flatMap(({ entry }) => visibleOn(user, entry.form).map((each) => each.role));
  const leads = roles.includes("lead");
  const reviews = roles.includes("reviewer");
  const reader =
    user.role === "admin" ? "admin" : leads && reviews ? "both" : leads ? "lead" : reviews ? "reviewer" : "none";
  return { terms: terms.filter((term) => term.programmes.length > 0), earlier, reader };
}

async function termEntry(
  db: Firestore,
  user: SessionUser,
  { form, context }: LoadedForm,
  stage: TermStage,
  runs: ReadonlyMap<string, RunRead>,
  endingWord: () => Promise<"finished" | "pushed">,
  now: Date,
): Promise<TermEntry> {
  const visible = visibleOn(user, form);
  const view = projectFormForStaff(form, context);
  const decided = form.decisionsSentAt !== null;
  const inSession = stage === "open" || stage === "deciding";

  // Whose applications are counted here, and whose places.
  const wantsNumbers = hasBegun(stage) && (inSession ? visible.length > 0 : visible.some((each) => each.role === "reviewer"));
  const wantsHolders = decided && visible.some((each) => opensProgrammeGroups(each.role));
  let read: { applications: ApplicationDoc[]; decisions: Map<string, DecisionDoc> } | null = null;
  if (wantsNumbers || wantsHolders) {
    const [applications, decisions] = await Promise.all([listSentApplications(db, form), listDecisions(db, form.round.id)]);
    read = { applications, decisions };
  }
  const numbers: TermNumbers | null = wantsNumbers && read ? await loadTermNumbers(db, user, form, read) : null;
  const inTerm = read ? read.applications.filter(isInTerm) : [];

  const home = applicationFormPath(form.round.id);
  const anyRunBegun = form.programmeIds.some((id) => {
    const programme = own(form.programmes, id);
    return !!programme?.runId && !programme.closed && runHasBegun(runs.get(programme.runId), now);
  });
  const words = stageWordsFor(stage, anyRunBegun);

  const programmes: ProgrammeCard[] = [];
  for (const each of visible) {
    const { programme, role } = each;
    const base = `${home}/programmes/${programme.id}`;
    const applications = { href: `${base}/applications` };
    const work = numbers ? own(numbers.work, programme.id) : undefined;
    const projected = view.programmes.find((entry) => entry.id === programme.id);
    const waiting = work && isTheirs(role, projected?.lead?.you === true) ? work.waiting : 0;
    const lead = projected?.lead ? (projected.lead.you ? "Lead: you" : `Lead: ${projected.lead.name}`) : "Lead: No lead yet";
    const runRead = programme.runId ? runs.get(programme.runId) : undefined;
    const groupsOpen = opensProgrammeGroups(role);

    let line: string | null = null;
    let needsYou: string | null = null;
    if (programme.closed) {
      line = "Closed";
    } else if (groupsOpen && decided) {
      const parts: string[] = [];
      const week = runWeekWords(runRead, now);
      if (week) parts.push(week);
      if (runRead && runRead !== "gone" && runRead.end) parts.push(plural(runRead.groups.length, "group", "groups"));
      if (read) parts.push(`${placeHoldersOn(form, programme.id, inTerm, read.decisions).length} holding a place`);
      line = parts.length > 0 ? parts.join(" · ") : null;
      if (runRead && runRead !== "gone" && runRead.end && !programmeIsOver(programme, runRead)) {
        needsYou = await firstNeedsYou(db, runRead.run, runRead.groups, await endingWord(), now);
      }
    } else if (work) {
      line = applicationsLine(work.counts.all, waiting);
    }

    const shortName = programme.shortName.trim() || programme.name;
    programmes.push({
      id: programme.id,
      kind: programme.kind,
      kindWord: programme.kind === "incubator" ? "Incubator" : "Fellowship",
      name: programme.name,
      shortName,
      lead,
      line,
      needsYou,
      open: groupsOpen
        ? { label: `Open ${shortName}`, href: `${base}/overview` }
        : { label: waiting > 0 ? `Review ${waiting}` : "See applications", href: applications.href },
      review: groupsOpen && waiting > 0 ? { label: `Review ${waiting}`, href: applications.href } : null,
    });
  }

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
