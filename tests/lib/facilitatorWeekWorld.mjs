/**
 * Week 3 of AGI Strategy's run, WRITTEN AS BLOCKS, for the suite about a
 * group's week as its facilitators, the programme's lead and admins read it
 * (boards wk-fac-group, wk-fac-group-phone, wk-reflections and
 * wk-reflections-phone; Q30, Q31, Q37, Q38, and Zach on Mon 26 Oct for a
 * facilitator's own coursework).
 *
 * Built on `tests/lib/facilitatorPagesWorld.mjs` (the run in its third week:
 * Group B meets tonight, Tuesdays at 6pm, Rahul and Sofia facilitating,
 * Chloe, Farah and Kofi in it; Claudia leads the programme, Tess leads
 * another, Lloyd reviews, Yusuf is the run's track lead, Tom facilitates
 * Group C, Amara is in Group A, Zach is an admin). On top of it:
 *
 *  - WEEK 3 is a week written as blocks in week 1's shape (three parts, each
 *    with a stop of two reflection prompts; two sources in part 2), its ids
 *    prefixed `k3`.
 *  - RAHUL HOLDS A PLACE in Group B as well as facilitating it (a learner's
 *    row, as the facilitators-are-fellows change writes one); SOFIA
 *    facilitates with no place (the facilitator's row the facilitators route
 *    writes). Both do the week's coursework as themselves.
 *  - ISAAC was in Group B and left on Fri 13 Nov, after writing and ticking.
 *  - REFLECTIONS (rows of `courseExerciseResponses`, kind "reflection"):
 *    Chloe wrote part 1 (both prompts) and half of part 2; Farah parts 1 and
 *    2; Kofi nothing; Rahul part 1; Sofia one prompt of part 1; Isaac part 1;
 *    Amara (Group A) part 1. Each sentence is its writer's own, so a page
 *    that shows one shows whose it is to the suite and to nobody else.
 *  - TICKS AND PRIVATE NOTES (rows of `courseProgress`): Chloe ticked the
 *    diary and left a private note on it; Farah ticked both; Kofi ticked
 *    nothing and left a private note on the film; Rahul ticked the diary with
 *    a note of Rahul's own; Sofia ticked the film; Isaac and Amara ticked the
 *    diary, each with a note.
 *
 * THE CLOCK is Tue 17 Nov 2026 at noon in London: Group B meets tonight, in
 * week 3. Every word is made up for these tests, and every address is on
 * example.com.
 */
import { join } from "node:path";
import { A, AGI, B, NOW, ROUND, RUN, facilitatorSeed, makeFacilitatorPagesWorld } from "./facilitatorPagesWorld.mjs";
import { account, enrolment } from "./hubAttendanceWorld.mjs";
import { weekOneBlocks } from "./weekBlocksPageWorld.mjs";

export { A, AGI, B, NOW, ROUND, RUN };

/**
 * Every word a reflection holds, by writer and prompt. No sentence names its
 * writer, so a page that shows one shows whose it is only by what the page
 * itself puts beside it; and the order of the words is not the order of the
 * writers' names (Farah's answer to the first prompt comes first by its
 * words, Chloe's to the second), so an order by name, either way round, is
 * told from an order by words.
 */
export const SAID = {
  chloe: {
    "k3-rp1": "Forty lamps are still lit, at a guess.",
    "k3-rp2": "A harbour board should pay for the oil.",
    "k3-rp3": "They disagree about the fog more than the lamps.",
  },
  farah: {
    "k3-rp1": "About a dozen, all of them automatic now.",
    "k3-rp2": "Split the oil bill by the tonnage that passes.",
    "k3-rp3": "Mostly about the bell, and who rings it.",
    "k3-rp4": "The storm scene, when the lamp goes out.",
  },
  rahul: {
    "k3-rp1": "Thirty, though the keepers would know better.",
    "k3-rp2": "The town, since the town eats the fish.",
  },
  sofia: { "k3-rp1": "Twenty or so along this stretch of coast." },
  isaac: {
    "k3-rp1": "Fifty, if you count the harbour lights.",
    "k3-rp2": "Shipping should pay: they use the light.",
  },
  amara: {
    "k3-rp1": "Ten, mostly in the far north.",
    "k3-rp2": "The lighthouse board, as it always has.",
  },
};

/** Every private note, by writer: none names its writer. */
export const NOTED = {
  chloe: ["k3-s1", "The diary’s second chapter dragged for me."],
  kofi: ["k3-s2", "The film would not load on the campus network."],
  rahul: ["k3-s1", "I would cut the diary to its first ten pages."],
  isaac: ["k3-s1", "Too long for one evening, before I left."],
  amara: ["k3-s1", "Group A found the diary hard going."],
};

/** Who ticked which source. */
export const TICKED = {
  chloe: ["k3-s1"],
  farah: ["k3-s1", "k3-s2"],
  rahul: ["k3-s1"],
  sofia: ["k3-s2"],
  isaac: ["k3-s1"],
  amara: ["k3-s1"],
};

/** Isaac left Group B on Fri 13 Nov. */
export const ISAAC_LEFT = new Date("2026-11-13T10:00:00Z");

/** A week document as the loader stores one. */
function blockWeekDoc(n, title, blocks) {
  return {
    weekNumber: n,
    title,
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks,
  };
}

/** A reflection as its route stores one. */
export function reflection(uid, promptId, text, weekNumber = 3) {
  return {
    runId: RUN.agi,
    uid,
    weekId: `w0${weekNumber}`,
    weekNumber,
    exerciseId: promptId,
    kind: "reflection",
    responseType: "text",
    text,
    submittedAt: null,
    reviewStatus: "unreviewed",
    updatedAt: new Date("2026-11-15T16:12:00Z"),
  };
}

/** A tick, with its private note when one is given, as the week page writes one. */
export function tick(uid, itemId, { completed = true, privateNote = "", weekNumber = 3 } = {}) {
  const row = {
    runId: RUN.agi,
    uid,
    weekNumber,
    itemKind: "material",
    itemId,
    completed,
    hasPublicComment: false,
    updatedAt: new Date("2026-11-15T16:12:00Z"),
  };
  if (completed) row.completedAt = new Date("2026-11-15T16:12:00Z");
  if (privateNote) row.privateNote = privateNote;
  return row;
}

const reflectionPath = (uid, promptId, weekNumber = 3) => `courseExerciseResponses/${RUN.agi}__${uid}__w0${weekNumber}__${promptId}`;
const tickPath = (uid, itemId) => `courseProgress/${RUN.agi}__${uid}__${itemId}`;

/** The world every suite starts from. `over` adds or replaces whole documents. */
export function facilitatorWeekSeed(over = {}) {
  const seed = facilitatorSeed();
  seed[`courseRuns/${RUN.agi}/weeks/w03`] = blockWeekDoc(3, "The lamp makers", weekOneBlocks("k3"));
  // Rahul holds a place in Group B as well as facilitating it; Sofia facilitates with none.
  seed[`courseEnrolments/${RUN.agi}__rahul`] = enrolment("rahul", B);
  seed[`courseEnrolments/${RUN.agi}__sofia`] = enrolment("sofia", null, { role: "facilitator", allocatedEmailAt: null });
  // Isaac was in Group B and left on Fri 13 Nov.
  seed["users/isaac"] = account("isaac", "Isaac Mensah");
  seed[`courseEnrolments/${RUN.agi}__isaac`] = enrolment("isaac", B, {
    status: "withdrawn",
    droppedOutAt: ISAAC_LEFT,
    allocatedEmailAt: null,
  });
  for (const [uid, prompts] of Object.entries(SAID)) {
    for (const [promptId, text] of Object.entries(prompts)) seed[reflectionPath(uid, promptId)] = reflection(uid, promptId, text);
  }
  const notes = new Map(Object.entries(NOTED));
  for (const uid of new Set([...Object.keys(TICKED), ...notes.keys()])) {
    const items = new Set([...(TICKED[uid] ?? []), ...(notes.has(uid) ? [notes.get(uid)[0]] : [])]);
    for (const itemId of items) {
      const note = notes.get(uid);
      seed[tickPath(uid, itemId)] = tick(uid, itemId, {
        completed: (TICKED[uid] ?? []).includes(itemId),
        privateNote: note && note[0] === itemId ? note[1] : "",
      });
    }
  }
  return { ...seed, ...over };
}

/** The world, its pages and short ways to ask them. */
export async function makeFacilitatorWeekWorld(key = "__facilitatorWeek") {
  const w = await makeFacilitatorPagesWorld(key);
  const GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
  const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
  const pages = {
    ...w.pages,
    reflections: (await w.loadTs(join(GROUP, "reflections", "page.tsx"))).default,
    leadWeek: (await w.loadTs(join(PROGRAMME, "week", "page.tsx"))).default,
    leadReflections: (await w.loadTs(join(PROGRAMME, "reflections", "page.tsx"))).default,
  };
  const lib = {
    model: await w.loadTs(join("lib", "courses", "facilitatorWeek", "model.ts")),
    words: await w.loadTs(join("lib", "courses", "facilitatorWeek", "words.ts")),
    readers: await w.loadTs(join("lib", "courses", "facilitatorWeek", "readers.ts")),
    memberWords: await w.loadTs(join("lib", "courses", "memberPageWords.ts")),
  };

  /** Start again from a seed, at `NOW`. */
  const reset = (seed = facilitatorWeekSeed()) => w.reset(seed);

  /** The group's reflections page as `who`, on `week` when given. */
  const reflectionsPage = (who, { groupId = B, week } = {}) =>
    w.draw(pages.reflections, who, { runId: RUN.agi, groupId }, week === undefined ? {} : { week: String(week) });

  /** The lead's view of a group's week as `who`. */
  const leadWeekPage = (who, { groupId = B } = {}) =>
    w.draw(pages.leadWeek, who, { roundId: ROUND, programmeId: AGI }, { group: groupId });

  /** The lead's reading of a group's reflections as `who`. */
  const leadReflectionsPage = (who, { groupId = B, week } = {}) =>
    w.draw(
      pages.leadReflections,
      who,
      { roundId: ROUND, programmeId: AGI },
      week === undefined ? { group: groupId } : { group: groupId, week: String(week) },
    );

  return { ...w, pages, lib, reset, reflectionsPage, leadWeekPage, leadReflectionsPage };
}
