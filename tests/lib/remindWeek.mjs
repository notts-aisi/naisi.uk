/**
 * A week written as blocks for the suites about who has done a week and
 * Remind: part 1 two readings and a reflection, part 2 a written answer, each
 * a task of This week (so done counts both). With `checklist`, a step to tick
 * in part 1 too. No side effects: the pure suites import it without the
 * worlds' clocks.
 */

const run = (text) => ({ text });
const p = (...runs) => ({ type: "p", runs });

/** A week written as blocks: part 1 two readings and a reflection, part 2 a written answer, each a task of This week. */
export function remindWeek(k = "q1", { checklist = false } = {}) {
  return [
    {
      id: `${k}-tw`,
      type: "thisWeek",
      rows: [
        { type: "task", what: "Part 1", time: "", when: "before", whenText: "", covers: [`${k}-p1`] },
        { type: "task", what: "Part 2, the written answer", time: "", when: "before", whenText: "", covers: [`${k}-p2`] },
      ],
      total: "",
      note: [],
    },
    {
      id: `${k}-p1`,
      type: "part",
      title: "Two readings",
      time: "",
      framing: [],
      blocks: [
        { id: `${k}-s1`, type: "source", kind: "read", lead: "", title: "The diary", url: "https://example.com/a", by: "", date: "", time: "", compute: "", note: [] },
        { id: `${k}-s2`, type: "source", kind: "watch", lead: "", title: "The film", url: "https://example.com/b", by: "", date: "", time: "", compute: "", note: [] },
        { id: `${k}-rs`, type: "reflection", prompts: [{ id: `${k}-rp1`, text: "What did you think?" }] },
        ...(checklist ? [{ id: `${k}-cl`, type: "checklist", items: [{ id: `${k}-c1`, title: "Bring a laptop", mirrorToMyWork: false }] }] : []),
      ],
    },
    {
      id: `${k}-p2`,
      type: "part",
      title: "Your answer",
      time: "",
      framing: [],
      blocks: [
        { id: `${k}-wa`, type: "writtenAnswer", prompt: [p(run("Who keeps the lamps lit?"))], boxes: [], guidance: [], words: { min: 10, max: 40 }, due: "before" },
      ],
    },
  ];
}

