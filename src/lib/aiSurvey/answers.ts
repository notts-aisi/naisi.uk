/**
 * Checking one saved page of the AI at Nottingham survey against the survey.
 *
 * The save route stores a page only after this has passed it: known codes,
 * known answers, the comment no longer than its limit. ANYTHING ELSE IS
 * REFUSED, not trimmed to fit, so a page that arrives with a code the survey
 * does not have is a bug or an attack and is never half-stored.
 *
 * Every question can be skipped. A skipped question is simply ABSENT from the
 * stored page: an empty string, an empty list and an unticked box are all
 * "skipped", and none of them is stored.
 */
import { codeRules, findPage, AI_SURVEY } from "./definition";
import type { AiSurveyDefinition, AiSurveyPageAnswers } from "./types";

export type PageCheck = { ok: true; answers: AiSurveyPageAnswers } | { ok: false; reason: string };

/** A hard ceiling on how many codes one page may carry, far above any real page. */
const MAX_KEYS = 64;

export function checkPageAnswers(pageId: unknown, raw: unknown, def: AiSurveyDefinition = AI_SURVEY): PageCheck {
  if (typeof pageId !== "string") return { ok: false, reason: "no page" };
  const page = findPage(pageId, def);
  if (!page) return { ok: false, reason: "unknown page" };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "answers are not a map" };

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_KEYS) return { ok: false, reason: "too many answers" };

  const rules = codeRules(page, def);
  const answers: AiSurveyPageAnswers = {};

  for (const [code, value] of entries) {
    const rule = rules.get(code);
    if (!rule) return { ok: false, reason: `unknown code on this page` };

    if (rule.kind === "oneOf") {
      if (value === "" || value === null || value === undefined) continue;
      if (typeof value !== "string" || !rule.allowed.includes(value)) return { ok: false, reason: "unknown answer" };
      answers[code] = value;
    } else if (rule.kind === "anyOf") {
      if (value === null || value === undefined) continue;
      if (!Array.isArray(value)) return { ok: false, reason: "a list was expected" };
      if (value.length === 0) continue;
      if (value.length > rule.allowed.length) return { ok: false, reason: "too many options" };
      if (!value.every((v) => typeof v === "string" && rule.allowed.includes(v))) {
        return { ok: false, reason: "unknown answer" };
      }
      if (new Set(value).size !== value.length) return { ok: false, reason: "an option twice" };
      // "None of these" beside another option contradicts itself. The page
      // clears the rest when it is ticked, so this only arrives from something
      // that is not the page.
      if (value.length > 1 && value.some((v) => rule.exclusive.includes(v as string))) {
        return { ok: false, reason: "an exclusive option beside another" };
      }
      // Stored in the survey's own order, never the order of ticking, so the
      // stored page says nothing about how it was filled in.
      answers[code] = rule.allowed.filter((id) => value.includes(id));
    } else if (rule.kind === "text") {
      if (value === null || value === undefined) continue;
      if (typeof value !== "string") return { ok: false, reason: "text was expected" };
      // Line endings counted as the browser's box counts them (one each).
      const text = value.replace(/\r\n/g, "\n").trim();
      if (text.length === 0) continue;
      if (text.length > rule.maxLength) return { ok: false, reason: "too long" };
      answers[code] = text;
    } else {
      if (value === null || value === undefined || value === false) continue;
      if (value !== true) return { ok: false, reason: "a tick was expected" };
      answers[code] = true;
    }
  }

  return { ok: true, answers };
}
