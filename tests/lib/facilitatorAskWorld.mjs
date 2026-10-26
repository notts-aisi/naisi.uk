/**
 * The term after decision day, for the suites about asking people to
 * facilitate (boards st-facilitators and st-fac-ask-phone).
 *
 * Built on `tests/lib/leadWorld.mjs` (the real handlers, the term's form, the
 * AGI Strategy run Claudia's programme names, its three groups). On top of it:
 *
 *  - THE FORM ASKS ABOUT FACILITATING, with the live form's own seven
 *    facilitator questions, word for word, as one question set.
 *  - PEOPLE WHO SAID YES, each standing somewhere different after decision
 *    day:
 *      omar   told "No offer this time", would facilitate AGI Strategy;
 *      wen    holds a Technical AI Safety place, said Either;
 *      nina   gave her AGI Strategy place back, would facilitate AGI Strategy;
 *      amara  holds an AGI Strategy place, said Either (Q21: never asked);
 *      ines   invited to AGI Strategy, not answered, would facilitate it;
 *      tariq  holds an AGI Strategy place, would facilitate Technical AI
 *             Safety only, so is not on AGI Strategy's list;
 *      dev    said no to facilitating.
 *  - Each written answer is a sentence no other document holds, so a suite
 *    can fail on one turning up where it has no business being.
 *
 * The clock: decisions went out Fri 23 Oct; a suite runs at `NOW`, Mon 26 Oct
 * at 12pm in London, and asks for answers by `REPLY_BY`, Wed 28 Oct at 12pm.
 */
import { applicationPath } from "./handoverWorld.mjs";
import { A, AGI, B, C, GROUP, PERSONAS, ROUND, RUN, TAIS, formPath, leadSeed, slot } from "./leadWorld.mjs";

export { A, AGI, B, C, GROUP, PERSONAS, ROUND, RUN, TAIS, formPath, slot };

/** Mon 26 Oct 2026, 12pm in London (GMT since Sun 25 Oct). */
export const NOW = new Date("2026-10-26T12:00:00Z");
/** Wed 28 Oct 2026, 12pm in London. */
export const REPLY_BY = { dateKey: "2026-10-28", time: "12:00" };
export const REPLY_BY_INSTANT = new Date("2026-10-28T12:00:00Z");

export const SET = "facilitators";

/** The live form's facilitator questions, word for word, with ids of their own. */
export const QUESTIONS = [
  {
    id: "which",
    text: "Which would you like to facilitate?",
    type: "choice",
    options: ["AGI Strategy", "Technical AI Safety", "Either"],
    required: true,
  },
  {
    id: "before",
    text: "Have you done this course, or something like it, before?",
    type: "choice",
    options: ["Yes, this one", "Something like it", "No, but I know the material", "No"],
    required: true,
  },
  { id: "whichCourse", text: "If so, which?", type: "short", options: [], required: false },
  {
    id: "led",
    text: "Have you led a discussion, taught or tutored before? Tell us in a line or two.",
    help: "It’s fine if you haven’t.",
    type: "long",
    options: [],
    wordLimit: 60,
    required: false,
  },
  {
    id: "article",
    text: "Pick one article, video or post you’d want a group of newcomers to discuss. Link it, and write the first question you’d ask the group.",
    type: "long",
    options: [],
    wordLimit: 80,
    required: true,
  },
  {
    id: "chatbots",
    text: "A newcomer says: “Why worry about chatbots?” Answer them the way you’d say it out loud.",
    type: "long",
    options: [],
    wordLimit: 100,
    required: true,
  },
  {
    id: "everyWeek",
    text: "Can you be there every week?",
    type: "choice",
    options: ["Yes, I’m confident", "Most weeks, so I’d rather share a group", "I’d rather be a reserve"],
    required: true,
  },
].map((question) => ({
  help: "",
  optionsFromRanking: false,
  wordLimit: null,
  scored: false,
  ...question,
}));

/** Who said what, uid to [would they, which, answers]. */
export const SAID = {
  omar: [true, "AGI Strategy", { led: "I ran the chess club’s Tuesday sessions for a year.", everyWeek: "Yes, I’m confident" }],
  wen: [true, "Either", { led: "I tutor A-level maths on Saturdays.", everyWeek: "Most weeks, so I’d rather share a group" }],
  nina: [true, "AGI Strategy", { led: "Seminar rep for second years.", everyWeek: "Yes, I’m confident" }],
  amara: [true, "Either", { led: "I chaired the debating society’s novice rounds.", everyWeek: "Yes, I’m confident" }],
  ines: [true, "AGI Strategy", { led: "Peer mentor in halls.", everyWeek: "I’d rather be a reserve" }],
  tariq: [true, "Technical AI Safety", { led: "Lab demonstrator.", everyWeek: "Yes, I’m confident" }],
  dev: [false, null, {}],
};

/** A written answer nobody else has, for each person who answered. */
export const SECRET = (uid) => `A first question only ${uid} would ask.`;

/** The world every suite here starts from. `over` adds or replaces whole documents. */
export function askSeed(over = {}) {
  const seed = leadSeed();
  const form = seed[formPath];
  form.asksFacilitating = true;
  form.questionSetIds = [...form.questionSetIds, SET];
  seed[`${formPath}/questionSets/${SET}`] = {
    roundId: ROUND,
    role: "facilitator",
    scope: { type: "facilitating" },
    label: "Facilitator questions",
    intro: "",
    applicantLine: "",
    questions: QUESTIONS,
  };
  for (const [uid, [would, which, answers]] of Object.entries(SAID)) {
    const path = applicationPath(uid);
    const application = seed[path];
    if (!application) continue;
    const given = would
      ? {
          which,
          before: "Something like it",
          whichCourse: "",
          article: SECRET(uid),
          chatbots: `Because ${uid} thinks they will be everywhere.`,
          ...answers,
        }
      : {};
    for (const copy of ["draft", "sent"]) {
      application[copy] = {
        ...application[copy],
        wantsToFacilitate: would,
        answers: { ...application[copy].answers, ...(would ? { [SET]: given } : {}) },
      };
    }
  }
  return { ...seed, ...over };
}

/** The ask's routes and the course routes beside it, loaded for one suite. */
export async function loadAskRoutes(made) {
  const { formRoute, courseRoute } = made;
  return {
    ask: await formRoute("programmes", "[programmeId]", "facilitators", "ask"),
    test: await formRoute("programmes", "[programmeId]", "facilitators", "ask", "test"),
    remind: await formRoute("programmes", "[programmeId]", "facilitators", "remind"),
    training: await formRoute("programmes", "[programmeId]", "facilitators", "training"),
    answer: await courseRoute("facilitator-asks", "[askId]", "answer"),
    asking: await courseRoute("runs", "[runId]", "facilitators", "asking"),
    byHand: await courseRoute("groups", "[groupId]", "facilitators"),
    roster: await courseRoute("groups", "[groupId]", "roster"),
  };
}

/** `{ roundId, programmeId }` for AGI Strategy's own routes. */
export const AGI_PARAMS = { roundId: ROUND, programmeId: AGI };
