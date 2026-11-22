import "server-only";
import { fromFirstMark, markedRanges, type MarkedRange, type SessionSlot } from "@/lib/admissions/availability";
import type { SessionUser } from "@/lib/firebase/session";
import { canReadApplication } from "../access";
import { joinedByInvitation } from "../decisions";
import { paintedWeekOf } from "../handover/paintedWeek";
import type { ApplicationDoc } from "../model";
import type { ApplicationForm } from "../normalise";
import { rankedProgrammes } from "../sections";

/**
 * WHEN SOMEBODY IS FREE, FOR ONE STAFF READER: the one gated read of the week
 * a person marked on their application, for a screen that draws it to the
 * programme's team (a person's page under a programme, and the person's
 * panel on People in groups, which asks for everybody on the board at once
 * through `boardWeeksFor` over the applications it has already read).
 *
 * THE GATE IS THE APPLICATION'S. The week lives on the application, so it is
 * shown exactly where the review screens would open that application
 * (`canReadApplication`: an admin, and the lead or a reviewer of a programme
 * the person ranked, or of the one whose invitation they accepted). For
 * anybody else the answer is `may-not` and NOTHING derived from the week: no
 * stretches, no hours, no "can make" marks, no fit with any group. A reader
 * who may not read the application is not told whether there is one either:
 * no application, an application they may not read and one with nothing
 * painted all answer them `may-not`. Nobody is answered about their own
 * week here (`own`), as nobody opens their own application on the staff
 * screens.
 *
 * WHAT A READER WHO MAY IS ANSWERED: the stretches they marked
 * (`markedRanges`), whether the site reads them "from then on" because they
 * marked under four hours in the week (`paintedWeekOf`'s `minimal`), and
 * against each group's weekly session whether they can make all of it (the
 * one reading's `covers`) and how many minutes of it fall in the time the
 * site reads them as free. Never sent to Claude, never put in an email:
 * the callers are pages.
 *
 * Pure: the caller reads the form and the application, and hands them here.
 * The rule is who may read the application, not which screen: the
 * application's own review page draws the week behind the same predicate
 * (`loadReview`), and every other staff screen that draws it asks this.
 * Every file that reads a marked week, with its gate, is listed in
 * `tests/course-hub-times-one-reading.test.mjs`.
 */

/** One of the run's groups that has a weekly session, as the chart draws it. */
export type WeekGroup = { id: string; name: string; session: SessionSlot };

/** A group beside the person's week. */
export type PersonWeekGroup = WeekGroup & {
  /** They can make the whole session, by the site's one reading of their week. */
  fits: boolean;
  /** How many minutes of the session fall in the time the site reads them as free. */
  minutes: number;
  /** The group they are in now. */
  current: boolean;
};

export type PersonWeek =
  /** The reader is the person: nobody is shown their own week on the staff screens. */
  | { kind: "own" }
  /** The reader may not read the application: nothing about the week, or whether there is one. */
  | { kind: "may-not" }
  /** The reader may read it, and there is no sent application to read the week from. */
  | { kind: "not-on-file" }
  /** They sent the form with nothing marked. */
  | { kind: "none-given" }
  | {
      kind: "given";
      /** The hours the form asked about, in minutes past London midnight. */
      grid: { startMinute: number; endMinute: number };
      /** Each stretch they marked, Sunday first. */
      marked: MarkedRange[];
      /** They marked under four hours in the week, so they are read as free from each day's first mark on. */
      fromFirstMark: boolean;
      groups: PersonWeekGroup[];
    };

/** How many minutes of a session fall inside the stretches given. */
function minutesIn(ranges: readonly MarkedRange[], session: SessionSlot): number {
  const [h, m] = session.startTimeLocal.split(":").map(Number);
  const start = (h || 0) * 60 + (m || 0);
  const end = start + session.durationMinutes;
  return ranges
    .filter((range) => range.weekday === session.weekday)
    .reduce((sum, range) => sum + Math.max(0, Math.min(end, range.end) - Math.max(start, range.start)), 0);
}

/**
 * The person's week for this reader. `person.application` is their
 * application on this form as read by the caller, or null with none;
 * `groups` the run's groups that have a weekly session; `inGroupId` the
 * group they are in now, as this reader is shown it, or null.
 */
export function personWeekFor(
  reader: SessionUser,
  form: ApplicationForm,
  person: { uid: string; application: ApplicationDoc | null },
  groups: readonly WeekGroup[],
  inGroupId: string | null,
): PersonWeek {
  if (person.uid === reader.uid) return { kind: "own" };
  const application = person.application && person.application.uid === person.uid ? person.application : null;
  const sent = application?.sent ?? null;
  // The application's own gate, before anything of the week is read.
  const ranked = sent ? rankedProgrammes(form, sent).map((programme) => programme.id) : [];
  const joined = application && sent ? joinedByInvitation(application) : null;
  if (!canReadApplication(reader, form, ranked, joined)) return { kind: "may-not" };
  if (!application || !sent) return { kind: "not-on-file" };

  const grid = form.round.availabilityGrid;
  const week = paintedWeekOf(grid, application);
  if (week.kind === "not-on-file") return { kind: "not-on-file" };
  if (week.kind === "none-given") return { kind: "none-given" };
  const mask = sent.availability;
  const marked = markedRanges(mask, grid);
  const minimal = week.minimal === true;
  // What the site reads them as free for: their marks, or from each day's first mark on when they marked little in all.
  const read = minimal ? markedRanges(fromFirstMark(mask, grid), grid) : marked;
  return {
    kind: "given",
    grid: { startMinute: grid.startMinute, endMinute: grid.endMinute },
    marked,
    fromFirstMark: minimal,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      session: { weekday: group.session.weekday, startTimeLocal: group.session.startTimeLocal, durationMinutes: group.session.durationMinutes },
      fits: week.covers(group.session),
      minutes: minutesIn(read, group.session),
      current: group.id === inGroupId,
    })),
  };
}

/**
 * WHEN EVERYBODY ON A BOARD IS FREE, FOR ONE STAFF READER, in one call: the
 * same gated read as `personWeekFor`, asked once for each person over the
 * applications the caller has already read (the board's loader reads every
 * sent application on the form for its own model, so nothing more is read
 * here). Each person is answered by the application's own gate exactly as a
 * person's page would answer them: `may-not` and nothing derived from the
 * week for anybody the reader may not read, `own` for the reader themselves.
 * The group each person is in is the board's to say, so every group comes
 * back with `current` false. Pure.
 */
export function boardWeeksFor(
  reader: SessionUser,
  form: ApplicationForm,
  uids: readonly string[],
  applications: readonly ApplicationDoc[],
  groups: readonly WeekGroup[],
): Map<string, PersonWeek> {
  const byUid = new Map(applications.map((application) => [application.uid, application] as const));
  const out = new Map<string, PersonWeek>();
  for (const uid of uids) {
    if (out.has(uid)) continue;
    out.set(uid, personWeekFor(reader, form, { uid, application: byUid.get(uid) ?? null }, groups, null));
  }
  return out;
}

/**
 * WHETHER THE PROGRAMME'S LEAD MAY READ THIS PERSON'S WEEK, for the line that
 * tells an ADMIN who else sees it ("Admins and AGI Strategy’s lead see
 * this."). The application's own rule (`canReadApplication`) as it answers a
 * role on this programme: the person ranked it in what they sent, or accepted
 * its invitation (`joinedByInvitation`). Nothing of the week is read. Never a
 * way to show the lead anything: the lead is answered by `personWeekFor`
 * itself. Pure.
 */
export function programmeLeadReadsWeek(form: ApplicationForm, programmeId: string, application: ApplicationDoc | null): boolean {
  if (!application?.sent) return false;
  const ranked = rankedProgrammes(form, application.sent).map((programme) => programme.id);
  return ranked.includes(programmeId) || joinedByInvitation(application) === programmeId;
}
