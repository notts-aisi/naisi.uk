import type { WorksheetOption } from "@/lib/firestore/worksheets";
import type {
  SurveyAnchor,
  SurveyChoiceQuestion,
  SurveyConsentItem,
  SurveyItem,
  SurveyLinesQuestion,
  SurveyNumberQuestion,
  SurveyPercentQuestion,
  SurveyScaleQuestion,
} from "./items";
import { LEVEL_OPTION, SUBJECT_OPTION } from "./profileOffer";

/**
 * THE PROGRAMME IMPACT QUESTIONNAIRE, as templates: the survey before a
 * programme, the one at its end, and the follow-ups at 6 and 12 months, with
 * an incubator's additions where the questionnaire puts them. Its words are
 * the questionnaire's (Zach, Mon 26 Oct 2026), adapted only where the site
 * already knows the answer: the email a person registered with and their
 * programme are on the site, so the before survey does not ask them.
 *
 * Rules a maintainer keeps:
 *
 *  - THE IDS ARE THE PAIRING. A question asked at more than one stage has the
 *    same id, the same type and the same option ids at every stage and in
 *    every programme ("Which best describes you right now?" is `q_c1` before,
 *    at the end and in each follow-up), so answers pair by person and compare
 *    across programmes. Change a question's words freely; never its id.
 *  - SAME WORDING EVERY TIME, except where the questionnaire says otherwise:
 *    "In the last 3 months" before becomes "Since the programme started" at
 *    the end.
 *  - NOTHING IS REQUIRED, and a consent box starts unticked. The survey at
 *    the end asks the follow-ups box again, of people the before survey
 *    never asked.
 *
 * Pure: words and shapes only.
 */

/** A stage of a programme's surveys, in the order they are sent. */
export type SurveyStage = "before" | "after" | "followUp6" | "followUp12";

export const SURVEY_STAGES: readonly SurveyStage[] = ["before", "after", "followUp6", "followUp12"];

/**
 * Which research an incubator does, for the first line of its skills question
 * (the questionnaire's I2(a)): chosen when its survey is made, and copied to
 * the survey at its end.
 */
export type IncubatorStrand = "alignment" | "governance";

export const INCUBATOR_STRANDS: readonly IncubatorStrand[] = ["alignment", "governance"];

/** The two wordings of I2(a), and how the New survey page names each. */
export const STRAND_WORDS: Record<IncubatorStrand, { name: string; line: string }> = {
  alignment: { name: "Alignment", line: "I could reproduce the main result of an AI safety paper" },
  governance: { name: "Governance", line: "I could write a policy-relevant research memo" },
};

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const option = (id: string, label: string): WorksheetOption => ({ id, label });

function single(id: string, title: string, options: WorksheetOption[], extra: Partial<SurveyChoiceQuestion> = {}): SurveyChoiceQuestion {
  return { kind: "question", id, type: "singleChoice", title, body: [], required: false, options, ...extra };
}

function many(id: string, title: string, options: WorksheetOption[], extra: Partial<SurveyChoiceQuestion> = {}): SurveyChoiceQuestion {
  return { kind: "question", id, type: "multipleChoice", title, body: [], required: false, options, ...extra };
}

function text(id: string, title: string, long: boolean, extra: Partial<SurveyChoiceQuestion> = {}): SurveyChoiceQuestion {
  return {
    kind: "question",
    id,
    type: long ? "longText" : "shortText",
    title,
    body: [],
    required: false,
    limit: { unit: "characters", max: long ? 2000 : 300 },
    ...extra,
  };
}

function scale(id: string, title: string, min: number, max: number, anchors: SurveyAnchor[], extra: Partial<SurveyScaleQuestion> = {}): SurveyScaleQuestion {
  return { kind: "question", id, type: "scale", title, min, max, anchors, ...extra };
}

function percent(id: string, title: string, ends: { min: string; max: string }, extra: Partial<SurveyPercentQuestion> = {}): SurveyPercentQuestion {
  return { kind: "question", id, type: "percent", title, ends, ...extra };
}

function count(id: string, title: string): SurveyNumberQuestion {
  return { kind: "question", id, type: "number", title, max: 1000 };
}

/** Every point of an agreement grid, worded. */
const AGREE = ["Strongly disagree", "Disagree", "Neither agree nor disagree", "Agree", "Strongly agree"];

function agreeGrid(id: string, title: string, lines: [string, string][]): SurveyLinesQuestion {
  return {
    kind: "question",
    id,
    type: "lines",
    title,
    lines: lines.map(([lineId, label]) => ({ id: lineId, label })),
    scale: { max: 5, minLabel: AGREE[0], maxLabel: AGREE[4], points: [...AGREE] },
  };
}

const section = (id: string, heading: string): SurveyItem => ({ kind: "section", id, heading, body: [] });
const pageBreak = (id: string): SurveyItem => ({ kind: "pageBreak", id });

/** Items in pages: each page a section and its questions, page breaks between. */
function paged(pages: { id: string; heading: string; items: SurveyItem[] }[]): SurveyItem[] {
  const out: SurveyItem[] = [];
  pages.forEach((page, at) => {
    if (at > 0) out.push(pageBreak(`pb_${page.id}`));
    out.push(section(page.id, page.heading), ...page.items);
  });
  return out;
}

// ---------------------------------------------------------------------------
// The questions, by their questionnaire numbers
// ---------------------------------------------------------------------------

/** P3, the level: offered from the profile where it holds it. */
const P3_LEVEL = single(
  "q_p3_level",
  "Level of study",
  [
    option(LEVEL_OPTION.ug1, "Undergraduate, first year"),
    option(LEVEL_OPTION.ug2, "Undergraduate, second year"),
    option(LEVEL_OPTION.ug3, "Undergraduate, third year"),
    option(LEVEL_OPTION.ug4, "Undergraduate, fourth year or later"),
    option(LEVEL_OPTION.masters, "Master’s"),
    option(LEVEL_OPTION.phd, "PhD"),
    option(LEVEL_OPTION.staff, "Staff"),
    option(LEVEL_OPTION.other, "Other"),
  ],
  { look: "menu", profile: "level" },
);

/** P3, the subject: offered from the profile where it holds it. */
const P3_SUBJECT = single(
  "q_p3_subject",
  "Subject of study",
  [
    option(SUBJECT_OPTION.cs, "Computer science"),
    option(SUBJECT_OPTION.maths, "Maths"),
    option(SUBJECT_OPTION.physicsEngineering, "Physics or engineering"),
    option(SUBJECT_OPTION.law, "Law"),
    option(SUBJECT_OPTION.politics, "Politics"),
    option(SUBJECT_OPTION.philosophy, "Philosophy"),
    option(SUBJECT_OPTION.economics, "Economics"),
    option(SUBJECT_OPTION.other, "Other"),
  ],
  { look: "menu", profile: "subject" },
);

const P4 = many(
  "q_p4",
  "Before this programme, which of these had you done?",
  [
    option("o_course", "BlueDot or similar course"),
    option("o_group", "Another AI safety group"),
    option("o_reading", "AI safety books, LessWrong or 80,000 Hours"),
    option("o_event", "An AI safety talk or event"),
    option("o_ml", "ML research or coursework"),
    option("o_none", "None of these"),
  ],
  { noneIds: ["o_none"] },
);

const P5 = many("q_p5", "How did you first hear about NAISI?", [
  option("o_fair", "Freshers’ fair"),
  option("o_talk", "Intro talk"),
  option("o_lecturer", "Lecturer or module"),
  option("o_friend", "Friend"),
  option("o_social", "Social media"),
  option("o_newsletter", "Newsletter"),
  option("o_other", "Other"),
]);

/** C1's points, which T1 asks about again looking back. Their ids and numbers are the stage. */
const STAGE_OPTIONS = [
  option("o_stage0", "Haven’t really thought about working on AI safety"),
  option("o_stage1", "Thought about it, not a serious option"),
  option("o_stage2", "One of several options I’m seriously considering"),
  option("o_stage3", "My leading plan, no concrete steps yet"),
  option("o_stage4", "Taking concrete steps (applying, upskilling, choosing modules or a dissertation)"),
  option("o_stage5", "Already doing AI safety work, paid or unpaid"),
];
const STAGE_SCORES = Object.fromEntries(STAGE_OPTIONS.map((each, at) => [each.id, at]));

const C1 = single("q_c1", "Which best describes you right now?", STAGE_OPTIONS, { look: "points", scores: STAGE_SCORES });

const C2 = percent(
  "q_c2",
  "How likely is it that in 5 years most of your working time goes on reducing risks from advanced AI?",
  { min: "", max: "" },
  { hint: "Research, policy, engineering, operations and fieldbuilding all count." },
);

const C3 = many(
  "q_c3",
  "Which kinds of work interest you most?",
  [
    option("o_research", "Technical research"),
    option("o_engineering", "Engineering"),
    option("o_policy", "Governance or policy"),
    option("o_strategy", "Strategy"),
    option("o_operations", "Operations or generalist"),
    option("o_fieldbuilding", "Fieldbuilding or comms"),
    option("o_founding", "Founding something"),
    option("o_unsure", "Not sure"),
  ],
  { maxPicks: 3 },
);

const C4_ANCHORS: SurveyAnchor[] = [
  { at: 1, label: "Not at all" },
  { at: 4, label: "The gist, to a friend" },
  { at: 7, label: "Could hold my own with a researcher" },
];
const C4 = scale(
  "q_c4",
  "How well could you explain why some researchers think advanced AI could be catastrophically dangerous, and the main objections?",
  1,
  7,
  C4_ANCHORS,
);

const C5_ANCHORS: SurveyAnchor[] = [
  { at: 1, label: "Couldn’t name any" },
  { at: 4, label: "Could name a few and roughly what they do" },
  { at: 7, label: "Could describe most major orgs’ agendas well enough that their staff would agree" },
];
const C5 = scale("q_c5", "How familiar are you with the main organisations, research agendas and policy debates in AI safety?", 1, 7, C5_ANCHORS);

const C6 = count("q_c6", "How many people working in AI safety would you feel comfortable messaging for 30 minutes of advice?");

const C7 = agreeGrid("q_c7", "How much do you agree?", [
  ["l_next", "I know what my next concrete step towards AI safety work would be."],
  ["l_contribute", "I could make a meaningful contribution to AI safety."],
]);

const C8 = many(
  "q_c8",
  "What, if anything, stands between you and contributing to AI safety?",
  [
    option("o_risk", "Not sure the risk is real"),
    option("o_roles", "Don’t know what roles exist"),
    option("o_skills", "Technical skills"),
    option("o_experience", "Research experience"),
    option("o_credentials", "Credentials or publications"),
    option("o_contacts", "Contacts"),
    option("o_money", "Money, visa or location"),
    option("o_priorities", "Other priorities"),
    option("o_fit", "Not sure I’d fit"),
    option("o_nothing", "Nothing major"),
  ],
  { noneIds: ["o_nothing"] },
);

const C9_OPTIONS = [
  option("o_applied", "Applied to an AI safety programme or job"),
  option("o_event", "Attended an AI safety event outside NAISI"),
  option("o_oneone", "Had a 1:1 with someone in the field"),
  option("o_written", "Written something on AI safety"),
  option("o_module", "Chosen a module, project or dissertation on it"),
  option("o_project", "Started your own project"),
  option("o_none", "None of these"),
];
/** C9 before: the last 3 months. */
const C9_BEFORE = many("q_c9", "In the last 3 months, have you…", C9_OPTIONS, { noneIds: ["o_none"] });
/** C9 at the end: since the programme started (the questionnaire's one change of wording). */
const C9_AFTER = many("q_c9", "Since the programme started, have you…", C9_OPTIONS, { noneIds: ["o_none"] });

const P6 = text("q_p6", "What do you most want to get out of this programme?", false);

/**
 * P7: the consent. Its statement is shown as text; the box for the follow-ups
 * starts unticked, and the follow-ups go only to people who ticked it. The
 * questionnaire's second opt-in, sharing with Kairos, is shared by default
 * instead: every programme survey's form ends with a way to say no, drawn by
 * the form itself (`asksKairos`), never an item an edit could take out.
 */
const P7: SurveyConsentItem = {
  kind: "consent",
  id: "c_p7",
  statement: "Anonymised results go to our funders: totals, never your name.",
  boxes: [{ purpose: "followUps", label: "Contact me at 6 and 12 months with a short follow-up survey" }],
};

/**
 * P7 (a) again at the end, for somebody the before survey never asked: the
 * same box, drawn only for a person whose row on the before survey says
 * nothing about follow-ups yet (they missed it, or joined after it), and kept
 * on their row here (`consentsAskedOf`, `followUpsHolderFor`).
 */
const END_CONSENT: SurveyConsentItem = {
  kind: "consent",
  id: "c_end",
  statement: P7.statement,
  boxes: [{ purpose: "followUps", label: P7.boxes[0].label }],
};

const T1 = single("q_t1", "Looking back, which best described you before the programme?", STAGE_OPTIONS, {
  look: "points",
  scores: STAGE_SCORES,
  lookBackOf: "q_c1",
});
const T2 = scale("q_t2", "Looking back, how well could you have explained the risk argument before?", 1, 7, C4_ANCHORS, { lookBackOf: "q_c4" });
const T3 = scale("q_t3", "Looking back, how familiar were you with the field before?", 1, 7, C5_ANCHORS, { lookBackOf: "q_c5" });

const A1 = single("q_a1", "How has the programme affected your career plans?", [
  option("o_nochange", "No change"),
  option("o_clarified", "Clarified but didn’t change"),
  option("o_sped", "Sped up plans I already had"),
  option("o_towards", "Moved me towards AI safety"),
  option("o_away", "Moved me away from it"),
]);

const A2 = percent(
  "q_a2",
  "Without this programme, how likely is it you’d be where you are now on AI safety, with the same plans and next steps?",
  { min: "Definitely not", max: "Definitely anyway" },
);

const A3 = single("q_a3", "Did it speed up anything you’d have done anyway?", [
  option("o_no", "No"),
  option("o_under1", "Under 1 month"),
  option("o_1to6", "1 to 6 months"),
  option("o_over6", "Over 6 months"),
]);

const A4 = many(
  "q_a4",
  "What else has shaped your current plans?",
  [
    option("o_bluedot", "BlueDot"),
    option("o_80k", "80,000 Hours"),
    option("o_courses", "Other courses or groups"),
    option("o_friends", "Friends"),
    option("o_lecturers", "Lecturers"),
    option("o_news", "AI news"),
    option("o_other", "Other"),
  ],
  { most: "Which of those mattered most?" },
);

const A5 = text("q_a5", "Did the programme have any negative effect on you or your plans?", true);

const Q1 = scale("q_q1", "How likely are you to recommend this programme to a friend with similar interests?", 0, 10, [
  { at: 0, label: "Not at all likely" },
  { at: 10, label: "Extremely likely" },
]);

const Q2: SurveyLinesQuestion = {
  kind: "question",
  id: "q_q2",
  type: "lines",
  title: "How valuable was each part?",
  hint: "Leave a part blank if you didn’t have it.",
  lines: [
    { id: "l_sessions", label: "Sessions" },
    { id: "l_readings", label: "Readings" },
    { id: "l_facilitator", label: "Facilitator" },
    { id: "l_participants", label: "Other participants" },
    { id: "l_speakers", label: "Speakers" },
    { id: "l_socials", label: "Socials" },
    { id: "l_oneones", label: "1:1s" },
  ],
  scale: { max: 5, minLabel: "Not valuable", maxLabel: "Very valuable" },
};

/** Q3 shows each person what they said to P6 at the start. */
const Q3 = scale(
  "q_q3",
  "Did you get what you wanted from it?",
  1,
  5,
  [
    { at: 1, label: "Not at all" },
    { at: 5, label: "Completely" },
  ],
  { pipe: { from: "q_p6", words: "At the start you said:" } },
);

const N1 = many(
  "q_n1",
  "What are you planning next?",
  [
    option("o_incubator", "NAISI spring incubator"),
    option("o_spar", "SPAR"),
    option("o_mats", "MATS"),
    option("o_arena", "ARENA"),
    option("o_bluedot", "BlueDot advanced course"),
    option("o_gcp", "GCP workshop"),
    option("o_fellowship", "Other fellowship (ERA, LASR, Pivotal)"),
    option("o_eag", "EAG or EAGx"),
    option("o_project", "Own project"),
    option("o_dissertation", "Dissertation topic"),
    option("o_nothing", "Nothing yet"),
  ],
  { noneIds: ["o_nothing"] },
);

const N2 = single("q_n2", "Would you like to facilitate or help organise NAISI next term?", [
  option("o_yes", "Yes"),
  option("o_maybe", "Maybe"),
  option("o_no", "No"),
]);

const N3 = single("q_n3", "Would you like a 1:1 about next steps?", [option("o_yes", "Yes"), option("o_no", "No")]);

// The incubators' additions.

const I1 = single("q_i1", "Research experience so far", [
  option("o_none", "None"),
  option("o_coursework", "Coursework project"),
  option("o_independent", "Independent project"),
  option("o_paper", "Paper or report submitted or published"),
]);

function i2Lines(strand: IncubatorStrand): [string, string][] {
  return [
    ["l_a", STRAND_WORDS[strand].line],
    ["l_b", "I can scope a question answerable in a few weeks"],
    ["l_c", "I can tell a promising direction from a dead end"],
    ["l_d", "I could write results up well enough to post publicly"],
    ["l_e", "I know how to get feedback from researchers outside NAISI"],
  ];
}

const I2 = (strand: IncubatorStrand) => agreeGrid("q_i2", "How much do you agree?", i2Lines(strand));

/** I2 again at the end, looking back. */
const I2_BACK = (strand: IncubatorStrand): SurveyLinesQuestion => ({
  ...agreeGrid("q_i2_back", "Looking back, how much would you have agreed before the incubator?", i2Lines(strand)),
  lookBackOf: "q_i2",
});

const I3 = count("q_i3", "How many people could you approach to collaborate on an AI safety project?");

const I4 = many(
  "q_i4",
  "What did your team produce?",
  [
    option("o_replication", "Replication completed"),
    option("o_extension", "Extension or twist with results"),
    option("o_repo", "Public code repo"),
    option("o_post", "Blog, LessWrong or Alignment Forum post"),
    option("o_brief", "Policy brief or report"),
    option("o_submission", "Workshop or conference submission"),
    option("o_talk", "Talk at an event"),
    option("o_unfinished", "Nothing finished yet"),
  ],
  { noneIds: ["o_unfinished"] },
);

// The Kairos report lists these lines (src/lib/surveys/kairosReport.ts), and
// privacy v7 says they may go to funders, so the question says so too.
const I4_LINKS = text("q_i4_links", "Links to what your team produced", true, { hint: "One on each line. We may pass these on to our funders." });

const I4_WHEN = text("q_i4_when", "If nothing is finished yet, when do you expect it to be?", false);

const I5 = single("q_i5", "Without the incubator, would this output exist?", [
  option("o_definitely", "Definitely"),
  option("o_probably", "Probably"),
  option("o_possiblynot", "Possibly not"),
  option("o_probablynot", "Probably not"),
]);

const I6 = single("q_i6", "How much did the incubator speed it up?", [
  option("o_none", "Not at all"),
  option("o_under1", "Under 1 month"),
  option("o_1to6", "1 to 6 months"),
  option("o_over6", "Over 6 months"),
]);

const I7 = many("q_i7", "What next, for the project and for you?", [
  option("o_continue", "Continue the project"),
  option("o_writeup", "Write it up for a venue"),
  option("o_apply", "Apply to SPAR, MATS, LASR, Pivotal or ERA"),
  option("o_degree", "AI safety Master’s or PhD"),
  option("o_dissertation", "AI safety dissertation"),
  option("o_stop", "Stop here"),
]);

// The follow-ups.

const F1 = single("q_f1", "What’s your main activity now?", [
  option("o_studying", "Studying"),
  option("o_employed", "Employed"),
  option("o_fellowship", "Fellowship or programme"),
  option("o_independent", "Independent work"),
  option("o_other", "Other"),
]);

const F1_WHERE = text("q_f1_where", "The organisation or course", false);

/** F2, scored as FTE: 0, 0.05, 0.3, 0.7 and 1. */
const F2 = single(
  "q_f2",
  "Roughly what share of your working time goes on AI safety?",
  [option("o_0", "None"), option("o_under10", "Under 10%"), option("o_10to50", "10 to 50%"), option("o_50to90", "50 to 90%"), option("o_over90", "Over 90%")],
  { scores: { o_0: 0, o_under10: 0.05, o_10to50: 0.3, o_50to90: 0.7, o_over90: 1 }, scoreUnit: "FTE" },
);

const F3 = text("q_f3", "What is that work?", false, { hint: "Your role, and the organisation or programme." });

const F4_APPLIED = text("q_f4_applied", "Since the programme, which programmes or jobs have you applied to?", true, { hint: "One on each line." });

const F4_ACCEPTED = text("q_f4_accepted", "Which of those accepted you?", true, { hint: "One on each line." });

const F7 = text("q_f7", "Anything else that happened partly because of NAISI?", true);

// ---------------------------------------------------------------------------
// The templates
// ---------------------------------------------------------------------------

/** What each template's sections measure, as the editor names them, by section id. */
export const TEMPLATE_MEASURES: Record<string, string> = {
  s_about: "Reach",
  s_now: "Career stage, intention and interests",
  s_know: "Understanding, field knowledge, network, clarity and confidence",
  s_skills: "Research skills and collaborators",
  s_done: "Obstacles and concrete actions",
  s_finish: "Expectations and consent",
  s_back: "Looking back",
  s_project: "Research outputs",
  s_effect: "Plan change, counterfactual, acceleration, double counting",
  s_quality: "Satisfaction, programme design, expectations met",
  s_next: "Onward steps and the organiser pipeline",
  s_working: "What they do now, and AI safety FTE",
  s_since: "Applications, offers, stage and intention",
  s_credit: "Counterfactual and double counting",
};

/** The template's items for one stage of a programme of one kind. An incubator says its strand. */
export function templateItems(stage: SurveyStage, programmeKind: "fellowship" | "incubator", strand: IncubatorStrand | null): SurveyItem[] {
  // An incubator's additions need its strand; a fellowship has none.
  const research: IncubatorStrand | null = programmeKind === "incubator" ? strand : null;
  const incubator = research !== null;
  const copy = <T,>(value: T): T => structuredClone(value);
  if (stage === "before") {
    return paged([
      { id: "s_about", heading: "About you", items: copy([P3_LEVEL, P3_SUBJECT, P4, P5, ...(incubator ? [I1] : [])]) },
      { id: "s_now", heading: "Where you are now", items: copy([C1, C2, C3]) },
      { id: "s_know", heading: "What you know, and who", items: copy([C4, C5, C6, C7]) },
      ...(research ? [{ id: "s_skills", heading: "Your research skills", items: [I2(research), copy(I3)] }] : []),
      { id: "s_done", heading: "What you’ve done", items: copy([C8, C9_BEFORE]) },
      { id: "s_finish", heading: "To finish", items: copy<SurveyItem[]>([P6, P7]) },
    ]);
  }
  if (stage === "after") {
    return paged([
      { id: "s_now", heading: "Where you are now", items: copy([C1, C2, C3]) },
      { id: "s_know", heading: "What you know, and who", items: copy([C4, C5, C6, C7]) },
      ...(research ? [{ id: "s_skills", heading: "Your research skills", items: [I2(research), copy(I3)] }] : []),
      { id: "s_done", heading: "What you’ve done", items: copy([C8, C9_AFTER]) },
      { id: "s_back", heading: "Looking back", items: [...copy<SurveyItem[]>([T1, T2, T3]), ...(research ? [I2_BACK(research)] : [])] },
      ...(incubator ? [{ id: "s_project", heading: "Your project", items: copy<SurveyItem[]>([I4, I4_LINKS, I4_WHEN, I5, I6, I7]) }] : []),
      { id: "s_effect", heading: "What the programme did", items: copy<SurveyItem[]>([A1, A2, A3, A4, A5]) },
      { id: "s_quality", heading: "How it went", items: copy<SurveyItem[]>([Q1, Q2, Q3]) },
      { id: "s_next", heading: "What’s next", items: copy<SurveyItem[]>([N1, N2, N3, END_CONSENT]) },
    ]);
  }
  // The follow-ups at 6 and 12 months ask the same.
  return paged([
    { id: "s_working", heading: "What you’re doing now", items: copy<SurveyItem[]>([F1, F1_WHERE, F2, F3]) },
    { id: "s_since", heading: "Since the programme", items: copy<SurveyItem[]>([F4_APPLIED, F4_ACCEPTED, C1, C2]) },
    { id: "s_credit", heading: "Looking back", items: copy<SurveyItem[]>([A2, A4, F7]) },
  ]);
}

/** Whether a stage's template asks an incubator's skills question, whose first line depends on its strand. */
export function stageAsksStrand(stage: SurveyStage): boolean {
  return stage === "before" || stage === "after";
}

/** About how many minutes each stage takes, as the questionnaire says. The editor changes it. */
export const TEMPLATE_MINUTES: Record<SurveyStage, number> = { before: 5, after: 10, followUp6: 3, followUp12: 3 };
