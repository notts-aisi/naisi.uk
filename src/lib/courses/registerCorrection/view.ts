import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { CourseAttendanceDoc } from "@/lib/firestore/courseAttendance";
import {
  COURSE_AUDIT_COLLECTION,
  REGISTER_CORRECTION_AUDIT_KINDS,
  normalizeCourseAudit,
  type CourseAuditDoc,
} from "@/lib/firestore/courseAudit";
import {
  COURSE_REQUESTS_COLLECTION,
  normalizeCourseRequest,
  type CourseRequestDoc,
} from "@/lib/firestore/courseRequests";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { wordsOf } from "./model";

/**
 * WHAT THE REGISTER'S READ ADDS ABOUT CORRECTIONS, for each session on the
 * page and each line on it:
 *
 *  - `corrections`: for a line corrected after the register was finished,
 *    what it said before, who set that and when, who corrected it and when,
 *    and who asked for it. Worked out from the group's history rows, never
 *    copied onto the register: the register keeps only that the line was
 *    corrected (`corrected`).
 *  - `requests`: for a line somebody asked to have corrected, the waiting
 *    ask (what was asked, when, by whom) or, once it was decided, the
 *    outcome (corrected by whom and when, or declined with the reply).
 *
 * WHO IS SENT WHAT. Everybody the register's read admits as staff (its
 * facilitators, the people leading the programme, admins) is sent both; a
 * reader given one session is sent neither. A REASON, and a reply to a
 * request, go only to the people who correct registers (admins and the
 * people leading the programme) and to the person who gave it or was
 * replied to: a facilitator never reads a reason somebody else gave. Never a
 * note's words: no history row holds one.
 *
 * READS, each one equality (and one `in`, which Firestore treats as one) so
 * no list needs a declared index: the group's correction rows
 * (`groupId` and `kind`), only when a line on the page was corrected, and
 * the group's requests (`groupId`).
 */

/** One person, as the reader is shown them: never an address. */
type Named = { name: string };

/** How a corrected line came to say what it says. */
export type CorrectionStory = {
  /** A line's own correction, or one of the column's. */
  kind: "line" | "held-online" | "moved" | "did-happen";
  /** What the line said before, in words ("Absent"); null for a session that had no lines. */
  before: string | null;
  /** Who set what it said before, and when; null when the register did not keep it. */
  beforeSetBy: (Named & { at: string }) | null;
  /** Who corrected it, and when. */
  correctedBy: Named;
  correctedAt: string;
  /** Why, for the people who correct registers and for the person who gave it; absent for anybody else. */
  reason?: string;
  /** For a register moved to this session: the session it was on ("w01"). */
  movedFrom: string | null;
  /** The request it came from: who asked and when. */
  asked: (Named & { at: string; yours: boolean }) | null;
};

/** A request about one line, as the register shows it beside the line. */
export type RequestOnLine = {
  id: string;
  state: "waiting" | "approved" | "declined";
  /** What the line said when it was asked, and what it should say, in words. */
  from: string;
  to: string;
  askedBy: Named;
  askedAt: string;
  /** The reader asked it. */
  yours: boolean;
  /** Why, for the people who correct registers and the person who asked; absent for anybody else. */
  reason?: string;
  /** Who has said they are dealing with it, for the people who correct registers; absent for anybody else. */
  handling?: Named | null;
  decidedBy: Named | null;
  decidedAt: string | null;
  /** The reply to a declined request, for the people who correct registers and the person who asked; absent for anybody else. */
  reply?: string;
};

export type RegisterCorrectionExtras = {
  corrections: Record<string, Record<string, CorrectionStory>>;
  requests: Record<string, Record<string, RequestOnLine>>;
};

/** Most correction rows read for one group: a term holds tens of these. */
const MAX_ROWS = 500;
/** Most requests read for one group. */
const MAX_REQUESTS = 300;

/** The story's kind for a history row's kind. */
function storyKind(kind: string): CorrectionStory["kind"] | null {
  switch (kind) {
    case "attendance-edit":
      return "line";
    case "register-held-online":
      return "held-online";
    case "register-moved":
      return "moved";
    case "session-did-happen":
      return "did-happen";
    default:
      return null;
  }
}

/** Whether a history row corrected this person's line on this session, and what it said before. */
function rowTouches(row: CourseAuditDoc, sessionKey: string, uid: string): { before: string | null; setByUid: string | null; setAt: string | null } | null {
  if (row.kind === "attendance-edit") {
    if (row.sessionKey !== sessionKey || row.subjectUid !== uid || !row.after) return null;
    const before = typeof row.before?.line === "string" ? row.before.line : null;
    const setByUid = typeof row.before?.setByUid === "string" ? row.before.setByUid : null;
    const setAt = typeof row.before?.setAt === "string" ? row.before.setAt : null;
    return { before, setByUid, setAt };
  }
  const here = row.kind === "register-moved" ? row.toSessionKey === sessionKey : row.sessionKey === sessionKey;
  if (!here || !row.after || !Object.hasOwn(row.after, uid)) return null;
  const said = row.before?.[uid];
  return { before: typeof said === "string" ? said : null, setByUid: null, setAt: null };
}

export async function registerCorrectionExtras(
  db: Firestore,
  input: {
    runId: string;
    groupId: string;
    registers: readonly CourseAttendanceDoc[];
    /** The register's rows: nothing is said about anybody else's line. */
    rows: ReadonlySet<string>;
    viewer: { uid: string; isAdmin: boolean; role?: string | null };
    /** Admins and the people leading the programme: sent every reason and reply. */
    corrects: boolean;
    /** Somebody admitted only as given a session: sent nothing here. */
    onlyGiven: boolean;
  },
): Promise<RegisterCorrectionExtras> {
  const out: RegisterCorrectionExtras = { corrections: {}, requests: {} };
  if (input.onlyGiven) return out;
  const { runId, groupId, registers, rows, viewer, corrects } = input;
  const keys = new Set(registers.map((register) => register.sessionKey));
  const correctedLines = registers.flatMap((register) =>
    Object.entries(register.corrected)
      .filter(([uid]) => rows.has(uid))
      .map(([uid, stamp]) => ({ sessionKey: register.sessionKey, uid, stamp })),
  );

  const [auditSnap, requestSnap] = await Promise.all([
    correctedLines.length > 0
      ? db
          .collection(COURSE_AUDIT_COLLECTION)
          .where("groupId", "==", groupId)
          .where("kind", "in", [...REGISTER_CORRECTION_AUDIT_KINDS])
          .limit(MAX_ROWS)
          .get()
      : Promise.resolve(null),
    db.collection(COURSE_REQUESTS_COLLECTION).where("groupId", "==", groupId).limit(MAX_REQUESTS).get(),
  ]);

  const auditRows = (auditSnap?.docs ?? [])
    .map((doc) => normalizeCourseAudit(doc.id, doc.data() ?? {}))
    .filter((row) => row.runId === runId && row.groupId === groupId)
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  const requests = requestSnap.docs
    .map((doc) => normalizeCourseRequest(doc.id, doc.data() ?? {}))
    .filter((request): request is CourseRequestDoc => request !== null)
    .filter((request) => request.runId === runId && request.groupId === groupId && keys.has(request.sessionKey) && rows.has(request.subjectUid));
  const requestById = new Map(requests.map((request) => [request.id, request]));

  // Everybody named, read once, named for the reader.
  const uids = new Set<string>();
  for (const { stamp } of correctedLines) uids.add(stamp.byUid);
  for (const row of auditRows) {
    uids.add(row.actorUid);
    if (typeof row.before?.setByUid === "string") uids.add(row.before.setByUid);
  }
  for (const request of requests) {
    uids.add(request.askedByUid);
    if (request.decidedByUid) uids.add(request.decidedByUid);
    if (request.handlingUid) uids.add(request.handlingUid);
  }
  // A request an approved row names may be outside the page's sessions only
  // if the register moved; it is read with the rest of the group's.
  const wanted = [...uids].filter((uid) => uid && !uid.includes("/"));
  const accounts = wanted.length ? await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : [];
  const names = new Map<string, string>();
  for (const snap of accounts) {
    if (snap.exists) names.set(snap.id, nameForViewer(viewer, accountNamesOf(snap.data() ?? {}), "NAISI member"));
  }
  const named = (uid: string, fallback = "NAISI member"): Named => ({ name: names.get(uid) ?? fallback });

  for (const { sessionKey, uid, stamp } of correctedLines) {
    const row = auditRows.find((each) => rowTouches(each, sessionKey, uid) !== null) ?? null;
    const touched = row ? rowTouches(row, sessionKey, uid) : null;
    const kind = row ? storyKind(row.kind) : null;
    const request = row?.requestId ? (requestById.get(row.requestId) ?? null) : null;
    const story: CorrectionStory = {
      kind: kind ?? "line",
      before: touched?.before ?? null,
      beforeSetBy:
        touched?.setByUid && touched.setAt ? { ...named(touched.setByUid), at: touched.setAt } : null,
      correctedBy: row ? named(row.actorUid, row.actorName || "NAISI member") : named(stamp.byUid),
      correctedAt: (row?.at ?? stamp.at).toISOString(),
      movedFrom: row?.kind === "register-moved" ? row.sessionKey : null,
      asked: request
        ? { ...named(request.askedByUid), at: (request.askedAt ?? request.updatedAt ?? stamp.at).toISOString(), yours: request.askedByUid === viewer.uid }
        : null,
    };
    // A reason goes to the people who correct registers, and to the person
    // who gave it: an approved request's reason is the asker's own.
    if (row?.reason && (corrects || (request && request.askedByUid === viewer.uid))) story.reason = row.reason;
    (out.corrections[sessionKey] ??= {})[uid] = story;
  }

  // The newest request about each line that is not withdrawn: waiting, or
  // what became of it.
  const newestFirst = [...requests].sort((a, b) => (b.askedAt?.getTime() ?? 0) - (a.askedAt?.getTime() ?? 0));
  for (const request of newestFirst) {
    if (request.status === "withdrawn") continue;
    const lines = (out.requests[request.sessionKey] ??= {});
    if (lines[request.subjectUid]) continue;
    const yours = request.askedByUid === viewer.uid;
    const view: RequestOnLine = {
      id: request.id,
      state: request.status as RequestOnLine["state"],
      from: wordsOf(request.change.from),
      to: wordsOf(request.change.to),
      askedBy: named(request.askedByUid),
      askedAt: (request.askedAt ?? request.updatedAt ?? new Date(0)).toISOString(),
      yours,
      decidedBy: request.decidedByUid ? named(request.decidedByUid) : null,
      decidedAt: request.decidedAt ? request.decidedAt.toISOString() : null,
    };
    if (corrects || yours) {
      view.reason = request.reason;
      if (request.status === "declined") view.reply = request.reply;
    }
    if (corrects) view.handling = request.handlingUid ? named(request.handlingUid) : null;
    lines[request.subjectUid] = view;
  }
  for (const key of Object.keys(out.requests)) {
    if (Object.keys(out.requests[key]).length === 0) delete out.requests[key];
  }
  return out;
}
