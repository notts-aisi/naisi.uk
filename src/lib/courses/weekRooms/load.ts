import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { opensProgrammeGroups, programmeRolesFor } from "@/lib/applications/access";
import { RUNS_COLLECTION, readRun } from "@/lib/applications/handover/run";
import { own } from "@/lib/applications/keys";
import { isId } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { requestShownTo } from "@/lib/courses/requests/load";
import type { SessionUser } from "@/lib/firebase/session";
import { inGroupForWeek, type PlaceByWeek } from "@/lib/courses/groupsByWeek";
import { normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeExcusedRequest } from "@/lib/firestore/courseExcusedRequests";
import { COURSE_REQUESTS_COLLECTION, normalizeCourseRequest } from "@/lib/firestore/courseRequests";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import {
  chosenMonday,
  registerIdsForTerm,
  registerIdsForWeek,
  termRoomsView,
  weekRoomsView,
  type ProgrammeRecords,
  type TermSection,
  type WeekRoomsView,
} from "./model";

/**
 * WHAT THE WEEK'S ROOMS AND THE TERM'S ROOMS READ, and who may read it.
 *
 * ── WHO ─────────────────────────────────────────────────────────────────────
 * An admin, every programme on the term's form; a programme's lead, their own
 * programme and nothing else: the same question every Groups view asks
 * (`roleOnProgramme`, then `opensProgrammeGroups`), asked of each programme on
 * the form before anything of a run is read. A reviewer, a track lead, a
 * facilitator and a member lead no programme here, so they are answered as
 * for a form with no programme on it: `none`, the same answer as a form that
 * does not exist and as `?programme=` naming one they may not see. A lead of
 * another programme learns nothing of this one, not even that it exists.
 *
 * ── WHAT IS READ, AND HOW MUCH ──────────────────────────────────────────────
 * The week's rooms, for P programmes the reader may see, S of them shown:
 *
 *  - the form: 1;
 *  - each programme's run: P (one each that names a run);
 *  - each run's groups: one equality on `runId`, G documents in all;
 *  - each shown row's register, by id: R (one a row; a register not written
 *    yet still costs its read);
 *  - each shown run's requests: one equality on `runId`, at most 500 each;
 *  - each shown run's places: one equality on `runId`, E documents in all,
 *    so that away and online count only the people in the group that week.
 *
 * So 1 + P + G + R + Q + E. No account is read. The counts come off the
 * session's own register (who said what for that session) and the requests'
 * own fields, each line counted only for somebody whose group that week is
 * the row's (`inGroupForWeek`): a register keeps a line written before its
 * person moved to another group.
 *
 * The term's rooms: the form, each shown programme's run and groups, and one
 * register a group and taught week with a date, by id: 1 + S + G + G x W.
 * No requests.
 *
 * Both are read by server pages only, for the two who may open them. Nothing
 * here is read by a page a member or a facilitator loads.
 */

/** Most requests read for one run, as the programme head's count reads them. */
const MAX_REQUESTS = 500;

/** Most registers asked for in one `getAll`. */
const REGISTERS_PER_READ = 100;

export type RoomsReader = {
  roundId: string;
  /** The term's name, the form's own label ("Autumn 2026"). */
  termLabel: string;
  viewer: "admin" | "lead";
};

type Visible = { programmeId: string; programmeName: string; runId: string | null };

/** The programmes on the form this reader may see, in the form's order; null for none. */
async function visibleProgrammes(
  db: Firestore,
  user: SessionUser,
  roundId: string,
): Promise<(RoomsReader & { programmes: Visible[] }) | null> {
  if (!isId(roundId)) return null;
  const form = await loadForm(db, roundId);
  if (!form) return null;
  const programmes: Visible[] = [];
  for (const { programmeId, role } of programmeRolesFor(user, form)) {
    if (!opensProgrammeGroups(role)) continue;
    const programme = own(form.programmes, programmeId);
    if (!programme) continue;
    programmes.push({ programmeId, programmeName: programme.shortName.trim() || programme.name, runId: programme.runId });
  }
  if (programmes.length === 0) return null;
  return { roundId: form.round.id, termLabel: form.round.label, viewer: user.role === "admin" ? "admin" : "lead", programmes };
}

/** A run the programme names, while it is on the site. */
async function runOf(db: Firestore, runId: string | null): Promise<CourseRunDoc | null> {
  if (!runId || !isId(runId)) return null;
  const snap = await db.collection(RUNS_COLLECTION).doc(runId).get();
  const read = snap.exists ? readRun(snap.id, snap.data()) : null;
  return read && !read.destroying ? read.run : null;
}

/** The run's groups that still meet, in the order every tab lists them. One equality on `runId`. */
async function liveGroupsOf(db: Firestore, runId: string): Promise<CourseGroupDoc[]> {
  const snap = await db.collection("courseGroups").where("runId", "==", runId).get();
  return snap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => group.runId === runId && !group.archived)
    .sort(compareGroupsByMeeting);
}

/** The run's places by uid, for which group each person was in which week. One equality on `runId`. */
async function placesOf(db: Firestore, runId: string): Promise<Map<string, PlaceByWeek>> {
  const snap = await db.collection("courseEnrolments").where("runId", "==", runId).get();
  const out = new Map<string, PlaceByWeek>();
  for (const doc of snap.docs) {
    const place = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    // A place given up or taken off is nobody in the group any more: their old line is not counted.
    if (place.runId === runId && place.uid && place.status !== "withdrawn" && place.status !== "removed") out.set(place.uid, place);
  }
  return out;
}

/** Registers by id, in batches; a register not written yet is left out. */
async function readRegisters(db: Firestore, ids: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += REGISTERS_PER_READ) {
    const refs = ids.slice(i, i + REGISTERS_PER_READ).map((id) => db.collection("courseAttendance").doc(id));
    if (refs.length === 0) continue;
    for (const snap of await db.getAll(...refs)) if (snap.exists) out.set(snap.id, snap.data() ?? {});
  }
  return out;
}

/**
 * The requests waiting on each session of a run that this reader would see
 * on the Requests page: a correction of a register as `requestShownTo` shows
 * it (every one to an admin; to the lead, none on a group they facilitate),
 * and each week of a request to be excused still waiting, which is an
 * admin's alone to decide and so counted for an admin alone, as the
 * programme head's count is (`requestsWaitingOnRun`).
 */
async function requestsWaiting(
  db: Firestore,
  user: SessionUser,
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const add = (key: string) => out.set(key, (out.get(key) ?? 0) + 1);
  const byId = new Map(groups.map((group) => [group.id, group] as const));
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).where("runId", "==", run.id).limit(MAX_REQUESTS).get();
  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    const correction = normalizeCourseRequest(doc.id, data);
    if (correction) {
      if (correction.status === "waiting" && correction.runId === run.id && requestShownTo(user, byId.get(correction.groupId), run.id, true)) {
        add(`${correction.groupId}__${correction.sessionKey}`);
      }
      continue;
    }
    if (user.role !== "admin") continue;
    const excused = normalizeExcusedRequest(doc.id, data);
    if (!excused || excused.runId !== run.id) continue;
    for (const week of excused.weeks) if (week.status === "waiting") add(`${excused.groupId}__${week.sessionKey}`);
  }
  return out;
}

type Programme = Visible & { run: CourseRunDoc; groups: CourseGroupDoc[] };

/** Each visible programme with a run and its live groups; one with no run on the site is left out. */
async function programmesWithRuns(db: Firestore, visible: readonly Visible[]): Promise<Programme[]> {
  const read = await Promise.all(
    visible.map(async (programme) => {
      const run = await runOf(db, programme.runId);
      if (!run) return null;
      return { ...programme, run, groups: await liveGroupsOf(db, run.id) };
    }),
  );
  return read.filter((each): each is Programme => each !== null);
}

export type WeekRoomsLoad =
  | { status: "none" }
  | { status: "ok"; reader: RoomsReader; only: string | null; view: WeekRoomsView };

/** THE WEEK'S ROOMS for this reader: `asked` is the week asked for (any day of it), `only` one programme. */
export async function loadWeekRooms(
  db: Firestore,
  user: SessionUser,
  input: { roundId: string; week: string | null; only: string | null; now: Date },
): Promise<WeekRoomsLoad> {
  const visible = await visibleProgrammes(db, user, input.roundId);
  if (!visible) return { status: "none" };
  if (input.only !== null && !visible.programmes.some((each) => each.programmeId === input.only)) return { status: "none" };
  const monday = chosenMonday(input.week, input.now);
  const programmes = await programmesWithRuns(db, visible.programmes);
  const shown = input.only ? programmes.filter((each) => each.programmeId === input.only) : programmes;

  const records = await Promise.all(
    programmes.map(async (programme): Promise<ProgrammeRecords> => {
      const isShown = shown.includes(programme);
      const [registers, requests, places] = isShown
        ? await Promise.all([
            readRegisters(db, registerIdsForWeek([programme], monday)),
            requestsWaiting(db, user, programme.run, programme.groups),
            placesOf(db, programme.run.id),
          ])
        : [new Map<string, Record<string, unknown>>(), new Map<string, number>(), new Map<string, PlaceByWeek>()];
      return {
        programmeId: programme.programmeId,
        programmeName: programme.programmeName,
        run: programme.run,
        groups: programme.groups,
        registers,
        requests,
        // Somebody's line on a register counts for the row only when their group that week is the row's.
        inGroup: (uid: string, groupId: string, weekNumber: number) => {
          const place = places.get(uid);
          return place ? inGroupForWeek(place, groupId, weekNumber) : false;
        },
      };
    }),
  );
  return {
    status: "ok",
    reader: { roundId: visible.roundId, termLabel: visible.termLabel, viewer: visible.viewer },
    only: input.only,
    view: weekRoomsView({ programmes: records, monday, only: input.only, now: input.now }),
  };
}

export type TermRoomsLoad =
  | { status: "none" }
  | {
      status: "ok";
      reader: RoomsReader;
      only: string | null;
      /** Every programme the reader may see, for the way between them. */
      programmes: { programmeId: string; programmeName: string }[];
      sections: TermSection[];
    };

/** THE TERM'S ROOMS for this reader, every programme they may see or `only` one. Reads nothing it does not draw. */
export async function loadTermRooms(
  db: Firestore,
  user: SessionUser,
  input: { roundId: string; only: string | null; now: Date },
): Promise<TermRoomsLoad> {
  const visible = await visibleProgrammes(db, user, input.roundId);
  if (!visible) return { status: "none" };
  if (input.only !== null && !visible.programmes.some((each) => each.programmeId === input.only)) return { status: "none" };
  const wanted = input.only ? visible.programmes.filter((each) => each.programmeId === input.only) : visible.programmes;
  const programmes = await programmesWithRuns(db, wanted);
  const registers = await readRegisters(db, registerIdsForTerm(programmes));
  const records: ProgrammeRecords[] = programmes.map((programme) => ({
    programmeId: programme.programmeId,
    programmeName: programme.programmeName,
    run: programme.run,
    groups: programme.groups,
    registers,
    requests: new Map(),
  }));
  return {
    status: "ok",
    reader: { roundId: visible.roundId, termLabel: visible.termLabel, viewer: visible.viewer },
    only: input.only,
    programmes: visible.programmes.map(({ programmeId, programmeName }) => ({ programmeId, programmeName })),
    sections: termRoomsView({ roundId: visible.roundId, programmes: records, now: input.now }),
  };
}
