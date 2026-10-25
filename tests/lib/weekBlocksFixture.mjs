/**
 * A SYNTHETIC WEEK IN THE GUIDE'S SHAPE, holding every kind of block: This
 * week (three tasks and a row with nothing to do), Why this week, After this
 * week you can, a content note, Before the session, five parts (sources,
 * reflection stops, a Choose one given out by a facilitator, a table, the
 * written answer, fill-in boxes, a checklist and a 2-minute pitch), the case
 * study in two groups, In the session, Go further and a section of the
 * guide's own.
 *
 * Every word and every address here is made up for these tests. None of it
 * is the fellow guide's text, which is partly behind sign-in, and this
 * repository is public. Addresses are on example.com and example.org, apart
 * from the two hosts the loader's link check names, which the check is
 * about.
 */

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });
const ul = (...items) => ({ type: "ul", items: items.map((runs) => ({ runs })) });
const ol = (...items) => ({ type: "ol", items: items.map((runs) => ({ runs })) });

/** The blocks, as `sanitizeWeekBlocks` reads them back: canonical, every id set. */
export function syntheticWeekBlocks() {
  return [
    {
      id: "tw-1",
      type: "thisWeek",
      rows: [
        {
          type: "task",
          what: "Parts 1 to 3 below: two shared readings, then your pack",
          time: "About 55 to 70 minutes",
          when: "before",
          covers: ["pt-1", "pt-2", "pt-3"],
        },
        {
          type: "task",
          what: "Part 4: your forecast, the week’s written answer (200 to 300 words)",
          time: "About 30 minutes",
          when: "dayBefore",
          covers: ["pt-4"],
        },
        {
          type: "task",
          what: "Your case study: a 3-minute talk on a case from your pack",
          time: "About 30 minutes",
          when: "atSession",
          covers: ["cs-1"],
        },
        {
          type: "none",
          what: "Part 5 and the pitch",
          time: "None this week",
          note: "They come back in a later week",
        },
      ],
      total: "About 2 hours",
      note: [p(run("Parts 1 to 3 are done when their sources are ticked and their boxes written in."))],
    },
    {
      id: "tx-why",
      type: "text",
      role: "why",
      heading: "Why this week",
      time: "",
      body: [
        p(
          run("Forecasts are only useful if someone checks them. This week practises "),
          run("base rates", { bold: true }),
          run(" and "),
          run("calibration", { italic: true }),
          run(", using a "),
          run("short guide", { href: "https://example.com/guide" }),
          run(". It is the heaviest week of the course: look after yourself."),
        ),
      ],
    },
    {
      id: "oc-1",
      type: "outcomes",
      heading: "After this week you can",
      items: [
        "Find a base rate for a question.",
        "Say how confident you are, as a number.",
        "Check a forecast once the answer is known.",
      ],
    },
    {
      id: "cn-1",
      type: "contentNote",
      body: [p(run("If anything this week weighs on you, talk to your facilitator, or to one of these."))],
      links: [
        { label: "A listening line", url: "https://example.org/listen", detail: "Open overnight" },
        { label: "Write to the society", url: "mailto:someone@example.com", detail: "" },
      ],
    },
    {
      id: "tx-before",
      type: "text",
      role: "before",
      heading: "Before the session",
      time: "About 70 minutes, plus your forecast",
      body: [p(run("Work through the parts in order."))],
    },
    {
      id: "pt-1",
      type: "part",
      title: "Start with a base rate",
      time: "About 20 minutes",
      framing: [p(run("Most questions have happened before, in some form."))],
      blocks: [
        {
          id: "src-1",
          type: "source",
          kind: "read",
          title: "A field guide to base rates",
          url: "https://example.com/base-rates",
          by: "Ada Example",
          date: "2024",
          time: "15 minutes",
          note: [],
        },
        {
          id: "rs-1",
          type: "reflection",
          prompts: [
            { id: "rp-1", text: "Pick a question you care about. What is its base rate?" },
            { id: "rp-2", text: "What makes your case different from the base rate?" },
          ],
        },
      ],
    },
    {
      id: "pt-2",
      type: "part",
      title: "Two ways to be wrong",
      time: "About 25 minutes",
      framing: [p(run("A talk and a short reply to it."))],
      blocks: [
        {
          id: "src-2",
          type: "source",
          kind: "watch",
          title: "Overconfidence, explained",
          url: "https://example.org/talk",
          by: "Example Lectures",
          date: "March 2025",
          time: "About 20 minutes",
          note: [run("The first half is enough.")],
        },
        { id: "rs-2", type: "reflection", prompts: [{ id: "rp-3", text: "Where were you most overconfident this year?" }] },
        {
          id: "tx-2",
          type: "text",
          role: "plain",
          heading: "",
          time: "",
          body: [ul([run("Write a number.")], [run("Write a reason.")])],
        },
      ],
    },
    {
      id: "pt-3",
      type: "part",
      title: "Your pack",
      time: "20 to 30 minutes",
      framing: [p(run("Read the pack you were given at the end of the last session."))],
      blocks: [
        {
          id: "co-1",
          type: "chooseOne",
          title: "Forecasting packs",
          givenBy: "facilitator",
          time: "",
          packs: [
            {
              id: "pk-1",
              name: "Elections",
              time: "25 minutes",
              note: [],
              sources: [
                { id: "src-3", kind: "read", title: "Polls and their errors", url: "https://example.com/polls", by: "Example Press", date: "2023", time: "", note: [] },
                { id: "src-4", kind: "listen", title: "A podcast on swing", url: "https://example.org/swing", by: "Example Radio", date: "2022", time: "", note: [run("From 10 minutes in.")] },
              ],
            },
            {
              id: "pk-2",
              name: "Markets",
              time: "About 30 minutes",
              note: [],
              sources: [
                { id: "src-5", kind: "read", title: "Prices as forecasts", url: "https://example.com/prices", by: "Example Journal", date: "2021", time: "", note: [] },
              ],
            },
            {
              id: "pk-3",
              name: "Technology",
              time: "20 minutes",
              note: [],
              sources: [
                { id: "src-6", kind: "explore", title: "A timeline tool", url: "https://openai.com/example-timeline", by: "Example Lab", date: "", time: "", note: [] },
              ],
            },
          ],
        },
        {
          id: "tx-3",
          type: "text",
          role: "plain",
          heading: "",
          time: "",
          body: [p(run("If you take markets, keep to how prices form, not to trading advice."))],
        },
        {
          id: "tb-1",
          type: "table",
          header: [{ runs: [run("Pack")] }, { runs: [run("Where to start")] }],
          rows: [
            { cells: [{ runs: [run("Elections")] }, { runs: [run("Polls", { href: "https://example.com/polls" })] }] },
            { cells: [{ runs: [run("Markets")] }, { runs: [run("A report", { href: "https://www.weforum.org/example-report" })] }] },
          ],
        },
      ],
    },
    {
      id: "pt-4",
      type: "part",
      title: "Your forecast, the week’s written answer",
      time: "About 30 minutes",
      framing: [p(run("This is the week’s written answer. Your facilitator reads it before the session."))],
      blocks: [
        {
          id: "wa-1",
          type: "writtenAnswer",
          prompt: [run("Make one forecast about your pack’s question, with a number and three reasons.")],
          guidance: [
            p(run("A strong answer names its base rate and says what would change it.")),
            p(run("Keep it: you will check it in the last week.")),
          ],
          words: { min: 200, max: 300 },
          due: "dayBefore",
        },
      ],
    },
    {
      id: "pt-5",
      type: "part",
      title: "Plan and pitch",
      time: "About 40 minutes",
      framing: [p(run("Turn what you found into a plan."))],
      blocks: [
        {
          id: "fi-1",
          type: "fillIn",
          title: "My plan",
          groups: [
            { heading: "What I’ll forecast next (one sentence)", boxes: [{ id: "fb-1", label: "" }] },
            {
              heading: "Why it matters",
              boxes: [
                { id: "fb-2", label: "The decision it helps with" },
                { id: "fb-3", label: "Who would use it" },
              ],
            },
          ],
        },
        {
          id: "ck-1",
          type: "checklist",
          items: [
            { id: "ci-1", title: "Find one forecast someone else made this year.", mirrorToMyWork: false },
            { id: "ci-2", title: "Note how it turned out.", detail: "A line is enough.", mirrorToMyWork: false },
          ],
        },
        {
          id: "cs-2",
          type: "cases",
          heading: "",
          intro: [],
          talk: { minutes: 2, name: "pitch" },
          prepare: [p(run("Prepare by answering two questions:")), ol([run("What will you forecast?")], [run("Who will check it?")])],
          givenBy: "fellow",
          groups: [],
        },
      ],
    },
    {
      id: "cs-1",
      type: "cases",
      heading: "Your case study",
      intro: [p(run("You get a case from your pack at the end of the previous session."))],
      talk: { minutes: 3, name: "talk" },
      prepare: [
        p(run("Prepare a 3-minute talk: the three questions", { bold: true })),
        ol([run("What happened?", { bold: true }), run(" Who, what and when.")], [run("What was forecast?", { bold: true })], [run("What can we learn?", { bold: true })]),
      ],
      givenBy: "facilitator",
      groups: [
        {
          name: "Elections",
          packId: "pk-1",
          cases: [
            {
              id: "ca-1",
              title: "The surprise result, 2016",
              what: [run("Most polls pointed the other way.")],
              links: [
                { label: "A summary", url: "https://example.com/surprise" },
                { label: "A review", url: "https://example.org/review" },
              ],
            },
            { id: "ca-2", title: "The close call, 2019", what: [run("A forecast within a point.")], links: [{ label: "Report", url: "https://example.com/close" }] },
          ],
        },
        {
          name: "Markets",
          packId: "pk-2",
          cases: [
            { id: "ca-3", title: "The crash nobody priced, 2008", what: [run("Prices said one thing for years.")], links: [{ label: "Overview", url: "https://openai.com/example-overview" }] },
          ],
        },
      ],
    },
    {
      id: "is-1",
      type: "inTheSession",
      body: [p(run("You’ll compare forecasts in pairs, then as a group."))],
    },
    {
      id: "gf-1",
      type: "goFurther",
      heading: "Go further (optional)",
      intro: [p(run("More for anyone who wants it."))],
      items: [
        { kind: "read", title: "Superforecasting, a summary", url: "https://example.com/super", by: "Example Reviews", date: "2020", time: "10 minutes", why: [run("The classic, in short.")] },
        {
          kind: "watchOrRead",
          title: "",
          url: "",
          by: "",
          date: "",
          time: "",
          why: [
            run("the same story told twice, in "),
            run("a video", { href: "https://example.org/video" }),
            run(" or "),
            run("an essay", { href: "https://example.com/essay" }),
            run(", about 20 minutes either way."),
          ],
        },
      ],
    },
    {
      id: "tx-next",
      type: "text",
      role: "section",
      heading: "Where to go next",
      time: "",
      body: [
        p(run("With the society.", { bold: true }), run(" Ask about next term’s groups.")),
        p(run("Reading.", { bold: true }), run(" See "), run("the reading list", { href: "https://example.com/list" }), run(".")),
      ],
    },
  ];
}

/** The week's document as Firestore holds it: the old arrays empty, the blocks set. */
export function syntheticWeekDoc(over = {}) {
  return {
    weekNumber: 3,
    title: "How sure are you?",
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks: syntheticWeekBlocks(),
    ...over,
  };
}
