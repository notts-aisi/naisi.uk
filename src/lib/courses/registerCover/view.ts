import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { standingUserOf } from "@/lib/courses/programmeLead";
import { holdsStanding, isNamedWithStanding } from "@/lib/firebase/eligibility";
import type {
  CourseAttendanceDoc,
  FacilitatorPresenceState,
  LineSetterHow,
} from "@/lib/firestore/courseAttendance";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { coverIsLive } from "./model";
import { runsThingsOn } from "./runsThings";

/**
 * WHAT THE REGISTER'S READ ADDS ABOUT WHO TOOK IT: for each session on the
 * page, who set each line and when, who took it and when, who gave it and
 * until when, and (for admins and the programme's lead only) in whose place
 * and whether each of the group's facilitators was there; a facilitator is
 * told when it was their own place. Who gave a session goes to every reader
 * because the register's foot names that person to every reader as the one
 * reminded about it (`chasedUids`). Every person by name, by the names rule
 * for whoever reads it (`nameForViewer`), never an address.
 *
 * A register written before these fields existed has none of them, and reads
 * as nobody having set anything, nobody covering, and no record.
 */

/**
 * One line's stamp, as the register's page shows it: "Zach, 4:14pm", "Set by
 * you, 4:14pm" for the reader's own (`yours`), or "Set before the session"
 * for `self`.
 */
export type LineSetterView = { name: string; at: string; how: LineSetterHow; yours: boolean };

/** A person by uid and name. */
export type NamedPerson = { uid: string; name: string };

/** A facilitator whose place a cover took, by uid and name, and whether it is the reader. */
export type CoveredPerson = NamedPerson & { you: boolean };

/** Who took a session's register in whose place. */
export type CoverView = {
  kind: "self" | "given";
  /** Who took it, or was given it. */
  by: NamedPerson;
  /** When it was taken, or given. */
  at: string;
  /**
   * The facilitators whose place was taken; empty for a group with none.
   * `you` marks the reader. Every one to admins and the programme's lead;
   * to anybody else only the reader, when it was their place.
   */
  covering: CoveredPerson[];
  /**
   * For a session given to somebody: who gave it, to every reader of the
   * register, the same person its foot says is reminded about it. Null for a
   * register somebody took themselves.
   */
  givenBy: NamedPerson | null;
  /** For a session given to somebody: when it stops being theirs, to every reader of the register. Null for a register somebody took themselves. */
  until: string | null;
  /** Whether it still holds: a session given to somebody stops at `until`. */
  live: boolean;
  /** True when the reader is the person who took it. */
  yours: boolean;
  /**
   * Whether the cover stands: false for a session given to somebody who runs
   * nothing on the programme (`runsThingsOn`, the give's own bar), true for
   * every other cover. Sent to admins and the programme's lead
   * (`readsFacilitatorRecord`), who can give it again, and to the person who
   * holds it, about their own; absent for anybody else, a run's track lead
   * included, who reads the usual line.
   */
  stands?: boolean;
  /** The one-line reason, for admins and the people leading the programme only; absent for anybody else. */
  reason?: string | null;
};

/** One facilitator's entry, for admins and the people leading the programme only. */
export type FacilitatorEntryView = {
  uid: string;
  name: string;
  state: FacilitatorPresenceState;
  arrivedAt: string | null;
  /** Who recorded it, and when. */
  byName: string;
  at: string;
  how: "cover" | "arrived" | "finish" | "changed";
};

/** The group's facilitators who still stand behind the role, by name: for the ticks at Finish and "covering for". */
export async function standingFacilitators(
  db: Firestore,
  group: Pick<CourseGroupDoc, "facilitatorUids">,
  viewer: { isAdmin: boolean; role?: string | null },
): Promise<NamedPerson[]> {
  const uids = [...new Set(group.facilitatorUids)].filter((uid) => uid && !uid.includes("/"));
  if (uids.length === 0) return [];
  const snaps = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
  const out: NamedPerson[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (!isNamedWithStanding(standingUserOf(snap.id, data), "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
    out.push({ uid: snap.id, name: nameForViewer(viewer, accountNamesOf(data), "NAISI member") });
  }
  return out;
}

/** Everybody these registers name as having acted, read once, named for the reader. */
async function namesFor(
  db: Firestore,
  registers: readonly CourseAttendanceDoc[],
  viewer: { isAdmin: boolean; role?: string | null },
  withRecord: boolean,
): Promise<Map<string, string>> {
  const uids = new Set<string>();
  for (const register of registers) {
    for (const entry of Object.values(register.setBy)) uids.add(entry.byUid);
    if (register.cover) {
      uids.add(register.cover.byUid);
      for (const uid of register.cover.covering) uids.add(uid);
      if (register.cover.grantedByUid) uids.add(register.cover.grantedByUid);
    }
    if (withRecord) {
      for (const [uid, entry] of Object.entries(register.facilitatorRecord)) {
        uids.add(uid);
        uids.add(entry.byUid);
      }
    }
  }
  const wanted = [...uids].filter((uid) => uid && !uid.includes("/"));
  const names = new Map<string, string>();
  if (wanted.length === 0) return names;
  const snaps = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) {
    names.set(snap.id, snap.exists ? nameForViewer(viewer, accountNamesOf(snap.data() ?? {}), "NAISI member") : "NAISI member");
  }
  return names;
}

/**
 * Whether each person holding a live given cover on these registers runs
 * things on the programme: the give's own bar (`runsThingsOn`), read off
 * their stored account. By uid; nobody else is asked.
 */
async function givenStanding(
  db: Firestore,
  registers: readonly CourseAttendanceDoc[],
  run: { id: string; trackLeadUids: unknown },
  now: Date,
): Promise<Map<string, boolean>> {
  const uids = [
    ...new Set(
      registers
        .filter((register) => register.cover?.kind === "given" && coverIsLive(register.cover, now))
        .map((register) => register.cover?.byUid ?? ""),
    ),
  ].filter((uid) => uid && !uid.includes("/"));
  const out = new Map<string, boolean>();
  if (uids.length === 0) return out;
  const snaps = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) {
    const standing = standingUserOf(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    out.set(snap.id, snap.exists && holdsStanding(standing, "courseAttendance.cover.byUid") && (await runsThingsOn(db, run, { standing })));
  }
  return out;
}

export type RegisterCoverExtras = {
  setBy: Record<string, Record<string, LineSetterView>>;
  covers: Record<string, CoverView>;
  /** Only for a reader who is sent the facilitator record; undefined for anybody else. */
  facilitatorRecord?: Record<string, FacilitatorEntryView[]>;
};

/**
 * The extras for the registers on one page, by session key. `rows` are the
 * uids the reader may be shown lines for (the register's rows); a stamp on
 * anybody else's line is never sent.
 */
export async function registerCoverExtras(
  db: Firestore,
  input: {
    registers: readonly CourseAttendanceDoc[];
    rows: ReadonlySet<string>;
    viewer: { uid: string; isAdmin: boolean; role?: string | null };
    /** Sent whether each facilitator was there, and a cover's reason. */
    readsFacilitatorRecord: boolean;
    /** The run, for whether each person given a session runs things on it. */
    run: { id: string; trackLeadUids: unknown };
    now: Date;
  },
): Promise<RegisterCoverExtras> {
  const { registers, rows, viewer, readsFacilitatorRecord, now } = input;
  const [names, standing] = await Promise.all([
    namesFor(db, registers, viewer, readsFacilitatorRecord),
    // Asked only for a reader it is sent to.
    readsFacilitatorRecord || registers.some((register) => register.cover?.byUid === viewer.uid)
      ? givenStanding(db, registers, input.run, now)
      : Promise.resolve(new Map<string, boolean>()),
  ]);
  const nameOf = (uid: string) => names.get(uid) ?? "NAISI member";
  const person = (uid: string): NamedPerson => ({ uid, name: nameOf(uid) });
  const out: RegisterCoverExtras = { setBy: {}, covers: {} };
  if (readsFacilitatorRecord) out.facilitatorRecord = {};

  for (const register of registers) {
    const key = register.sessionKey;
    const lines: Record<string, LineSetterView> = {};
    for (const [uid, entry] of Object.entries(register.setBy)) {
      if (!rows.has(uid)) continue;
      // A line an approval of a request to be excused set: who approved it,
      // and when, are an admin's to read. Anybody else is told only that an
      // approved request set it.
      if (entry.how === "approval" && !viewer.isAdmin) {
        lines[uid] = { name: "", at: "", how: "approval", yours: false };
        continue;
      }
      lines[uid] = { name: nameOf(entry.byUid), at: entry.at.toISOString(), how: entry.how, yours: entry.byUid === viewer.uid };
    }
    if (Object.keys(lines).length > 0) out.setBy[key] = lines;

    const cover = register.cover;
    if (cover) {
      // Who took it and when, who gave it and until when, go to every reader
      // of the register: the foot tells each of them who the reminder about
      // a given session goes to, and that is who gave it. Whose place goes
      // to admins and the programme's lead (`readsFacilitatorRecord`, the
      // privacy policy's "The programme's lead and admins see this"); a
      // facilitator is told only when it was their own place, never a
      // co-facilitator's.
      const covering = readsFacilitatorRecord ? cover.covering : cover.covering.filter((uid) => uid === viewer.uid);
      const view: CoverView = {
        kind: cover.kind,
        by: person(cover.byUid),
        at: cover.at.toISOString(),
        covering: covering.map((uid) => ({ ...person(uid), you: uid === viewer.uid })),
        givenBy: cover.grantedByUid ? person(cover.grantedByUid) : null,
        until: cover.until ? cover.until.toISOString() : null,
        live: coverIsLive(cover, now),
        yours: cover.byUid === viewer.uid,
      };
      if (readsFacilitatorRecord || cover.byUid === viewer.uid) {
        view.stands = cover.kind !== "given" || standing.get(cover.byUid) !== false;
      }
      if (readsFacilitatorRecord) view.reason = cover.reason ?? null;
      out.covers[key] = view;
    }

    if (out.facilitatorRecord) {
      const entries = Object.entries(register.facilitatorRecord)
        .map(([uid, entry]) => ({
          uid,
          name: nameOf(uid),
          state: entry.state,
          arrivedAt: entry.arrivedAt ? entry.arrivedAt.toISOString() : null,
          byName: nameOf(entry.byUid),
          at: entry.at.toISOString(),
          how: entry.how,
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));
      if (entries.length > 0) out.facilitatorRecord[key] = entries;
    }
  }
  return out;
}
