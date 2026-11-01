import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { mayUse, scopeOf, seesReasonsByName, type Scope } from "@/lib/audience/scope";
import { parseTag } from "@/lib/audience/tags";
import { LEFT_OUT_REASONS, NO_NAME, PICKER_WORDS, leftOutWords, type LeftOutReason } from "@/lib/audience/words";
import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { addDaysToKey, londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import type { SessionUser } from "@/lib/firebase/session";
import {
  MESSAGE_SENDS_COLLECTION,
  normalizeMessageSend,
  type MessagePerson,
  type MessageSendDoc,
} from "@/lib/firestore/messageSends";
import { accountNamesOf, nameForViewer } from "@/lib/names/staffName";
import { listedSendOf } from "./sentSenders";
import {
  SENT_WORDS,
  logCountsWords,
  messageCountsWords,
  noAccountWords,
  sentModeWords,
  sentWindowWords,
} from "./words";
import type { MessageWriter } from "./writers";

/**
 * MESSAGES' SENT: what was sent, and who it reached, for the person reading.
 *
 * WHO READS IT: the people who write in Messages (`messageWriterOf`), and
 * each of them only the sends to people they may write to:
 *
 *  - AN ADMIN reads every send: every message written in Messages, and what
 *    the site's other senders sent, from the email log (`emailSends`).
 *  - A PROGRAMME'S LEAD OR A GROUP'S FACILITATOR reads a message written in
 *    Messages when every tag it was for, included or left out, is one the
 *    picker's scope table lets them use now (`mayUse`, the same question the
 *    send asks of every tag), so a message to people they run, whoever wrote
 *    it. Nothing of the email log: it is the admins' alone, and its rows
 *    carry no tags the table can ask about.
 *
 * WHAT IT SAYS. Each send's subject, when, who sent it, and who it reached,
 * by name, by the site's one rule for the person reading (`nameForViewer`:
 * the committee and admins see the full name, a facilitator the name people
 * go by). A message from Messages also says who was left out and why, from
 * the record its send kept (`messageSends`): person by person to an admin,
 * as counts to anybody else (`seesReasonsByName`), as See who does. The
 * email log records nobody it left out, so another sender's send says only
 * who it reached and what became of each email.
 *
 * NO ADDRESS LEAVES THIS FILE, and no account id: an address the log holds is
 * matched to an account to name it, and one no account holds is counted. A
 * person with no account (a guest, a walk-in) is a count.
 *
 * TWO WEEKS AT A TIME, in London days, the newest first (`sentWindowOf`).
 * The email log is read a window at a time up to a ceiling, and the page
 * says so when a window holds more than that.
 *
 * Every read is one range on one field, or documents by id, so none needs a
 * declared index.
 */

/** Days of sends one page of Sent shows. */
export const SENT_WINDOW_DAYS = 14;

/** The most records from Messages one window reads: more than ten a day per audience can make. */
export const MAX_SENT_RECORDS = 300;

/** The most rows of the email log one window reads. Over it the page says some may be missing. */
export const MAX_LOG_ROWS = 3000;

/**
 * Rows of the log that make one send: the same kind, surface, sender, subject
 * and reference, each within this long of the one before. A send's emails go
 * out in one request, or a job's over its ticks; the same words to the same
 * people later are another send.
 */
export const SEND_GAP_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type SentWindow = {
  /** The window's first and last London days, "YYYY-MM-DD". */
  firstDay: string;
  lastDay: string;
  /** From the start of its first day to the start of the day after its last, in London. */
  start: Date;
  end: Date;
  /** The last day of the window before, and of the one after, or null when this one ends today. */
  earlier: string;
  later: string | null;
};

/** A real calendar day as "YYYY-MM-DD", or false. */
function isDay(key: string): boolean {
  if (!DATE_KEY.test(key)) return false;
  const at = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === key;
}

/**
 * The two weeks Sent shows: ending today, or ending on the day asked for
 * (`?until=`) when that is a real day before today. Anything else is today.
 */
export function sentWindowOf(asked: unknown, now: Date): SentWindow {
  const today = londonDateKey(now);
  const lastDay = typeof asked === "string" && isDay(asked) && asked < today ? asked : today;
  const firstDay = addDaysToKey(lastDay, -(SENT_WINDOW_DAYS - 1));
  const after = addDaysToKey(lastDay, SENT_WINDOW_DAYS);
  return {
    firstDay,
    lastDay,
    start: londonWallClockToInstant(firstDay, "00:00"),
    end: londonWallClockToInstant(addDaysToKey(lastDay, 1), "00:00"),
    earlier: addDaysToKey(lastDay, -SENT_WINDOW_DAYS),
    later: lastDay === today ? null : after < today ? after : today,
  };
}

/** Sent, ending on a day: no address for the window that ends today. */
export function sentHref(lastDay: string | null, now: Date): string {
  if (lastDay === null || lastDay >= londonDateKey(now)) return "/messages/sent";
  return `/messages/sent?until=${encodeURIComponent(lastDay)}`;
}

/** "Sun 1 Nov", for a London day. Noon UTC is the same day in London whatever the season. */
const dayWords = (key: string) => londonDayLabel(new Date(`${key}T12:00:00Z`));

// ---------------------------------------------------------------------------
// What reaches the page
// ---------------------------------------------------------------------------

/** One person a send reached, or meant to: a name, never an address or an id. */
export type SentPersonView = {
  name: string;
  you: boolean;
  emailed: boolean;
  /** For an admin, what became of them when they were not emailed; null otherwise. */
  why: string | null;
};

export type SentSendView = {
  /** For the list's own keys: a record's id, or the log send's place in the list. */
  key: string;
  /** "messages" for one written in Messages, "log" for another sender's from the email log. */
  source: "messages" | "log";
  subject: string;
  /** The instant, for the <time> element, and the words for it: "Wed 18 Nov, 3pm". */
  at: string | null;
  when: string;
  /** Who sent it: a name, "you", or the site. */
  from: string;
  /** What it was: "Programme notice", "Room notice", "Newsletter". */
  what: string;
  /** Whether it went whatever its people's settings say: a notice. */
  notice: boolean;
  /** A message's tags, as the writer chose them; none for another sender's. */
  tags: { label: string; sign: "include" | "exclude" }[];
  counts: string;
  /** A message whose record never settled. */
  cutOff: boolean;
  posted: boolean;
  /** Everybody with an account, by name. */
  people: SentPersonView[];
  /** Everybody with no account, counted: "2 people with no account". */
  noAccount: string | null;
  /** Who was left out, by why: a message's, from its record. */
  reasons: { why: string; count: number }[];
};

export type SentView = {
  /** Whether the reader sees every send (an admin), or those to the people they run. */
  everything: boolean;
  window: { words: string; earlierHref: string; laterHref: string | null };
  sends: SentSendView[];
  /** The email log held more rows in the window than were read. */
  capped: boolean;
};

// ---------------------------------------------------------------------------
// Who may read a record
// ---------------------------------------------------------------------------

/**
 * May this reader read this message? An admin, any. Anybody else, only one
 * whose every tag, included or left out, they may use now: a message to the
 * people they run.
 */
export function maySeeSend(scope: Scope, record: Pick<MessageSendDoc, "tags">): boolean {
  if (scope.admin) return true;
  return (
    record.tags.length > 0 &&
    record.tags.every((each) => {
      const tag = parseTag(each.id);
      return tag !== null && mayUse(scope, tag);
    })
  );
}

// ---------------------------------------------------------------------------
// The email log's sends
// ---------------------------------------------------------------------------

/** One row of the email log, as Sent reads it. */
export type LogRow = {
  kind: string;
  surface: string | null;
  actorUid: string | null;
  referenceId: string | null;
  subject: string;
  /** The address it went to: matched to an account here, and never handed on. */
  to: string;
  status: string;
  sentAt: Date;
};

/** One send of another sender's, made of the log's rows. */
export type LogSend = {
  label: string;
  byPerson: boolean;
  /** A notice, or the room notice's own older kind: it went whatever its people's settings say. */
  notice: boolean;
  actorUid: string | null;
  subject: string;
  at: Date;
  rows: LogRow[];
};

/**
 * The log's rows as sends, the newest first: only the kinds Sent lists
 * (`./sentSenders.ts`), and one send for the rows of one kind, surface,
 * sender, reference and subject that went out within `SEND_GAP_MS` of each
 * other. Pure.
 */
export function groupLogSends(rows: readonly LogRow[]): LogSend[] {
  const listed = rows
    .flatMap((row) => {
      const what = listedSendOf(row.kind, row.surface);
      return what ? [{ row, what }] : [];
    })
    .sort((a, b) => a.row.sentAt.getTime() - b.row.sentAt.getTime());
  const open = new Map<string, { send: LogSend; lastAt: number }>();
  const out: LogSend[] = [];
  for (const { row, what } of listed) {
    const key = JSON.stringify([row.kind, row.surface ?? "", row.actorUid ?? "", row.referenceId ?? "", row.subject]);
    const at = row.sentAt.getTime();
    const current = open.get(key);
    if (current && at - current.lastAt <= SEND_GAP_MS) {
      current.send.rows.push(row);
      current.lastAt = at;
      continue;
    }
    const send: LogSend = {
      label: what.label,
      byPerson: what.byPerson,
      notice: row.kind === "notice" || row.kind === "course-notice",
      actorUid: row.actorUid,
      subject: row.subject,
      at: row.sentAt,
      rows: [row],
    };
    open.set(key, { send, lastAt: at });
    out.push(send);
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

function logRowOf(data: Record<string, unknown>): LogRow | null {
  const sentAt = dateOf(data.sentAt);
  if (!sentAt) return null;
  return {
    kind: text(data.kind) || "unknown",
    surface: text(data.surface) || null,
    actorUid: text(data.actorUid) || null,
    referenceId: text(data.referenceId) || null,
    subject: typeof data.subject === "string" ? data.subject : "",
    to: text(data.to).toLowerCase(),
    status: text(data.status) || "sent",
    sentAt,
  };
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

type Accounts = Map<string, Record<string, unknown>>;

/** The accounts of these uids, 300 at a time. */
async function readAccounts(db: Firestore, uids: Iterable<string>): Promise<Accounts> {
  const wanted = [...new Set(uids)].filter((uid) => uid && !uid.includes("/"));
  const out: Accounts = new Map();
  for (let at = 0; at < wanted.length; at += 300) {
    const snaps = await db.getAll(...wanted.slice(at, at + 300).map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) if (snap.exists) out.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  }
  return out;
}

/** Every account, for an admin, whose log names people by address. */
async function readEveryAccount(db: Firestore): Promise<Accounts> {
  const snap = await db.collection("users").get();
  const out: Accounts = new Map();
  for (const doc of snap.docs) out.set(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
  return out;
}

/** Each address an account holds, lower-cased, to its uid: its own address first, then a university one. */
function accountsByAddress(accounts: Accounts): Map<string, string> {
  const out = new Map<string, string>();
  for (const [uid, data] of accounts) {
    const own = text(data.email).toLowerCase();
    if (own && !out.has(own)) out.set(own, uid);
  }
  for (const [uid, data] of accounts) {
    const profile = (data.profile ?? {}) as Record<string, unknown>;
    const university = text(profile.universityEmail).toLowerCase();
    if (university && !out.has(university)) out.set(university, uid);
  }
  return out;
}

type Reader = {
  viewer: SessionUser;
  scope: Scope;
  accounts: Accounts;
};

/** The name this reader sees for an account: the site's one rule, or that it has gone. */
function nameOf(reader: Reader, uid: string): string {
  const data = reader.accounts.get(uid);
  return data ? nameForViewer(reader.viewer, accountNamesOf(data), NO_NAME) : SENT_WORDS.gone;
}

const byName = (a: SentPersonView, b: SentPersonView) => a.name.localeCompare(b.name, "en-GB");

const whenWords = (at: Date) => `${londonDayLabel(at)}, ${londonClockLabel(at)}`;

// ---------------------------------------------------------------------------
// A message from Messages
// ---------------------------------------------------------------------------

const LEFT_OUT = new Set<string>(LEFT_OUT_REASONS);

/** What became of one person a message was for, for an admin: null when they were emailed. */
function whyOf(person: MessagePerson, record: MessageSendDoc): string | null {
  if (person.leftOut !== null) {
    return LEFT_OUT.has(person.leftOut) ? leftOutWords(person.leftOut as LeftOutReason, record.row ?? "courses") : SENT_WORDS.notEmailed;
  }
  switch (person.outcome) {
    case "sent":
      return null;
    case "held":
      return SENT_WORDS.held;
    case "suppressed":
      return SENT_WORDS.suppressed;
    case "failed":
      return SENT_WORDS.failed;
    default:
      return SENT_WORDS.unknown;
  }
}

function messageView(reader: Reader, record: MessageSendDoc): SentSendView {
  const reasonsByName = seesReasonsByName(reader.scope);
  const people: SentPersonView[] = [];
  let noAccount = 0;
  for (const person of record.people) {
    if (person.uid === null) {
      noAccount += 1;
      continue;
    }
    const emailed = person.leftOut === null && person.outcome === "sent";
    people.push({
      name: nameOf(reader, person.uid),
      you: person.uid === reader.viewer.uid,
      emailed,
      why: reasonsByName && !emailed ? whyOf(person, record) : null,
    });
  }
  const reasons = LEFT_OUT_REASONS.map((reason) => ({
    why: leftOutWords(reason, record.row ?? "courses"),
    count: record.people.filter((person) => person.leftOut === reason).length,
  })).filter((each) => each.count > 0);
  const tags = record.tags.map((each) => {
    const tag = parseTag(each.id);
    // A person is named for the reader, as everybody else in the send is.
    const label = tag?.kind === "person" ? nameOf(reader, tag.uid) : each.label || PICKER_WORDS.goneTag;
    return { label, sign: each.sign };
  });
  const at = record.sentAt;
  return {
    key: `m:${record.id}`,
    source: "messages",
    subject: record.subject,
    at: at ? at.toISOString() : null,
    when: at ? whenWords(at) : "",
    from: record.writerUid === reader.viewer.uid ? SENT_WORDS.you : nameOf(reader, record.writerUid),
    what: sentModeWords(record.mode, record.row),
    notice: record.mode === "notice",
    tags,
    counts: messageCountsWords(record.counts, record.settled),
    cutOff: !record.settled,
    posted: record.postedUpdateId !== null,
    people: people.sort(byName),
    noAccount: noAccount > 0 ? noAccountWords(noAccount) : null,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Another sender's send, from the email log
// ---------------------------------------------------------------------------

/** One email's outcome, best first: told on any address is told. */
const OUTCOME_ORDER = ["sent", "bounced", "held", "suppressed"] as const;
type LogOutcome = (typeof OUTCOME_ORDER)[number];

function logOutcomeOf(status: string): LogOutcome {
  if (status === "bounced" || status === "complained") return "bounced";
  if (status === "held" || status === "suppressed") return status;
  return "sent";
}

const LOG_WHY: Record<Exclude<LogOutcome, "sent">, string> = {
  bounced: SENT_WORDS.bounced,
  held: SENT_WORDS.held,
  suppressed: SENT_WORDS.suppressed,
};

function logView(reader: Reader, send: LogSend, index: number, byAddress: ReadonlyMap<string, string>): SentSendView {
  const accounts = new Map<string, LogOutcome>();
  const others = new Map<string, LogOutcome>();
  const better = (a: LogOutcome | undefined, b: LogOutcome) =>
    a === undefined || OUTCOME_ORDER.indexOf(b) < OUTCOME_ORDER.indexOf(a) ? b : a;
  for (const row of send.rows) {
    const outcome = logOutcomeOf(row.status);
    const uid = byAddress.get(row.to);
    if (uid) accounts.set(uid, better(accounts.get(uid), outcome));
    else if (row.to) others.set(row.to, better(others.get(row.to), outcome));
  }
  const people = [...accounts.entries()].map(([uid, outcome]) => ({
    name: nameOf(reader, uid),
    you: uid === reader.viewer.uid,
    emailed: outcome === "sent",
    why: outcome === "sent" ? null : LOG_WHY[outcome],
  }));
  const all = [...accounts.values(), ...others.values()];
  const tally = (outcome: LogOutcome) => all.filter((each) => each === outcome).length;
  const from =
    send.byPerson && send.actorUid && reader.accounts.has(send.actorUid)
      ? send.actorUid === reader.viewer.uid
        ? SENT_WORDS.you
        : nameOf(reader, send.actorUid)
      : SENT_WORDS.site;
  return {
    key: `l:${index}`,
    source: "log",
    subject: send.subject,
    at: send.at.toISOString(),
    when: whenWords(send.at),
    from,
    what: send.label,
    notice: send.notice,
    tags: [],
    counts: logCountsWords({ emailed: tally("sent"), bounced: tally("bounced"), held: tally("held"), suppressed: tally("suppressed") }),
    cutOff: false,
    posted: false,
    people: people.sort(byName),
    noAccount: others.size > 0 ? noAccountWords(others.size) : null,
    reasons: [],
  };
}

// ---------------------------------------------------------------------------
// The page's read
// ---------------------------------------------------------------------------

/**
 * Sent, for one writer, over one window. `writer` is `messageWriterOf`'s
 * answer for the same session, so the page, the tags and who may read what
 * are worked out from the one read of the term.
 */
export async function loadSent(db: Firestore, viewer: SessionUser, writer: MessageWriter, window: SentWindow, now: Date): Promise<SentView> {
  const scope = scopeOf(viewer, { leads: writer.roles.leads, groups: writer.roles.tagGroups });
  const view = (sends: SentSendView[], capped: boolean): SentView => ({
    everything: scope?.admin === true,
    window: {
      words: sentWindowWords(dayWords(window.firstDay), dayWords(window.lastDay)),
      earlierHref: sentHref(window.earlier, now),
      laterHref: window.later === null ? null : sentHref(window.later, now),
    },
    sends,
    capped,
  });
  if (!scope) return view([], false);

  // The newest first, each one range on one field ordered by that field, so
  // no index is declared. The email log is the admins' alone, and read only
  // for an admin.
  const [recordSnap, logSnap] = await Promise.all([
    db
      .collection(MESSAGE_SENDS_COLLECTION)
      .where("sentAt", ">=", window.start)
      .where("sentAt", "<", window.end)
      .orderBy("sentAt", "desc")
      .limit(MAX_SENT_RECORDS)
      .get(),
    scope.admin
      ? db
          .collection("emailSends")
          .where("sentAt", ">=", window.start)
          .where("sentAt", "<", window.end)
          .orderBy("sentAt", "desc")
          .limit(MAX_LOG_ROWS)
          .get()
      : Promise.resolve(null),
  ]);

  const records = recordSnap.docs
    .map((doc) => normalizeMessageSend(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((record): record is MessageSendDoc => record !== null && maySeeSend(scope, record));
  const logSends = logSnap
    ? groupLogSends(
        logSnap.docs.map((doc) => logRowOf((doc.data() ?? {}) as Record<string, unknown>)).filter((row): row is LogRow => row !== null),
      )
    : [];

  // Every name on the page, read once: an admin's every account (the log
  // names people by address), anybody else's the accounts their sends name.
  const accounts = scope.admin
    ? await readEveryAccount(db)
    : await readAccounts(
        db,
        records.flatMap((record) => [
          record.writerUid,
          ...record.people.flatMap((person) => (person.uid ? [person.uid] : [])),
          ...record.tags.flatMap((each) => {
            const tag = parseTag(each.id);
            return tag?.kind === "person" ? [tag.uid] : [];
          }),
        ]),
      );
  const reader: Reader = { viewer, scope, accounts };
  const byAddress = scope.admin ? accountsByAddress(accounts) : new Map<string, string>();

  const sends = [
    ...records.map((record) => messageView(reader, record)),
    ...logSends.map((send, index) => logView(reader, send, index, byAddress)),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return view(sends, logSnap !== null && logSnap.docs.length >= MAX_LOG_ROWS);
}
