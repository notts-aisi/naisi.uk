/**
 * THE SURVEY AFTER AN EVENT, AS THE EVENT HOLDS IT: what the editor's Survey
 * after step chose, kept on `events/{id}.surveyAfter` and written with the
 * rest of the form (`eventMutations.ts` while the event is a draft).
 * Publishing sets the survey up from it (`src/lib/surveys/events/after.ts` is
 * the model in survey terms, `src/lib/surveys/events/setUp.ts` the writer).
 *
 * ONLY A STORED SETTING COUNTS. A new event is made with the defaults below,
 * so its survey is on unless its organiser switches it off; an event with no
 * `surveyAfter` (every event made before the step existed) has none, and
 * nothing reads a missing map as on. Read strictly: a value that is not one
 * the step writes reads as the quieter choice (off, no reminder, no code),
 * never as a send nobody chose.
 *
 * Pure, with no imports: the editor, the public pages' event reader and the
 * server all read an event through `normalizeEvent`, which calls this.
 */

/** Who the survey goes to: everyone who came (from check-in), or everyone with a place. */
export type SurveyAfterWho = "came" | "signups";

/**
 * When it goes: by itself 12 hours after the event ends (`standard`), by
 * itself a chosen number of whole hours after it ends (`after`), or only when
 * somebody sends it (`hand`).
 */
export type SurveyAfterWhen = "standard" | "after" | "hand";

export type StoredSurveyAfter = {
  /** "Ask people how it went". */
  on: boolean;
  /**
   * The questions as the step left them, read by survey code
   * (`sanitizeSurveyItems`), never here; null for the standard questions as
   * they are when the survey is set up.
   */
  items: unknown[] | null;
  who: SurveyAfterWho;
  /** Ask people who had a place but didn't come one question instead: what stopped them. */
  missed: boolean;
  when: SurveyAfterWhen;
  /** Whole hours after the event ends, for `after`. */
  hours: number;
  /** One reminder 3 days after it went, to people who haven't answered. */
  reminder: boolean;
  /** Show its QR code at the end of the event, on the Check-in tab. */
  showCode: boolean;
};

/** The hours a survey may go after its event ends: whole hours from 1 to 96, 12 by default. */
export const SURVEY_AFTER_HOURS = { min: 1, max: 96, standard: 12 } as const;

/** How long after it went its one reminder goes. */
export const SURVEY_REMINDER_DAYS = 3;

/** What a new event starts with: on, the standard questions, by itself 12 hours after it ends. */
export function newSurveyAfter(): StoredSurveyAfter {
  return {
    on: true,
    items: null,
    who: "came",
    missed: true,
    when: "standard",
    hours: SURVEY_AFTER_HOURS.standard,
    reminder: true,
    showCode: true,
  };
}

/** Whether a number of hours is one the step offers. */
export function isSurveyAfterHours(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SURVEY_AFTER_HOURS.min &&
    value <= SURVEY_AFTER_HOURS.max
  );
}

const isMap = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** An event's stored setting, or null when it has none. */
export function readSurveyAfter(raw: unknown): StoredSurveyAfter | null {
  if (!isMap(raw)) return null;
  return {
    on: raw.on === true,
    items: Array.isArray(raw.items) ? [...raw.items] : null,
    who: raw.who === "signups" ? "signups" : "came",
    missed: raw.missed === true,
    when: raw.when === "after" || raw.when === "hand" ? raw.when : "standard",
    hours: isSurveyAfterHours(raw.hours) ? raw.hours : SURVEY_AFTER_HOURS.standard,
    reminder: raw.reminder === true,
    showCode: raw.showCode === true,
  };
}

/** The hours after the event's end it goes by itself, or null when it goes only by hand. */
export function sendsAfterHours(setting: Pick<StoredSurveyAfter, "when" | "hours">): number | null {
  if (setting.when === "hand") return null;
  return setting.when === "after" ? setting.hours : SURVEY_AFTER_HOURS.standard;
}
