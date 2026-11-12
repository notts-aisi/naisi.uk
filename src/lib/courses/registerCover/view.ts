import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { standingUserOf } from "@/lib/courses/programmeLead";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type {
  CourseAttendanceDoc,
  FacilitatorPresenceState,
  LineSetterHow,
} from "@/lib/firestore/courseAttendance";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { coverIsLive } from "./model";

/**
 * WHAT THE REGISTER'S READ ADDS ABOUT WHO TOOK IT: for each session on the
 * page, who set each line and when, who took it in whose place, and (for
 * admins and the people leading the programme only) whether each of the
 * group's facilitators was there. Every person by name, by the names rule for
 * whoever reads it (`nameForViewer`), never an address.
 *
 * A register written before these fields existed has none of them, and reads
 * as nobody having set anything, nobody covering, and no record.
 */

/** One line's stamp, as the register's page shows it: "Zach, 4:14pm", or "Set before the session" for `self`. */
export type LineSetterView = { name: string; at: string; how: LineSetterHow };

/** A person by uid and name. */
export type NamedPerson = { uid: string; name: string };

/** Who took a session's register in whose place. */
export type CoverView = {
  kind: "self" | "given";
  /** Who took it, or was given it. */
  by: NamedPerson;
  /** When it was taken, or given. */
  at: string;
  /** The facilitators whose place was taken; empty for a group with none. */
  covering: NamedPerson[];
  /** For a session given to somebody: who gave it. */
  givenBy: NamedPerson | null;
  /** For a session given to somebody: when it stops being theirs. */
  until: string | null;
  /** Whether it still holds: a session given to somebody stops at `until`. */
  live: boolean;
  /** True when the reader is the person who took it. */
  yours: boolean;
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
    now: Date;
  },
): Promise<RegisterCoverExtras> {
  const { registers, rows, viewer, readsFacilitatorRecord, now } = input;
  const names = await namesFor(db, registers, viewer, readsFacilitatorRecord);
  const nameOf = (uid: string) => names.get(uid) ?? "NAISI member";
  const person = (uid: string): NamedPerson => ({ uid, name: nameOf(uid) });
  const out: RegisterCoverExtras = { setBy: {}, covers: {} };
  if (readsFacilitatorRecord) out.facilitatorRecord = {};

  for (const register of registers) {
    const key = register.sessionKey;
    const lines: Record<string, LineSetterView> = {};
    for (const [uid, entry] of Object.entries(register.setBy)) {
      if (!rows.has(uid)) continue;
      lines[uid] = { name: nameOf(entry.byUid), at: entry.at.toISOString(), how: entry.how };
    }
    if (Object.keys(lines).length > 0) out.setBy[key] = lines;

    const cover = register.cover;
    if (cover) {
      const view: CoverView = {
        kind: cover.kind,
        by: person(cover.byUid),
        at: cover.at.toISOString(),
        covering: cover.covering.map(person),
        givenBy: cover.grantedByUid ? person(cover.grantedByUid) : null,
        until: cover.until ? cover.until.toISOString() : null,
        live: coverIsLive(cover, now),
        yours: cover.byUid === viewer.uid,
      };
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
