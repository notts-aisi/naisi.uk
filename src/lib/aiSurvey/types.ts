/**
 * The shape of the AI at Nottingham survey's definition and of one answer set.
 *
 * The survey is built BESIDE the Surveys feature (src/lib/surveys) and shares
 * no record, route or type with it, so nothing here can move an existing
 * survey. The words students read live in one data module
 * (src/content/aiSurvey/definition.ts); the pages are a shell around it.
 *
 * Pure types and no imports, so client components, server code and the test
 * loader can all read this file.
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
export type AiSurveyMostOf = {
  id: string;
  type: "mostOf";
  text: string;
  /** The id of the `lines` question on the same page whose lines are offered. */
  linesFrom: string;
  extraOptions: AiSurveyOption[];
};
export type AiSurveyText = { id: string; type: "text"; text: string; help?: string; maxLength: number };
export type AiSurveyTick = { id: string; type: "tick"; text: string };

export type AiSurveyQuestion =
  | AiSurveySingle
  | AiSurveyMulti
  | AiSurveySelect
  | AiSurveyLines
  | AiSurveyMostOf
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
  /** Raised by any change to the wording once the survey is open. Kept on each answer set. */
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
    charactersLeft: string;
    selectPlaceholder: string;
    frameLabel: string;
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
  };
  emailCheck: {
    heading: string;
    fieldLabel: string;
    fieldHelp: string;
    sendButton: string;
    botCheckLine: string;
    codeSent: string;
    codeFieldLabel: string;
    checkButton: string;
    newCodeLink: string;
    differentEmailLink: string;
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
    };
    stepAddress: string;
    stepCode: string;
  };
  codeEmail: { fromName: string; replyTo: string; subject: string; textBody: string[] };
  groups: Record<string, { shufflePages: boolean; introOnFirstShown: string; introOnLater: string }>;
  pages: AiSurveyPage[];
  end: { heading: string; body: string; passItOn: string; petition: string; newsletterButton: string };
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
