import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import type { CourseWeekReviewDoc, StoredGrade } from "@/lib/firestore/courseWeekReviews";
import type { FactLine } from "./facts";
import { withNamesBack, type ReviewInputs } from "./input";
import { REVIEW_WORDS, listWords } from "./words";

/**
 * A WEEK'S REVIEW AS ITS PAGE DRAWS IT, for an admin (privacy v15), worked
 * out from what Claude last said (the review kept with the run), what would be sent
 * now, and what the site already knows. Names come back here, from who
 * holds a place NOW: a grade, a theme's answer or a hand about somebody who
 * no longer holds one is left out, and a label nobody holds reads "a fellow".
 * A grade whose answer has changed since, or may no longer be sent, is left
 * out of the chart and the lists and counted instead.
 *
 * Pure, and every field is plain data: the page is drawn on the server and
 * hands the press and the follow-up buttons only ids and words.
 */

export type PartState<T> =
  | { state: "none" }
  | { state: "failed"; reason: string }
  | ({ state: "ready"; outOfDate: boolean } & T);

export type GradeEntry = { key: string; name: string; group: string; question: string | null; grade: number; href: string };

export type HandLine = { text: string; source: string };

export type HandRow = {
  uid: string;
  name: string;
  group: string;
  lines: HandLine[];
  /** The button's words, or null with nobody to ask. */
  ask: string | null;
  /** "Asked Mon 23 Nov", once asked this week. */
  asked: string | null;
  page: string;
};

export type WeekReviewView = {
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  /** "every group has met", "3 of 11 groups have met". */
  groupsLine: string;
  /** The week's first session's day, "Mon 23 Nov", or null. */
  firstDay: string | null;
  claude: boolean;
  reviewable: boolean;
  sending: { counts: string; leftOut: string | null; nothing: boolean; seen: string };
  /** "Drafted by Claude, Mon 23 Nov, 9:12am. Kept until somebody asks again." */
  askedLine: string | null;
  grades: PartState<{
    bars: Array<{ grade: number; count: number }>;
    graded: number;
    changed: string | null;
    strongest: GradeEntry[];
    weakest: GradeEntry[];
  }>;
  themes: PartState<{ list: Array<{ title: string; part: string | null; from: string; detail: string }> }>;
  hands: PartState<Record<string, never>> | { state: "none" };
  /** Every row of Might need a hand: the site's facts and Claude's picks together. */
  rows: HandRow[];
  /** How many to read each way under the chart. */
  readCount: number;
};

/** How many answers each "Read the strongest" and "Read the weakest" lists. */
export const READ_EACH_WAY = 6;

/** "Mon 23 Nov, 9:12am", in the house clock. */
export function whenWords(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

export type ViewInput = {
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  groups: ReadonlyArray<{ id: string; name: string; met: boolean; facilitatorUids: readonly string[] }>;
  firstAt: Date | null;
  reviewable: boolean;
  claude: boolean;
  inputs: ReviewInputs;
  stored: CourseWeekReviewDoc | null;
  /** The people holding a place now who are reviewed, by account: never a facilitator. */
  fellowNames: ReadonlyMap<string, string>;
  groupOf: ReadonlyMap<string, string>;
  /** The written questions, in order, by key: for "Written answer 2". */
  writtenKeys: readonly string[];
  /** The week's parts' titles, by id. */
  partTitles: ReadonlyMap<string, string>;
  facts: ReadonlyMap<string, FactLine[]>;
  askedFor: ReadonlyMap<string, Date | null>;
  firstNameOf: ReadonlyMap<string, string>;
  /** The programme's page, `/admin/admissions/forms/<round>/programmes/<programme>`. */
  programmePath: string;
};

const FACT_SOURCES: Record<FactLine["source"], string> = {
  register: REVIEW_WORDS.fromRegister,
  week: REVIEW_WORDS.fromWeek,
  report: REVIEW_WORDS.fromReport,
};

/** The name a sentence uses for somebody: the first word of their name. */
const firstWord = (name: string) => name.trim().split(/\s+/)[0] || name;

export function weekReviewView(input: ViewInput): WeekReviewView {
  const groupName = new Map(input.groups.map((group) => [group.id, group.name.trim() || "Untitled group"]));
  const groupOfName = (uid: string) => {
    const groupId = input.groupOf.get(uid);
    return groupId ? (groupName.get(groupId) ?? "") : "";
  };
  const namesOf = (labels: Readonly<Record<string, string>>) => {
    const out: Record<string, string> = {};
    for (const [label, uid] of Object.entries(labels)) {
      const name = input.fellowNames.get(uid);
      if (name) out[label] = name;
    }
    return out;
  };
  const groupsOf = (labels: Readonly<Record<string, string>>) => {
    const out: Record<string, string> = {};
    for (const [label, groupId] of Object.entries(labels)) {
      const name = groupName.get(groupId);
      if (name) out[label] = name;
    }
    return out;
  };
  const stored = input.stored;
  const met = input.groups.filter((group) => group.met).length;
  const counts = input.inputs.counts;
  const nothing = counts.written + counts.reflections + counts.checkIns + counts.reports === 0;

  // ---- Draft grades -----------------------------------------------------
  let grades: WeekReviewView["grades"] = { state: "none" };
  if (stored?.grades?.state === "failed") grades = { state: "failed", reason: stored.grades.reason };
  else if (stored?.grades?.state === "ready") {
    const current = stored.grades.items.filter(
      (item) => input.fellowNames.has(item.uid) && input.inputs.hashOfRow.get(item.rowId) === item.hash,
    );
    const changed = stored.grades.items.filter((item) => input.fellowNames.has(item.uid)).length - current.length;
    const bars = Array.from({ length: 10 }, (_, index) => {
      const grade = 10 - index;
      return { grade, count: current.filter((item) => item.grade === grade).length };
    });
    const entry = (item: StoredGrade): GradeEntry => {
      const groupId = input.groupOf.get(item.uid) ?? "";
      const at = input.writtenKeys.indexOf(item.questionKey);
      const query = new URLSearchParams({ week: String(input.weekNumber), person: item.uid });
      if (groupId) query.set("group", groupId);
      return {
        key: item.rowId,
        name: input.fellowNames.get(item.uid) ?? "",
        group: groupOfName(item.uid),
        question: input.writtenKeys.length > 1 && at !== -1 ? `Written answer ${at + 1}` : null,
        grade: item.grade,
        href: `${input.programmePath}/written?${query.toString()}`,
      };
    };
    const byName = (a: StoredGrade, b: StoredGrade) =>
      (input.fellowNames.get(a.uid) ?? "").localeCompare(input.fellowNames.get(b.uid) ?? "", "en-GB") || a.rowId.localeCompare(b.rowId);
    grades = {
      state: "ready",
      outOfDate: stored.grades.fingerprint !== input.inputs.grades.fingerprint,
      bars,
      graded: current.length,
      changed: changed > 0 ? REVIEW_WORDS.gradesChanged(changed) : null,
      strongest: [...current].sort((a, b) => b.grade - a.grade || byName(a, b)).slice(0, READ_EACH_WAY).map(entry),
      weakest: [...current].sort((a, b) => a.grade - b.grade || byName(a, b)).slice(0, READ_EACH_WAY).map(entry),
    };
  }

  // ---- What people found hard --------------------------------------------
  let themes: WeekReviewView["themes"] = { state: "none" };
  if (stored?.themes?.state === "failed") themes = { state: "failed", reason: stored.themes.reason };
  else if (stored?.themes?.state === "ready") {
    const groupsNow = groupsOf(stored.themes.groupLabels);
    themes = {
      state: "ready",
      outOfDate: stored.themes.fingerprint !== input.inputs.themes.fingerprint,
      list: stored.themes.list.map((theme) => {
        const answers = theme.answers.filter((answer) => input.fellowNames.has(answer.uid)).length;
        const groups = theme.groupIds.map((groupId) => groupName.get(groupId)).filter((name): name is string => !!name);
        const part = theme.partId ? (input.partTitles.get(theme.partId) ?? null) : null;
        return {
          title: withNamesBack(theme.title, {}, groupsNow),
          part: part ? REVIEW_WORDS.themePart(part) : null,
          from: REVIEW_WORDS.themeFrom(REVIEW_WORDS.themeCounts(answers, theme.checkIns, theme.reports), listWords(groups)),
          detail: withNamesBack(theme.detail, {}, groupsNow),
        };
      }),
    };
  }

  // ---- Might need a hand --------------------------------------------------
  const lines = new Map<string, HandLine[]>();
  for (const [uid, facts] of input.facts) {
    if (!input.fellowNames.has(uid)) continue;
    lines.set(uid, facts.map((fact) => ({ text: fact.text, source: FACT_SOURCES[fact.source] })));
  }
  let hands: WeekReviewView["hands"] = { state: "none" };
  if (stored?.hands?.state === "failed") hands = { state: "failed", reason: stored.hands.reason };
  else if (stored?.hands?.state === "ready") {
    hands = { state: "ready", outOfDate: stored.hands.fingerprint !== input.inputs.hands.fingerprint };
    const fellows = namesOf(stored.hands.labels);
    const groupsNow = groupsOf(stored.hands.groupLabels);
    for (const hand of stored.hands.list) {
      if (!input.fellowNames.has(hand.uid)) continue;
      const source =
        hand.answers > 0 && hand.reports > 0
          ? REVIEW_WORDS.fromClaudeBoth
          : hand.reports > 0
            ? REVIEW_WORDS.fromClaudeReports
            : REVIEW_WORDS.fromClaudeAnswers;
      lines.set(hand.uid, [...(lines.get(hand.uid) ?? []), { text: withNamesBack(hand.why, fellows, groupsNow), source }]);
    }
  }
  const facilitatorsOf = new Map(input.groups.map((group) => [group.id, group.facilitatorUids]));
  const rows: HandRow[] = [...lines]
    .filter(([, list]) => list.length > 0)
    .map(([uid, list]) => {
      const name = input.fellowNames.get(uid) ?? "";
      const groupId = input.groupOf.get(uid);
      const facilitators = (groupId ? (facilitatorsOf.get(groupId) ?? []) : [])
        .map((each) => input.firstNameOf.get(each))
        .filter((each): each is string => !!each);
      const asked = input.askedFor.has(uid) ? input.askedFor.get(uid) ?? null : undefined;
      return {
        uid,
        name,
        group: groupOfName(uid),
        lines: list,
        ask: facilitators.length > 0 ? REVIEW_WORDS.ask(listWords(facilitators), firstWord(name)) : null,
        asked: asked === undefined ? null : REVIEW_WORDS.asked(asked ? londonDayLabel(asked) : "this week"),
        page: `${input.programmePath}/coursework/${encodeURIComponent(uid)}`,
      };
    })
    .sort((a, b) => b.lines.length - a.lines.length || a.name.localeCompare(b.name, "en-GB") || a.uid.localeCompare(b.uid));

  const times = [stored?.grades?.at, stored?.themes?.at, stored?.hands?.at].filter((at): at is Date => at instanceof Date);
  const latest = times.length > 0 ? new Date(Math.max(...times.map((at) => at.getTime()))) : null;
  return {
    weekId: input.weekId,
    weekNumber: input.weekNumber,
    weekTitle: input.weekTitle,
    groupsLine: REVIEW_WORDS.groupsMet(met, input.groups.length),
    firstDay: input.firstAt ? londonDayLabel(input.firstAt) : null,
    claude: input.claude,
    reviewable: input.reviewable,
    sending: {
      counts: REVIEW_WORDS.counts(counts.written, counts.reflections, counts.checkIns, counts.reports),
      leftOut: counts.leftOut > 0 ? REVIEW_WORDS.notIncluded(counts.leftOut) : null,
      nothing,
      seen: input.inputs.seen,
    },
    askedLine: latest ? REVIEW_WORDS.askedAt(whenWords(latest)) : null,
    grades,
    themes,
    hands,
    rows,
    readCount: READ_EACH_WAY,
  };
}
