import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { claudeLinesOf, freeGroupLinesOf, weekChartOf } from "@/lib/courses/personPage/model";
import { whoSeesWeekWords } from "@/lib/courses/personPage/words";
import { wouldFacilitate } from "@/lib/courses/facilitatorAsks/rules";
import type { SessionUser } from "@/lib/firebase/session";
import { notesFor } from "../arrange/notes";
import { own } from "../keys";
import type { QuestionSetDoc } from "../model";
import { readProgrammePeople } from "../people/load";
import { boardWeeksFor, programmeLeadReadsWeek, type PersonWeek, type WeekGroup } from "../people/week";
import { statusWords } from "../people/words";
import { loadQuestionSets } from "../repo";
import type { BoardPanelView, PanelPerson, PanelWeek } from "./boardPanelView";
import { loadProgrammeRun } from "./programmeRun";

/**
 * THE PERSON'S PANEL ON PEOPLE IN GROUPS, READ FOR EVERYBODY ON THE BOARD AT
 * ONCE: when each person is free (the chart, and how much of each group's
 * session falls in their time), the way to their page and their
 * application, whether they offered to facilitate, and for an admin alone
 * Claude's and Pangram's earlier reads.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`, the Groups
 * tab's own gate), decided from the form before the run or anybody is read.
 * A reviewer is answered `not-yours`, and anybody with no role on the
 * programme as for a programme that is not there.
 *
 * WHO IS ANSWERED: every People row for this reader (`readProgrammePeople`,
 * the board's own read, which keeps only people whose application the
 * reader may open) and everybody who facilitates one of the run's groups,
 * whether or not they hold a place.
 *
 * THE WEEK GOES THROUGH THE ONE GATED READ (`boardWeeksFor`, which asks
 * `canReadApplication` for each person before anything of the week is read)
 * over the applications the board's read already holds, so nothing more is
 * read for it. A person the reader may not read is answered `may-not` and
 * nothing else that comes from the application: no chart, no fit, no
 * offer to facilitate. Somebody with no application on the form at all is
 * answered the same `may-not` for a reader who may not read applications
 * they did not rank, so a lead cannot tell who applied; an admin is told
 * nothing about their week (the field is left out). An admin is told, beside
 * each week drawn for them, whether the programme's lead may read it too
 * (`programmeLeadReadsWeek`). Nobody is answered about their own week here.
 *
 * WHAT IS READ: what `readProgrammePeople` reads (the form, every sent
 * application on it and every decision, the run, its groups and its seats);
 * the form's question sets, once, where the form asks about facilitating;
 * and for an admin alone Claude's and Pangram's stored reads, one `getAll`
 * for each hundred people with an application. Never sent to Claude, never
 * put in an email. WHAT IS WRITTEN: nothing.
 */

export type BoardPanelOutcome =
  | { status: "ok"; view: BoardPanelView }
  /** No form here, no such programme on it, or no role on it. */
  | { status: "none" }
  /** A role on the programme that is neither an admin's nor its lead's. Only the form was read. */
  | { status: "not-yours" };

/**
 * The week the one gated read answered, as the panel draws it: a `may-not`
 * answer carries nothing; `undefined` (the field left out) where a reader who
 * may read the application finds none on the form, so nothing is said about
 * a week at all.
 */
function panelWeekOf(
  week: PersonWeek,
  groups: readonly WeekGroup[],
  grid: { startMinute: number; endMinute: number },
): PanelWeek | null | undefined {
  switch (week.kind) {
    case "own":
      return null;
    case "may-not":
      return { kind: "may-not" };
    case "not-on-file":
      return undefined;
    case "none-given":
      return {
        kind: "none-given",
        chart: weekChartOf({ grid, marked: [], fromFirstMark: false, groups: groups.map((group) => ({ ...group, fits: false, current: false })) }),
      };
    case "given":
      return {
        kind: "given",
        chart: weekChartOf({ grid: week.grid, marked: week.marked, fromFirstMark: week.fromFirstMark, groups: week.groups }),
        groups: freeGroupLinesOf(week.groups),
        littleMarked: week.fromFirstMark,
      };
  }
}

export async function loadBoardPanel(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<BoardPanelOutcome> {
  // The Groups tab's own gate, from the form, before anybody is read.
  const gate = await loadProgrammeRun(db, actor, roundId, programmeId);
  if (gate.status !== "ok") return gate;
  const { view, form } = gate;
  const isAdmin = view.viewer === "admin";
  const out: BoardPanelView = { viewer: view.viewer, foot: whoSeesWeekWords(view.programmeName), people: {} };
  const programme = own(form.programmes, view.programmeId);
  if (!view.run || !programme) return { status: "ok", view: out };

  // The board's own read: null until decisions have gone out, when nobody is read.
  const read = await readProgrammePeople(db, actor, form, programme);
  if (!read) return { status: "ok", view: out };
  const { model, applications, groups, facilitatorUids } = read;
  const timed: WeekGroup[] = groups.flatMap((group) => (group.session ? [{ id: group.id, name: group.name, session: group.session }] : []));
  const rows = new Map(model.rows.map((row) => [row.uid, row] as const));
  const uids = [...new Set([...model.rows.map((row) => row.uid), ...facilitatorUids])];
  const weeks = boardWeeksFor(actor, form, uids, applications, timed);
  const applicationOf = new Map(applications.map((application) => [application.uid, application] as const));

  const [sets, notes] = await Promise.all([
    // The form's questions, for whether somebody offered to facilitate: read once, only where the form asks.
    form.asksFacilitating ? loadQuestionSets(db, form.round.id) : Promise.resolve([] as QuestionSetDoc[]),
    // Claude's and Pangram's reads, an ADMIN's alone: never read for anybody else, never about the reader.
    isAdmin ? notesFor(db, view.roundId, view.programmeId, uids.filter((uid) => uid !== actor.uid && applicationOf.has(uid))) : Promise.resolve(null),
  ]);

  const grid = form.round.availabilityGrid;
  for (const uid of uids) {
    const week: PersonWeek = weeks.get(uid) ?? { kind: "may-not" };
    const row = rows.get(uid) ?? null;
    const application = applicationOf.get(uid) ?? null;
    // The application's own gate, as the one read answered it: the reader may read it, and it is not their own.
    const mayRead = week.kind !== "may-not" && week.kind !== "own";
    const drawn = panelWeekOf(week, timed, grid);
    const person: PanelPerson = drawn === undefined ? {} : { week: drawn };
    // For an admin, under a week drawn for them: whether the programme's lead sees it too, by the application's rule.
    if (isAdmin && drawn && drawn.kind !== "may-not") person.leadSees = programmeLeadReadsWeek(form, programme.id, application);
    if (row) {
      person.firstName = row.firstName;
      person.personHref = row.personHref;
      if (row.applicationHref) person.applicationHref = row.applicationHref;
      if (row.status.kind === "gave-back" || row.status.kind === "left") {
        person.gaveBack = {
          line: row.status.on ? `${statusWords(row.status)} on ${row.status.on}` : statusWords(row.status),
          reason: row.status.kind === "gave-back" ? row.status.reason : null,
        };
      }
    }
    if (mayRead && application?.sent && form.asksFacilitating) {
      person.offered = wouldFacilitate(form, sets, application.sent, programme);
    }
    // Claude and Pangram: an admin's alone, never about the admin looking.
    if (notes && uid !== actor.uid && application) person.claude = claudeLinesOf(notes.get(uid) ?? null);
    out.people[uid] = person;
  }
  return { status: "ok", view: out };
}
