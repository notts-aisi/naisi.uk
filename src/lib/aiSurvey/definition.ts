/**
 * Reading the AI at Nottingham survey's definition: filling its values in,
 * walking its pages, and naming the export's columns.
 *
 * Pure, with no server-only import, so the pages, the routes and the tests all
 * read the survey through the same functions. The words themselves are in
 * src/content/aiSurvey/definition.ts.
 */
import { AI_SURVEY } from "@/content/aiSurvey/definition";
import type {
  AiSurveyDefinition,
  AiSurveyLines,
  AiSurveyOption,
  AiSurveyPage,
  AiSurveyQuestion,
  AiSurveyValues,
} from "./types";

export { AI_SURVEY };

/** The group whose pages are shown in a random order for each person. */
export const PROPOSALS_GROUP = "proposals";

/**
 * Replace each `{name}` with its value. A name with no value is LEFT AS IT IS
 * rather than dropped, so a sentence that still shows a curly bracket is seen
 * and fixed, never silently shortened.
 */
export function fill(text: string, values: Record<string, string | number | boolean | null | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === null || value === undefined || value === "" ? whole : String(value);
  });
}

/** `fill` against the survey's own `values` block, with extras for `{n}`, `{total}` and `{code}`. */
export function fillValues(
  text: string,
  extra: Record<string, string | number> = {},
  def: AiSurveyDefinition = AI_SURVEY,
): string {
  return fill(text, { ...def.values, ...extra });
}

/** The values that must be set before the survey can open and are not. */
export function missingBeforeOpening(def: AiSurveyDefinition = AI_SURVEY): (keyof AiSurveyValues)[] {
  return def.mustBeSetBeforeOpening.filter((key) => {
    const value = def.values[key];
    return value === null || value === undefined || value === "";
  });
}

/**
 * The instant the survey closes. `closesAt` is a wall-clock time in London,
 * and the survey closes in late November, so London is on GMT and the wall
 * clock IS the UTC time. The offset is still worked out rather than assumed,
 * so a later survey that closes in summer is not an hour out.
 */
export function closesAtInstant(def: AiSurveyDefinition = AI_SURVEY): Date {
  const [datePart, timePart] = def.values.closesAt.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  // The end of the named minute: "23:59" closes as the clock leaves 23:59.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute + 1, 0);
  return new Date(asUtc - zoneOffsetMs(new Date(asUtc), def.values.timezone));
}

/** How far `timeZone` is ahead of UTC at `at`, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

export function findPage(pageId: string, def: AiSurveyDefinition = AI_SURVEY): AiSurveyPage | null {
  return def.pages.find((p) => p.id === pageId) ?? null;
}

/** The ids of the pages in the proposals group, in the order the definition lists them. */
export function proposalPageIds(def: AiSurveyDefinition = AI_SURVEY): string[] {
  return def.pages.filter((p) => p.group === PROPOSALS_GROUP).map((p) => p.id);
}

/** True when `order` is exactly the proposal pages, each once, in any order. */
export function isProposalOrder(order: unknown, def: AiSurveyDefinition = AI_SURVEY): order is string[] {
  const ids = proposalPageIds(def);
  return (
    Array.isArray(order) &&
    order.length === ids.length &&
    new Set(order).size === ids.length &&
    order.every((id) => typeof id === "string" && ids.includes(id))
  );
}

/**
 * The page ids in the order ONE person sees them: the definition's order, with
 * the proposal pages replaced, where they sit, by that person's order of them.
 */
export function pageSequence(proposalOrder: string[], def: AiSurveyDefinition = AI_SURVEY): string[] {
  const sequence: string[] = [];
  let placed = false;
  for (const page of def.pages) {
    if (page.group === PROPOSALS_GROUP) {
      if (!placed) sequence.push(...proposalOrder);
      placed = true;
    } else {
      sequence.push(page.id);
    }
  }
  return sequence;
}

/** The lines question a "rank your top three" question draws its lines from. */
export function linesFor(page: AiSurveyPage, linesFrom: string): AiSurveyLines | null {
  const found = page.questions.find((q) => q.id === linesFrom);
  return found && found.type === "lines" ? found : null;
}

export function selectOptions(question: Extract<AiSurveyQuestion, { type: "select" }>): AiSurveyOption[] {
  return [...question.optionGroups.flatMap((g) => g.options), ...(question.extraOptions ?? [])];
}

/** What one column of the export holds, so the export never has to guess from a name. */
export type AiSurveyColumn =
  | { name: string; pageId: string; kind: "value"; code: string }
  | { name: string; pageId: string; kind: "multiOption"; code: string; optionId: string }
  | { name: string; pageId: string; kind: "rankPlace"; code: string; place: number }
  | { name: string; pageId: string; kind: "tick"; code: string };

/**
 * The export's answer columns, in the DEFINITION's order (never a person's
 * shuffled order): one per question, one per line of a lines question, one
 * per option of a multi-choice question, named like `B2_explain`, and one per
 * place of a ranking, named like `M1_1` for the first choice.
 */
export function answerColumns(def: AiSurveyDefinition = AI_SURVEY): AiSurveyColumn[] {
  const columns: AiSurveyColumn[] = [];
  for (const page of def.pages) {
    for (const question of page.questions) {
      if (question.type === "lines") {
        for (const line of question.lines) columns.push({ name: line.id, pageId: page.id, kind: "value", code: line.id });
      } else if (question.type === "multi") {
        for (const option of question.options) {
          columns.push({
            name: `${question.id}_${option.id}`,
            pageId: page.id,
            kind: "multiOption",
            code: question.id,
            optionId: option.id,
          });
        }
      } else if (question.type === "rank") {
        for (let place = 1; place <= question.places; place++) {
          columns.push({ name: `${question.id}_${place}`, pageId: page.id, kind: "rankPlace", code: question.id, place });
        }
      } else if (question.type === "tick") {
        columns.push({ name: question.id, pageId: page.id, kind: "tick", code: question.id });
      } else {
        columns.push({ name: question.id, pageId: page.id, kind: "value", code: question.id });
      }
    }
  }
  return columns;
}

/**
 * Every code an answer may be stored under on one page, with the answers it
 * may hold. The save route checks a page against this and refuses anything
 * else, so nothing but the survey's own codes and answers is ever stored.
 */
export type AiSurveyCodeRule =
  | { kind: "oneOf"; allowed: string[] }
  | { kind: "anyOf"; allowed: string[]; exclusive: string[] }
  | { kind: "ranked"; allowed: string[]; places: number; alone: string[] }
  | { kind: "text"; maxLength: number; showIf?: { code: string; is: string } }
  | { kind: "tick" };

export function codeRules(page: AiSurveyPage, def: AiSurveyDefinition = AI_SURVEY): Map<string, AiSurveyCodeRule> {
  const rules = new Map<string, AiSurveyCodeRule>();
  for (const question of page.questions) {
    switch (question.type) {
      case "single":
        rules.set(question.id, { kind: "oneOf", allowed: question.options.map((o) => o.id) });
        break;
      case "select":
        rules.set(question.id, { kind: "oneOf", allowed: selectOptions(question).map((o) => o.id) });
        break;
      case "multi":
        rules.set(question.id, {
          kind: "anyOf",
          allowed: question.options.map((o) => o.id),
          exclusive: question.options.filter((o) => o.exclusive).map((o) => o.id),
        });
        break;
      case "lines": {
        const allowed = (def.scales[question.scale] ?? []).map((a) => a.id);
        for (const line of question.lines) rules.set(line.id, { kind: "oneOf", allowed });
        break;
      }
      case "rank": {
        const source = linesFor(page, question.linesFrom);
        rules.set(question.id, {
          kind: "ranked",
          allowed: source?.lines.map((l) => l.id) ?? [],
          places: question.places,
          alone: question.extraOptions.map((o) => o.id),
        });
        break;
      }
      case "text":
        rules.set(question.id, { kind: "text", maxLength: question.maxLength, showIf: question.showIf });
        break;
      case "tick":
        rules.set(question.id, { kind: "tick" });
        break;
    }
  }
  return rules;
}
