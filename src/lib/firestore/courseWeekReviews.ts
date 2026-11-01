/**
 * `courseWeekReviews/{runId}__{weekId}`: what Claude last said about one week
 * of one run when an admin pressed "Review with Claude" on the week's review
 * page (privacy v15, "AI-assisted review"): draft grades for the week's
 * written answers, what people found hard, and who might need a hand.
 *
 * WHAT CLAUDE RETURNS IS AN ADMIN'S, AND STAYS WITH THE RUN. The policy says
 * what comes back "is seen by admins only", "is kept with what it was about
 * (the application, or the programme's run) and deleted with it", and that
 * "nothing of it is filed on your profile". So this record is read only by
 * the review's own page and route, and by the two deletions;
 * `tests/claude-output-readers.test.mjs` walks the tree and fails any other
 * reader, and any reader in the notes kept about a person.
 *
 * THREE PARTS, EACH KEPT ON ITS OWN (`grades`, `themes`, `hands`), because
 * each is its own request: when one fails the others are kept, and the page
 * says which to ask for again. Each part is replaced whole on its next press,
 * so the record is "kept until somebody asks again".
 *
 * PEOPLE ARE KEPT BY ACCOUNT, never by name. A grade names the account whose
 * answer it is; a theme the accounts whose answers it cites; a hand the
 * account it is about; Claude's own words keep its labels ("Fellow 3",
 * "Group 2") and the page puts names back from who holds a place now, through
 * the labels kept beside them. `uids` lists every account the record names,
 * so an account's deletion finds it by one `array-contains` and takes the
 * account out (`reviewWithout`). Check-ins are counts and never name anybody;
 * reports are counts too, because a report's own id carries its writer's.
 *
 * WRITTEN AND READ ONLY ON THE SERVER: `firestore.rules` refuses every
 * browser, admins included.
 *
 * Pure: no imports, so the tests and the deletions read it anywhere.
 */

export const COURSE_WEEK_REVIEWS_COLLECTION = "courseWeekReviews";

/** One record per week of a run. CONSTRUCT-ONLY: the run and the week are also fields. */
export function weekReviewId(runId: string, weekId: string): string {
  return `${runId}__${weekId}`;
}

/** The three parts of a review, each one request to Claude. */
export const REVIEW_PARTS = ["grades", "themes", "hands"] as const;
export type ReviewPart = (typeof REVIEW_PARTS)[number];

/** Who asked, when, and what was sent, for any part. */
export type PartAsked = {
  at: Date | null;
  askedByUid: string;
};

/** A part Claude could not answer, with the reason the page shows. */
export type PartFailed = PartAsked & { state: "failed"; reason: string };

/** One draft grade: whose answer, which row, to which question, the grade and a hash of the words graded. */
export type StoredGrade = { uid: string; rowId: string; questionKey: string; grade: number; hash: string };

export type StoredGrades =
  | (PartAsked & { state: "ready"; model: string; fingerprint: string; sent: number; items: StoredGrade[] })
  | PartFailed;

/** One answer a theme cites: whose, and which row. */
export type ThemeAnswer = { uid: string; rowId: string };

export type StoredTheme = {
  /** Claude's title, in its labels. */
  title: string;
  /** The part of the week it is about, by the part's id, or null. */
  partId: string | null;
  /** The groups its cited items came from, by id, worked out on the site from what was cited. */
  groupIds: string[];
  answers: ThemeAnswer[];
  /** How many check-ins it cites: never which, never whose. */
  checkIns: number;
  /** How many facilitators' reports it cites. */
  reports: number;
  /** One line from Claude, in its labels; "" when the checker dropped it. */
  detail: string;
};

export type StoredThemes =
  | (PartAsked & {
      state: "ready";
      model: string;
      fingerprint: string;
      sent: { answers: number; reflections: number; checkIns: number; reports: number };
      /** "Group 2" to the group it stood for. */
      groupLabels: Record<string, string>;
      list: StoredTheme[];
    })
  | PartFailed;

export type StoredHand = {
  uid: string;
  /** Claude's reason, in its labels. */
  why: string;
  /** How many of the person's own answers, and of the reports, it cites. */
  answers: number;
  reports: number;
};

export type StoredHands =
  | (PartAsked & {
      state: "ready";
      model: string;
      fingerprint: string;
      sent: { answers: number; reflections: number; reports: number };
      /** "Fellow 3" to the account it stood for. */
      labels: Record<string, string>;
      groupLabels: Record<string, string>;
      list: StoredHand[];
    })
  | PartFailed;

export type CourseWeekReviewDoc = {
  id: string;
  runId: string;
  weekId: string;
  weekNumber: number;
  grades: StoredGrades | null;
  themes: StoredThemes | null;
  hands: StoredHands | null;
  /** Every account the record names, for an account's deletion. */
  uids: string[];
};

type Raw = Record<string, unknown>;

function record(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

const str = (value: unknown, max = 2000): string => (typeof value === "string" ? value.slice(0, max) : "");
const count = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;

function labelsOf(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [label, uid] of Object.entries(record(value))) {
    if (typeof uid === "string" && uid) out[label] = uid;
  }
  return out;
}

function asked(data: Raw): PartAsked {
  return { at: tsToDate(data.at), askedByUid: str(data.askedByUid, 128) };
}

function failedOf(data: Raw): PartFailed | null {
  return data.state === "failed" ? { ...asked(data), state: "failed", reason: str(data.reason, 300) } : null;
}

function gradesOf(value: unknown): StoredGrades | null {
  const data = record(value);
  if (data.state !== "ready") return failedOf(data);
  const items: StoredGrade[] = [];
  for (const each of Array.isArray(data.items) ? data.items : []) {
    const item = record(each);
    const grade = item.grade;
    if (typeof grade !== "number" || !Number.isInteger(grade) || grade < 1 || grade > 10) continue;
    const uid = str(item.uid, 128);
    const rowId = str(item.rowId, 400);
    if (!uid || !rowId) continue;
    items.push({ uid, rowId, questionKey: str(item.questionKey, 200), grade, hash: str(item.hash, 64) });
  }
  return { ...asked(data), state: "ready", model: str(data.model, 100), fingerprint: str(data.fingerprint, 64), sent: count(data.sent), items };
}

function themesOf(value: unknown): StoredThemes | null {
  const data = record(value);
  if (data.state !== "ready") return failedOf(data);
  const sent = record(data.sent);
  const list: StoredTheme[] = [];
  for (const each of Array.isArray(data.list) ? data.list : []) {
    const theme = record(each);
    const title = str(theme.title, 200);
    if (!title) continue;
    list.push({
      title,
      partId: typeof theme.partId === "string" && theme.partId ? theme.partId : null,
      groupIds: Array.isArray(theme.groupIds) ? theme.groupIds.filter((id): id is string => typeof id === "string" && !!id) : [],
      answers: (Array.isArray(theme.answers) ? theme.answers : [])
        .map((answer) => record(answer))
        .map((answer) => ({ uid: str(answer.uid, 128), rowId: str(answer.rowId, 400) }))
        .filter((answer) => answer.uid && answer.rowId),
      checkIns: count(theme.checkIns),
      reports: count(theme.reports),
      detail: str(theme.detail, 600),
    });
  }
  return {
    ...asked(data),
    state: "ready",
    model: str(data.model, 100),
    fingerprint: str(data.fingerprint, 64),
    sent: { answers: count(sent.answers), reflections: count(sent.reflections), checkIns: count(sent.checkIns), reports: count(sent.reports) },
    groupLabels: labelsOf(data.groupLabels),
    list,
  };
}

function handsOf(value: unknown): StoredHands | null {
  const data = record(value);
  if (data.state !== "ready") return failedOf(data);
  const sent = record(data.sent);
  const list: StoredHand[] = [];
  for (const each of Array.isArray(data.list) ? data.list : []) {
    const hand = record(each);
    const uid = str(hand.uid, 128);
    const why = str(hand.why, 400);
    if (!uid || !why || list.some((other) => other.uid === uid)) continue;
    list.push({ uid, why, answers: count(hand.answers), reports: count(hand.reports) });
  }
  return {
    ...asked(data),
    state: "ready",
    model: str(data.model, 100),
    fingerprint: str(data.fingerprint, 64),
    sent: { answers: count(sent.answers), reflections: count(sent.reflections), reports: count(sent.reports) },
    labels: labelsOf(data.labels),
    groupLabels: labelsOf(data.groupLabels),
    list,
  };
}

/**
 * A stored review, read leniently, or null for a record that cannot say
 * which run and week it is about: shown to nobody, the safe direction.
 */
export function normalizeWeekReview(id: string, data: Raw): CourseWeekReviewDoc | null {
  const runId = str(data.runId, 200);
  const weekId = str(data.weekId, 10);
  const weekNumber = typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) ? data.weekNumber : 0;
  if (!runId || !weekId || weekNumber < 1) return null;
  return {
    id,
    runId,
    weekId,
    weekNumber,
    grades: data.grades ? gradesOf(data.grades) : null,
    themes: data.themes ? themesOf(data.themes) : null,
    hands: data.hands ? handsOf(data.hands) : null,
    uids: Array.isArray(data.uids) ? data.uids.filter((uid): uid is string => typeof uid === "string" && !!uid) : [],
  };
}

/** Every account a stored part names. */
export function uidsOfPart(part: Raw): string[] {
  const uids = new Set<string>();
  for (const item of Array.isArray(part.items) ? part.items : []) {
    const uid = record(item).uid;
    if (typeof uid === "string" && uid) uids.add(uid);
  }
  for (const theme of Array.isArray(part.list) ? part.list : []) {
    const entry = record(theme);
    if (typeof entry.uid === "string" && entry.uid) uids.add(entry.uid);
    for (const answer of Array.isArray(entry.answers) ? entry.answers : []) {
      const uid = record(answer).uid;
      if (typeof uid === "string" && uid) uids.add(uid);
    }
  }
  for (const uid of Object.values(record(part.labels))) if (typeof uid === "string" && uid) uids.add(uid);
  return [...uids];
}

/**
 * THE FIELDS TO WRITE BACK WHEN AN ACCOUNT IS DELETED: each part with that
 * account taken out of it (its grades, its place in a theme's answers, its
 * hand, its label). Everything else stays for everybody else on the run;
 * Claude's words that named the account's label then read "a fellow" on the
 * page, as a label nobody holds does. `uids` is the caller's to remove.
 */
export function reviewWithout(data: Raw, uid: string): Partial<Record<ReviewPart, Raw>> {
  const out: Partial<Record<ReviewPart, Raw>> = {};
  const grades = record(data.grades);
  if (Array.isArray(grades.items)) {
    out.grades = { ...grades, items: grades.items.filter((item) => record(item).uid !== uid) };
  }
  const themes = record(data.themes);
  if (Array.isArray(themes.list)) {
    out.themes = {
      ...themes,
      list: themes.list.map((theme) => {
        const entry = record(theme);
        return { ...entry, answers: (Array.isArray(entry.answers) ? entry.answers : []).filter((answer) => record(answer).uid !== uid) };
      }),
    };
  }
  const hands = record(data.hands);
  if (Array.isArray(hands.list) || hands.labels) {
    out.hands = {
      ...hands,
      list: (Array.isArray(hands.list) ? hands.list : []).filter((hand) => record(hand).uid !== uid),
      labels: Object.fromEntries(Object.entries(record(hands.labels)).filter(([, value]) => value !== uid)),
    };
  }
  return out;
}
