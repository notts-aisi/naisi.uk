import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { CheckInSurveyDoc } from "@/lib/firestore/surveys";
import type { NameViewer } from "@/lib/names/staffName";
import { namesOf } from "../names";
import { closedOn, isOpen, sentCountOf } from "../repo";
import { closesWords, dayAndClockWords, namesOffWords, programmeLine } from "../words";
import { CHECK_IN_ADMIN_WORDS, checkInRowWords, checkInsCountWords, joinedLaterWords, openedByWords } from "./words";

/**
 * WHAT THE ADMINS' PAGES SAY OF CHECK-INS, built on the server: plain values,
 * never a stored document. Admins only: the pages that call these sit in the
 * (admin-only) tree. Each check-in has a survey's own pages (its results, who
 * answered, one person's answers with the opening recorded, its questions and
 * the logged download); what differs is said here: the list shows them one
 * line a programme, and in place of a Send tab each says how it was opened.
 */

/** One check-in on the list. */
export type CheckInListRow = {
  id: string;
  /** "Week 3 · Group C · Wed 18 Nov". */
  label: string;
  open: boolean;
  /** "Closes Wed 18 Nov", "Closed Wed 18 Nov". */
  closes: string;
  /** How many it reached, by its own record of each press: "6 people". */
  reached: number;
};

/** One programme's check-ins on the list, newest first. */
export type CheckInListGroup = {
  /** For a React key: the form and the programme. */
  key: string;
  /** "Fellowship: AGI Strategy". */
  programme: string;
  /** "12 check-ins, 1 open now". */
  line: string;
  rows: CheckInListRow[];
};

/**
 * THE LIST'S CHECK-INS: one line a programme, its check-ins under it, newest
 * first, each with when it closes and how many it reached (its own record of
 * each press, so no row of anybody's is read). Reading the whole lot is one
 * equality on `kind`.
 */
export function checkInListView(checkIns: readonly CheckInSurveyDoc[], now: Date): CheckInListGroup[] {
  const groups = new Map<string, CheckInListGroup & { opens: number; latest: number }>();
  for (const survey of checkIns) {
    const key = `${survey.audience.roundId}:${survey.audience.programmeId}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, programme: programmeLine(survey.programmeKind, survey.programmeName), line: "", rows: [], opens: 0, latest: 0 };
      groups.set(key, group);
    }
    const open = isOpen(survey, now);
    const ends = closedOn(survey);
    if (open) group.opens += 1;
    group.latest = Math.max(group.latest, survey.checkIn.startsAt?.getTime() ?? 0);
    group.rows.push({
      id: survey.id,
      label: checkInRowWords(survey.audience.weekNumber, survey.checkIn.groupName, survey.checkIn.startsAt),
      open,
      closes: ends ? closesWords(ends, !open) : "",
      reached: sentCountOf(survey),
    });
  }
  return [...groups.values()]
    .sort((a, b) => b.latest - a.latest || a.programme.localeCompare(b.programme, "en"))
    .map(({ key, programme, rows, opens }) => ({
      key,
      programme,
      line: checkInsCountWords(rows.length, opens),
      rows,
    }));
}

/** A check-in's Opening tab, in place of a survey's Send tab: how it was opened, and when it closes. */
export type OpeningView = {
  open: boolean;
  /** "Opened by Rahul on Wed 18 Nov, 4:52pm, for the 6 marked here." */
  opened: string;
  /** "2 more marked here after it opened, with no email.", once for each such mark. */
  joined: string[];
  /** "Closes", "Wed 18 Nov, 23:00", or once closed "Closed" and when. */
  closes: { label: string; value: string } | null;
  /** "Sat 9 Dec 2028". */
  namesOff: string;
  /** "Fellowship: AGI Strategy". */
  programme: string;
};

/** The Opening tab, for an admin (`viewer`), who is shown the opener by the names rule. */
export async function openingView(db: Firestore, survey: CheckInSurveyDoc, now: Date, viewer: NameViewer): Promise<OpeningView> {
  const first = survey.presses.find((press) => press.kind === "first") ?? null;
  const names = await namesOf(db, first?.byUid ? [first.byUid] : [], viewer);
  const open = isOpen(survey, now);
  const ends = closedOn(survey);
  return {
    open,
    opened: openedByWords((first?.byUid ? names.get(first.byUid) : "") ?? "", first?.at ?? survey.firstSentAt, first?.count ?? sentCountOf(survey)),
    joined: survey.presses.filter((press) => press.kind === "joined").map((press) => joinedLaterWords(press.count)),
    closes: ends ? { label: open ? CHECK_IN_ADMIN_WORDS.closes : CHECK_IN_ADMIN_WORDS.closed, value: dayAndClockWords(ends) } : null,
    namesOff: survey.namesOffOn ? namesOffWords(survey.namesOffOn) : "",
    programme: programmeLine(survey.programmeKind, survey.programmeName),
  };
}
