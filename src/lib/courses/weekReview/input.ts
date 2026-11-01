import { fingerprintOf, scrubNames, type NameToLabel } from "@/lib/courses/coursework/input";
import { cameAfter } from "@/lib/legal/courseworkUse";

/**
 * WHAT LEAVES THE SITE WHEN AN ADMIN PRESSES "REVIEW WITH CLAUDE" ON A WEEK
 * (privacy v15, "AI-assisted review"; docs/courses-ops.md, "The week
 * review"). Three requests, each built here from what `gather.ts` read, and
 * each carrying only what its question needs:
 *
 *  - DRAFT GRADES: the week's written answers, each by an item id ("A12")
 *    and nothing else: no person, no group. Claude grades each answer on its
 *    own.
 *  - WHAT PEOPLE FOUND HARD: the answers and reflections by item id and the
 *    writer's group ("A12 · Q2 · Group 3"); the CHECK-INS POOLED BY GROUP,
 *    each a number within the pool ("C4") and never anybody's; and the
 *    facilitators' reports by number, their words only. No label for any
 *    person anywhere in it, so no check-in can sit beside one.
 *  - WHO MIGHT NEED A HAND: the answers and reflections by fellow ("Fellow 3
 *    · Group 3"), and the reports with the people they pick as labels. NEVER
 *    A CHECK-IN: the policy says nothing said in a survey affects a place,
 *    and check-ins go to Claude for what people found hard and nothing else.
 *
 * THE MOMENT. Version 15 is what tells people their survey answers, the
 * session reports about them and their work may go to Claude for this, so
 * each counts only from the moment that person agreed to version 15
 * (`reviewUseFrom`), and work also only once it counts under version 13 (a
 * `counted` row). A piece of work first written before its writer's moment, a
 * check-in sent before its sender's, a report sent before its writer's, are
 * left out and counted ("N not included yet"). A report's line about
 * somebody, or their name typed into anybody's words, stays only when THAT
 * person's moment came before it was written; otherwise the line goes and
 * the name becomes "someone in the group".
 *
 * NO NAME, ADDRESS OR ACCOUNT ID. Every name of everybody on the run, of the
 * programme's lead and of every admin is swapped out (`scrubNames`): a
 * fellow's for their label where the hands request may name them and "a
 * fellow" elsewhere, a facilitator's for "a facilitator", and the people
 * running the programme for "someone running the programme". Groups are
 * "Group N" in meeting order (a group may be named after its facilitator).
 *
 * Pure: the tests build every message from fixtures holding names, addresses
 * and account ids and read every line that would go.
 */

export type ReviewWorkKind = "written" | "reflection";

/** One question of the week, as the run's copy asks it. */
export type ReviewQuestion = { key: string; kind: ReviewWorkKind; text: string };

/** A part of the week, by its own id (kept in every group's copy) and title. */
export type ReviewWeekPart = { id: string; title: string };

/** One answer or reflection, as read, before the moment is asked. */
export type ReviewWork = {
  rowId: string;
  uid: string;
  kind: ReviewWorkKind;
  questionKey: string;
  text: string;
  /** Written after its writer's version 13 moment (`gather.ts` marks it). */
  counted: boolean;
  firstWrittenAt: Date | null;
};

/** One check-in, pooled: its group and its answers, and never whose it is. */
export type ReviewCheckIn = {
  groupId: string;
  useful: number | null;
  confident: number | null;
  /** "None", "Some", "Most" or "All", or null when not asked. */
  reading: string | null;
  /** The parts named unclear, by id; `SOMETHING_ELSE_ID` for "Something else". */
  unclear: string[];
  most: string;
  better: string;
};

/** The id a check-in's and a report's "Something else" read as here. */
export const SOMETHING_ELSE_ID = "__something_else__";

/** One facilitator's report on a session of this week, as read. */
export type ReviewReport = {
  groupId: string;
  occurrence: number;
  /** When it was last sent: the moment its lines about people are weighed against. */
  at: Date | null;
  how: number | null;
  wentWell: string;
  didnt: string;
  unclear: string[];
  forLead: string;
  engaged: Array<{ uid: string; note: string }>;
  notRead: string[];
  needsHand: Array<{ uid: string; note: string }>;
};

/** Somebody whose name may be typed into somebody's words. */
export type ReviewPerson = { uid: string; name: string; role: "fellow" | "facilitator" | "staff" };

/** Everything the three requests are built from, as `gather.ts` read it. */
export type ReviewSources = {
  programme: string;
  weekNumber: number;
  weekTitle: string;
  questions: ReviewQuestion[];
  parts: ReviewWeekPart[];
  /** The run's live groups, in meeting order. */
  groupIds: string[];
  /** The people holding a place who may be reviewed: never a facilitator. */
  fellows: ReadonlySet<string>;
  /** Each fellow's live group. */
  groupOf: ReadonlyMap<string, string>;
  /** Each account's version 15 moment, or null. */
  momentOf: ReadonlyMap<string, Date | null>;
  work: ReviewWork[];
  /** Check-ins already held to their senders' moments (`poolWeekCheckIns`). */
  checkIns: ReviewCheckIn[];
  /** How many check-ins were left out for their senders' moments. */
  checkInsLeftOut: number;
  /** Reports already held to their writers' moments. */
  reports: ReviewReport[];
  reportsLeftOut: number;
  /** Every name on the run, the programme's lead and the admins. */
  people: ReviewPerson[];
};

/** One graded item, as sent: whose answer, which row, to which question, and a hash of its words. */
export type GradeItem = { uid: string; rowId: string; questionKey: string; hash: string };

export type GradesInput = {
  message: string;
  fingerprint: string;
  sent: number;
  /** "A12" to the answer it stands for. */
  items: Map<string, GradeItem>;
};

export type ThemesInput = {
  message: string;
  fingerprint: string;
  sent: { answers: number; reflections: number; checkIns: number; reports: number };
  /** "A12" to the answer and its writer's group. */
  answers: Map<string, { uid: string; rowId: string; groupId: string | null }>;
  /** "C4" to its group. */
  checkIns: Map<string, string>;
  /** "R2" to its group. */
  reports: Map<string, string>;
  /** "P2" to the part's id. */
  parts: Map<string, string>;
  /** "Group 3" to the group's id. */
  groupLabels: Record<string, string>;
  /** Every check-in's own words as sent, so the checker can tell a quotation. */
  checkInWords: string[];
};

export type HandsInput = {
  message: string;
  fingerprint: string;
  sent: { answers: number; reflections: number; reports: number };
  /** "Fellow 3" to the account. */
  labels: Record<string, string>;
  groupLabels: Record<string, string>;
  /** "A12" to its writer. */
  answers: Map<string, string>;
  /** "R2" to what was sent of it, so the checker can tell whom it speaks of. */
  reports: Map<string, string>;
};

export type ReviewInputs = {
  grades: GradesInput;
  themes: ThemesInput;
  hands: HandsInput;
  /** What the page says would be sent, and what is not included yet. */
  counts: { written: number; reflections: number; checkIns: number; reports: number; leftOut: number };
  /** A hash of all three messages: the page hands it to the press, and a press whose page saw something else is refused. */
  seen: string;
  /** Each answer that may be sent, by row, with a hash of its words: what tells a grade it is out of date. */
  hashOfRow: Map<string, string>;
};

const KIND_WORDS: Record<ReviewWorkKind, string> = { written: "Written answer", reflection: "Reflection" };

const READING_WORDS = new Set(["None", "Some", "Most", "All"]);

/** A whole line of somebody's words, or "" for nothing. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** An order that says nothing about anybody: by a hash of a key, then the key. */
function hashOrder<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => fingerprintOf(keyOf(a)).localeCompare(fingerprintOf(keyOf(b))) || keyOf(a).localeCompare(keyOf(b)));
}

/** Whether a piece of work may be sent: counted under version 13, and first written after its writer's version 15 moment. */
export function workMayGo(work: Pick<ReviewWork, "uid" | "counted" | "firstWrittenAt">, momentOf: ReadonlyMap<string, Date | null>): boolean {
  return work.counted && cameAfter(work.firstWrittenAt, momentOf.get(work.uid) ?? null);
}

/** Whether a line about somebody, written at `at`, may name them: their version 15 moment came before it. */
export function lineMayName(uid: string, at: Date | null, momentOf: ReadonlyMap<string, Date | null>): boolean {
  return cameAfter(at, momentOf.get(uid) ?? null);
}

/** The names every message scrubs, each with the words it becomes. `fellowAs` decides a fellow's. */
function scrubList(people: readonly ReviewPerson[], fellowAs: (uid: string) => string): NameToLabel[] {
  return people.map((person) => ({
    name: person.name,
    label: person.role === "fellow" ? fellowAs(person.uid) : person.role === "facilitator" ? "a facilitator" : "someone running the programme",
  }));
}

/**
 * THE THREE REQUESTS' MESSAGES, and what each label stands for. One label
 * map for the whole press: groups by meeting order, fellows by account order
 * among those with a version 15 moment, answers and check-ins in an order of
 * hashes, so the order says nothing.
 */
export function reviewInputs(sources: ReviewSources): ReviewInputs {
  const { momentOf } = sources;
  const groupLabelOf = new Map(sources.groupIds.map((groupId, index) => [groupId, `Group ${index + 1}`]));
  const groupLabels = Object.fromEntries([...groupLabelOf].map(([groupId, label]) => [label, groupId]));
  const groupWords = (groupId: string | null | undefined) => (groupId ? (groupLabelOf.get(groupId) ?? "no group") : "no group");

  // Fellows who may ever be named to Claude: those with a version 15 moment.
  const labelled = [...sources.fellows].filter((uid) => (momentOf.get(uid) ?? null) !== null).sort();
  const labelOf = new Map(labelled.map((uid, index) => [uid, `Fellow ${index + 1}`]));
  const labels = Object.fromEntries([...labelOf].map(([uid, label]) => [label, uid]));

  // Generic names, for the grades and the themes: nobody is a label there.
  const generic = scrubList(sources.people, () => "a fellow");
  // Names in something written at `at`, for the hands: a fellow becomes
  // their label only when their moment came before it.
  const namedAt = (at: Date | null) =>
    scrubList(sources.people, (uid) => (labelOf.has(uid) && lineMayName(uid, at, momentOf) ? (labelOf.get(uid) as string) : "someone in the group"));

  const questionKeys = new Map(sources.questions.map((question, index) => [question.key, index]));
  const questionLabel = (key: string) => `Q${(questionKeys.get(key) ?? 0) + 1}`;
  const partLabelOf = new Map(sources.parts.map((part, index) => [part.id, `P${index + 1}`]));
  const parts = new Map([...partLabelOf].map(([id, label]) => [label, id]));
  const partTitle = new Map(sources.parts.map((part) => [part.id, part.title]));

  // ---- Work: what may go, and in which order -------------------------------
  const fellowsWork = sources.work.filter((work) => sources.fellows.has(work.uid) && questionKeys.has(work.questionKey) && work.text.trim());
  const going = fellowsWork.filter((work) => workMayGo(work, momentOf));
  const workLeftOut = fellowsWork.length - going.length;
  const ordered = [...going].sort((a, b) => (questionKeys.get(a.questionKey) ?? 0) - (questionKeys.get(b.questionKey) ?? 0));
  const byQuestion = sources.questions.map((question) => hashOrder(ordered.filter((work) => work.questionKey === question.key), (work) => work.rowId));
  const workIds = new Map<string, string>();
  byQuestion.flat().forEach((work, index) => workIds.set(work.rowId, `A${index + 1}`));
  const hashOfRow = new Map(going.map((work) => [work.rowId, fingerprintOf(work.text)]));

  const head = (people: readonly NameToLabel[]) => [
    `# The programme: ${scrubNames(sources.programme, people)}`,
    `# Week ${sources.weekNumber}: ${scrubNames(sources.weekTitle, people)}`,
  ];
  const questionLines = (people: readonly NameToLabel[], kinds: readonly ReviewWorkKind[]) =>
    sources.questions
      .filter((question) => kinds.includes(question.kind))
      .map((question) => `${questionLabel(question.key)}. ${KIND_WORDS[question.kind]}: ${scrubNames(question.text, people)}`);
  const unclearWords = (ids: readonly string[], asLabels: boolean) =>
    ids
      .map((id) => (id === SOMETHING_ELSE_ID ? "something else" : asLabels ? partLabelOf.get(id) : partTitle.get(id)))
      .filter((words): words is string => typeof words === "string" && words.length > 0);

  // ---- 1. Draft grades -------------------------------------------------------
  const gradeItems = new Map<string, GradeItem>();
  const grades: string[] = [...head(generic)];
  grades.push('Each answer has an id ("A12"). Give every answer a draft grade.');
  sources.questions.forEach((question, index) => {
    if (question.kind !== "written") return;
    const answers = byQuestion[index];
    if (answers.length === 0) return;
    grades.push("", `## ${questionLabel(question.key)}. ${KIND_WORDS[question.kind]}: ${scrubNames(question.text, generic)}`);
    for (const work of answers) {
      const id = workIds.get(work.rowId) as string;
      gradeItems.set(id, { uid: work.uid, rowId: work.rowId, questionKey: work.questionKey, hash: hashOfRow.get(work.rowId) as string });
      grades.push("", `### ${id}`, scrubNames(work.text, generic));
    }
  });
  const gradesMessage = grades.join("\n");

  // ---- 2. What people found hard ------------------------------------------
  const themeAnswers = new Map<string, { uid: string; rowId: string; groupId: string | null }>();
  const themes: string[] = [...head(generic)];
  if (sources.parts.length > 0) {
    themes.push("", "## The week's parts", ...sources.parts.map((part) => `${partLabelOf.get(part.id)}. ${scrubNames(part.title, generic)}`));
  }
  themes.push("", "## The questions", ...questionLines(generic, ["reflection", "written"]));
  const workLines: string[] = [];
  for (const work of byQuestion.flat()) {
    const id = workIds.get(work.rowId) as string;
    const groupId = sources.groupOf.get(work.uid) ?? null;
    themeAnswers.set(id, { uid: work.uid, rowId: work.rowId, groupId });
    workLines.push("", `### ${id} · ${questionLabel(work.questionKey)} · ${groupWords(groupId)}`, scrubNames(work.text, generic));
  }
  if (workLines.length > 0) {
    themes.push("", "## Answers and reflections", "Each is labelled with its id, the question it answers and its writer's group.", ...workLines);
  }
  const checkInIds = new Map<string, string>();
  const checkInWords: string[] = [];
  const pooled = sources.groupIds.flatMap((groupId) =>
    hashOrder(
      sources.checkIns.filter((checkIn) => checkIn.groupId === groupId),
      (checkIn) => JSON.stringify(checkIn),
    ),
  );
  if (pooled.length > 0) {
    themes.push(
      "",
      "## Check-ins, pooled by group",
      "Each check-in is somebody's answers at the end of their group's session this week, with no name and no number for the person, on purpose.",
    );
    let current = "";
    pooled.forEach((checkIn, index) => {
      const id = `C${index + 1}`;
      checkInIds.set(id, checkIn.groupId);
      if (checkIn.groupId !== current) {
        current = checkIn.groupId;
        themes.push("", `### ${groupWords(checkIn.groupId)}`);
      }
      const most = oneLine(scrubNames(checkIn.most, generic));
      const better = oneLine(scrubNames(checkIn.better, generic));
      checkInWords.push(most, better);
      const said = [
        checkIn.useful !== null ? `How useful: ${checkIn.useful} of 5.` : "",
        checkIn.confident !== null ? `How confident now: ${checkIn.confident} of 5.` : "",
        checkIn.reading && READING_WORDS.has(checkIn.reading) ? `Reading done: ${checkIn.reading}.` : "",
        checkIn.unclear.length > 0 ? `Unclear: ${unclearWords(checkIn.unclear, true).join(", ") || "nothing named"}.` : "Unclear: nothing.",
        most ? `Most useful: ${most}` : "",
        better ? `Could have gone better: ${better}` : "",
      ].filter(Boolean);
      themes.push(`${id}. ${said.join(" ")}`);
    });
  }
  const reportIds = new Map<string, string>();
  const reportsOrdered = sources.groupIds.flatMap((groupId) =>
    sources.reports.filter((report) => report.groupId === groupId).sort((a, b) => a.occurrence - b.occurrence),
  );
  if (reportsOrdered.length > 0) {
    themes.push("", "## Facilitators' reports", "Each is what a group's facilitator wrote after its session this week.");
    reportsOrdered.forEach((report, index) => {
      const id = `R${index + 1}`;
      reportIds.set(id, report.groupId);
      themes.push("", `### ${id} · ${groupWords(report.groupId)}`, ...reportLines(report, generic, unclearWords(report.unclear, true)));
    });
  }
  const themesMessage = themes.join("\n");

  // ---- 3. Who might need a hand -------------------------------------------
  const handAnswers = new Map<string, string>();
  const handReports = new Map<string, string>();
  const hands: string[] = [...head(generic)];
  hands.push("", "## The questions", ...questionLines(generic, ["reflection", "written"]));
  const handWork: string[] = [];
  const handSent = { answers: 0, reflections: 0 };
  for (const work of byQuestion.flat()) {
    const id = workIds.get(work.rowId) as string;
    const label = labelOf.get(work.uid);
    if (!label) continue;
    handAnswers.set(id, work.uid);
    if (work.kind === "written") handSent.answers += 1;
    else handSent.reflections += 1;
    handWork.push(
      "",
      `### ${id} · ${label} · ${groupWords(sources.groupOf.get(work.uid))} · ${questionLabel(work.questionKey)}`,
      scrubNames(work.text, namedAt(work.firstWrittenAt)),
    );
  }
  if (handWork.length > 0) {
    hands.push("", "## Answers and reflections, by fellow", 'Each is labelled with its id, the fellow who wrote it ("Fellow 3", the same fellow everywhere) and their group.', ...handWork);
  }
  if (reportsOrdered.length > 0) {
    hands.push("", "## Facilitators' reports", "Each is what a group's facilitator wrote after its session this week.");
    reportsOrdered.forEach((report, index) => {
      const id = `R${index + 1}`;
      const people = namedAt(report.at);
      // A line about somebody stays only when their moment came before the report.
      const named = (uid: string) => (sources.fellows.has(uid) && labelOf.has(uid) && lineMayName(uid, report.at, momentOf) ? labelOf.get(uid) : undefined);
      const engaged = report.engaged.flatMap((pick) => {
        const label = named(pick.uid);
        return label ? [pick.note.trim() ? `${label} (${oneLine(scrubNames(pick.note, people))})` : label] : [];
      });
      const notRead = report.notRead.flatMap((uid) => {
        const label = named(uid);
        return label ? [label] : [];
      });
      const needsHand = report.needsHand.flatMap((pick) => {
        const label = named(pick.uid);
        return label ? [pick.note.trim() ? `${label} (${oneLine(scrubNames(pick.note, people))})` : label] : [];
      });
      const block = [
        ...reportLines(report, people, unclearWords(report.unclear, false)),
        engaged.length > 0 ? `Engaged well: ${engaged.join("; ")}` : "",
        notRead.length > 0 ? `Seemed not to have done the readings: ${notRead.join(", ")}` : "",
        needsHand.length > 0 ? `Might need a hand: ${needsHand.join("; ")}` : "",
      ].filter(Boolean);
      handReports.set(id, block.join("\n"));
      hands.push("", `### ${id} · ${groupWords(report.groupId)}`, ...block);
    });
  }
  const handsMessage = hands.join("\n");

  const written = going.filter((work) => work.kind === "written").length;
  const reflections = going.length - written;
  return {
    grades: { message: gradesMessage, fingerprint: fingerprintOf(gradesMessage), sent: gradeItems.size, items: gradeItems },
    themes: {
      message: themesMessage,
      fingerprint: fingerprintOf(themesMessage),
      sent: { answers: written, reflections, checkIns: checkInIds.size, reports: reportIds.size },
      answers: themeAnswers,
      checkIns: checkInIds,
      reports: reportIds,
      parts,
      groupLabels,
      checkInWords: checkInWords.filter(Boolean),
    },
    hands: {
      message: handsMessage,
      fingerprint: fingerprintOf(handsMessage),
      sent: { ...handSent, reports: handReports.size },
      labels,
      groupLabels,
      answers: handAnswers,
      reports: handReports,
    },
    counts: {
      written,
      reflections,
      checkIns: checkInIds.size,
      reports: reportIds.size,
      leftOut: workLeftOut + sources.checkInsLeftOut + sources.reportsLeftOut,
    },
    seen: fingerprintOf([gradesMessage, themesMessage, handsMessage].join("\n\n=====\n\n")),
    hashOfRow,
  };
}

/** A report's own words, scrubbed: how it went and what was written, never who wrote it. */
function reportLines(report: ReviewReport, people: readonly NameToLabel[], unclear: readonly string[]): string[] {
  const said = (label: string, text: string) => {
    const line = oneLine(scrubNames(text, people));
    return line ? `${label}: ${line}` : "";
  };
  return [
    report.how !== null ? `How the session went: ${report.how} of 5.` : "",
    said("Went well", report.wentWell),
    said("Didn't go well", report.didnt),
    unclear.length > 0 ? `Seemed unclear: ${unclear.join(", ")}.` : "",
    said("For the programme's lead and admins", report.forLead),
  ].filter(Boolean);
}

/** Names back where Claude wrote "Fellow 3" or "Group 2", for the page. A label nobody holds reads "a fellow" or "a group". */
export function withNamesBack(
  text: string,
  fellows: Readonly<Record<string, string>>,
  groups: Readonly<Record<string, string>>,
): string {
  const has = (map: Readonly<Record<string, string>>, key: string) => Object.prototype.hasOwnProperty.call(map, key);
  return text
    .replace(/\bFellow (\d+)\b/g, (whole) => (has(fellows, whole) ? fellows[whole] : "a fellow"))
    .replace(/\bGroup (\d+)\b/g, (whole) => (has(groups, whole) ? groups[whole] : "a group"));
}
