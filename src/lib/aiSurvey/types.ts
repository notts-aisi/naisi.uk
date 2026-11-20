/**
 * The shape of the AI at Nottingham survey's definition and of one answer set.
 *
 * The survey is built BESIDE the Surveys feature (src/lib/surveys) and shares
 * no record, route or type with it, so nothing here can move an existing
 * survey. The words students read live in one data module
 * (src/content/aiSurvey/definition.ts); the pages are a shell around it.
 *
 * Pure types, one small pure function and no imports, so client components,
 * server code and the test loader can all read this file.
 */

export type AiSurveyOption = {
  id: string;
  label: string;
  /** A multi-choice option that clears the others, drawn below a rule. */
  exclusive?: boolean;
};

export type AiSurveyScaleAnswer = {
  id: string;
  label: string;
  /**
   * "Don't know" and "Don't know enough" are answers OUTSIDE the scale. They
   * are stored as themselves, never as a sixth point, and left out of every
   * share and average.
   */
  outsideScale?: boolean;
};

export type AiSurveyLine = {
  id: string;
  text: string;
  /** A short name for results tables. Never shown to a student. */
  short?: string;
};

export type AiSurveySingle = { id: string; type: "single"; text: string; options: AiSurveyOption[] };
export type AiSurveyMulti = { id: string; type: "multi"; text: string; options: AiSurveyOption[] };
export type AiSurveySelect = {
  id: string;
  type: "select";
  text: string;
  help?: string;
  optionGroups: { label: string; options: AiSurveyOption[] }[];
  extraOptions?: AiSurveyOption[];
};
export type AiSurveyLines = {
  id: string;
  type: "lines";
  text: string | null;
  /** A key of the definition's `scales`. */
  scale: string;
  shuffle: boolean;
  lines: AiSurveyLine[];
};
/**
 * "Rank your top three": some of a page's lines, in order, most important
 * first. Stored as a list whose ORDER IS THE ANSWER, or as one of
 * `extraOptions` ("None of these") alone.
 */
export type AiSurveyRank = {
  id: string;
  type: "rank";
  text: string;
  /** The id of the `lines` question on the same page whose lines are offered. */
  linesFrom: string;
  /** How many can be ranked. */
  places: number;
  /** Answers that stand for the whole question, such as "None of these". */
  extraOptions: AiSurveyOption[];
};
export type AiSurveyText = {
  id: string;
  type: "text";
  text: string;
  help?: string;
  maxLength: number;
  /** Shown, and stored, only while another question on the page holds this answer. */
  showIf?: { code: string; is: string };
};
export type AiSurveyTick = { id: string; type: "tick"; text: string };

export type AiSurveyQuestion =
  | AiSurveySingle
  | AiSurveyMulti
  | AiSurveySelect
  | AiSurveyLines
  | AiSurveyRank
  | AiSurveyText
  | AiSurveyTick;

export type AiSurveyPage = {
  id: string;
  heading: string;
  intro?: string | null;
  /** Pages sharing a group are shown as one block, in a random order for each person. */
  group?: string;
  questions: AiSurveyQuestion[];
};

export type AiSurveyValues = {
  unionCoBadged: boolean;
  unionDataProtectionContact: string | null;
  /** A local date and time in `timezone`, written `YYYY-MM-DDTHH:mm`. */
  closesAt: string;
  closingDate: string;
  resultsBy: string;
  surveyAddress: string;
  noticeAddress: string;
  resultsPage: string;
  shortLink: string;
  newsletterLink: string;
  whoOpensAnswers: string;
  usedEmailListDays: number;
  answersYears: number;
  emailService: string | null;
  emailServiceRetention: string | null;
  botCheck: boolean;
  commentsGroupedWithClaude: boolean;
  showAiNote: boolean;
  timezone: string;
};

export type AiSurveyNoticeSection = {
  heading: string;
  body?: string | { ifUnionCoBadged: string; otherwise: string };
  table?: { columns: string[]; rows: string[][] };
  list?: string[];
  sentences?: { text: string; onlyIf?: keyof AiSurveyValues }[];
};

export type AiSurveyDefinition = {
  id: string;
  /**
   * Raised by any change to a QUESTION once the survey is open, and kept on
   * each answer set. Not raised for the words around the questions: see the
   * top of src/content/aiSurvey/definition.ts.
   */
  version: number;
  language: string;
  title: string;
  values: AiSurveyValues;
  mustBeSetBeforeOpening: (keyof AiSurveyValues)[];
  shortLinks: { slug: string; where: string }[];
  scales: Record<string, AiSurveyScaleAnswer[]>;
  ui: {
    progress: string;
    skipNote: string;
    savedNote: string;
    next: string;
    back: string;
    finish: string;
    saving: string;
    saveFailed: string;
    tryAgain: string;
    /** Shown when a page cannot be saved because this browser's unfinished survey is over, not because of the connection. */
    sessionEnded: string;
    charactersLeft: string;
    selectPlaceholder: string;
    frameLabel: string;
    /** The words of a "rank your top three" question. `chosen` takes `{place}`. */
    rank: { hint: string; places: string[]; chosen: string; full: string };
  };
  start: {
    eyebrow: string;
    intro: string;
    time: string;
    organiser: { ifUnionCoBadged: string; otherwise: string };
    aiNote: string;
    yourAnswersHeading: string;
    yourAnswers: string[];
    privacyLink: string;
    ticks: { id: string; label: string }[];
    button: string;
    ticksNeeded: string;
    comingBack: { heading: string; body: string; carryOn: string; startOwn: string };
    closed: string;
    /**
     * Asked on the start screen, before anything else. "No" ends there: no
     * email is asked for and nothing is stored. The answer itself is never
     * stored either way.
     */
    consent: {
      heading: string;
      asks: string;
      points: string[];
      yes: string;
      no: string;
      /** What the start button says once "No" is chosen. */
      noButton: string;
      declined: { heading: string; body: string; back: string };
    };
  };
  /** Where to find help, offered on the start screen and again at the end. */
  support: { heading: string; links: { label: string; note?: string; href: string }[] };
  emailCheck: {
    heading: string;
    fieldLabel: string;
    fieldHelp: string;
    sendButton: string;
    botCheckLine: string;
    codeSent: string;
    /** "Send my code" again inside the minute: the code step, with the code sent a moment ago. */
    codeSentRecently: string;
    /** The page reloaded at the code step: the address is asked for again, beside the code. */
    comeBackToCode: string;
    codeFieldLabel: string;
    checkButton: string;
    newCodeLink: string;
    differentEmailLink: string;
    /** On the email step: to the code box, with nothing sent. */
    haveCodeLink: string;
    noEmailArrived: string;
    afterTheCodeHeading: string;
    afterTheCode: string;
    afterTheCodeButton: string;
    errors: {
      notUniversityAddress: string;
      wrongCode: string;
      codeRunOut: string;
      tooManyWrongTries: string;
      alreadyAnswered: string;
      askedAgainTooSoon: string;
      tooManyCodesToday: string;
      botCheckFailed: string;
      busy: string;
      couldNotSend: string;
      /** The code check got no answer: the connection, never the code. */
      couldNotCheck: string;
    };
    stepAddress: string;
    stepCode: string;
  };
  codeEmail: { fromName: string; replyTo: string; subject: string; textBody: string[] };
  groups: Record<string, { shufflePages: boolean; introOnFirstShown: string; introOnLater: string }>;
  pages: AiSurveyPage[];
  end: { heading: string; body: string; passItOn: string; newsletterLine: string; newsletterButton: string };
  privacyNotice: { title: string; sections: AiSurveyNoticeSection[]; frameLabel: string; backLink: string };
  export: { skipped: string; notReached: string; multi: string };
  admin: {
    heading: string;
    stages: { pilot: string; open: string; closed: string };
    stageNotes: { pilot: string; open: string; closed: string };
    counts: { started: string; finished: string; codesLastHour: string; ceiling: string };
    missingHeading: string;
    missingSet: string;
    missingNotSet: string;
    openButton: string;
    openNote: string;
    closeButton: string;
    closeConfirm: string;
    clearButton: string;
    clearConfirmLabel: string;
    clearDone: string;
    exportButton: string;
    exportNote: string;
    totalsLink: string;
    shortLinksHeading: string;
    shortLinksScans: string;
    neverOnePerson: string;
    frameLabel: string;
    stageNow: string;
    shortLinksLink: string;
    shortLinksWhere: string;
  };
};

/**
 * Question text can mark a word for emphasis with two asterisks either side,
 * `**like this**`. The page draws it bold; everything else reads it plain.
 */
export function plainText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

/** One saved page: a question's or a line's code against its answer. */
export type AiSurveyPageAnswers = Record<string, string | string[] | boolean>;

/**
 * One person's answers. NOTHING in it says who or when: no uid, email, IP
 * address, user agent, short link, date or time.
 */
export type AiSurveyAnswerSet = {
  surveyVersion: number;
  finished: boolean;
  /** The order this person was shown the pages of the `proposals` group. */
  proposalPageOrder: string[];
  /** A page appears once it has been saved. A skipped question is simply absent. */
  pages: Record<string, AiSurveyPageAnswers>;
};

export type AiSurveyStage = "pilot" | "open" | "closed";
