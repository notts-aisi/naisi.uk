/**
 * A SYNTHETIC WEEK IN THE GUIDE'S SHAPE, holding every kind of block: This
 * week (three tasks, a row with nothing to do and an optional row), Why this
 * week, After this week you can, a content note, Before the session, five
 * parts (sources, one with words before its title and one notebook,
 * reflection stops, a Choose one of packs given out by a facilitator with
 * questions to read them against, a table, the written answer, a Choose one
 * from a list picked by each person, fill-in boxes, a checklist and a
 * 2-minute pitch), the case study in two groups with a content note on one
 * case, In the session with what to do before you come, Go further, a
 * section of the guide's own with a table, and the hands-on route with code.
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
const cell = (...runs) => ({ runs });

/** A source with every field set, `over` replacing some. */
function source(id, over) {
  return { id, type: "source", kind: "read", lead: "", title: "", url: "", by: "", date: "", time: "", compute: "", note: [], ...over };
}

/** A Go further item with every field set. */
function further(over) {
  return { kind: "read", lead: "", title: "", url: "", by: "", date: "", time: "", compute: "", why: [], ...over };
}

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
          whenText: "Before session 3",
          covers: ["pt-1", "pt-2", "pt-3"],
        },
        {
          type: "task",
          what: "Part 4: your forecast, the week’s written answer (200 to 300 words)",
          time: "About 30 minutes",
          when: "dayBefore",
          whenText: "To your facilitator by the end of the day before session 3",
          covers: ["pt-4"],
        },
        {
          type: "task",
          what: "Your case study: a 3-minute talk on a case from your pack",
          time: "About 30 minutes",
          when: "atSession",
          whenText: "At session 3",
          covers: ["cs-1"],
        },
        {
          type: "none",
          what: "Part 5 and the pitch",
          time: "None this week",
          note: "They come back in a later week",
        },
        {
          type: "optional",
          what: "Hands-on route (optional, for coders)",
          time: "An hour or more",
          note: "Any time; not counted in the total",
        },
      ],
      total: "About 2 hours",
      note: [],
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
        source("src-1", {
          title: "A field guide to base rates",
          url: "https://example.com/base-rates",
          by: "Ada Example",
          date: "2024",
          time: "15 minutes",
        }),
        source("src-7", {
          lead: "section 2, “Counting”, of",
          title: "The forecaster’s handbook",
          url: "https://example.org/handbook",
          by: "Example Press",
          date: "2023",
          time: "5 minutes",
          note: [run("Only the first table.")],
        }),
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
        source("src-2", {
          kind: "watch",
          title: "Overconfidence, explained",
          url: "https://example.org/talk",
          by: "Example Lectures",
          date: "March 2025",
          time: "About 20 minutes",
          note: [run("The first half is enough.")],
        }),
        source("src-8", {
          kind: "notebook",
          title: "Score your own forecasts",
          url: "https://example.com/notebook",
          by: "Example Lab",
          time: "About 10 minutes",
          compute: "Runs on a free notebook service",
        }),
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
          form: "table",
          title: "Pack",
          givenBy: "facilitator",
          kind: "read",
          time: "",
          noteHeading: "",
          questions: [
            ul(
              [run("Base rate:", { bold: true }), run(" what has happened before?")],
              [run("Change:", { bold: true }), run(" what is different now?")],
            ),
          ],
          packs: [
            {
              id: "pk-1",
              name: "Elections",
              time: "25 minutes",
              note: [],
              read: [
                run("Example Press, "),
                run("“Polls and their errors”", { href: "https://example.com/polls" }),
                run(" (2023), and Example Radio, "),
                run("“A podcast on swing”", { href: "https://example.org/swing" }),
                run(" (2022), from 10 minutes in"),
              ],
            },
            {
              id: "pk-2",
              name: "Markets",
              time: "About 30 minutes",
              note: [],
              read: [run("Example Journal, "), run("“Prices as forecasts”", { href: "https://example.com/prices" }), run(" (2021)")],
            },
            {
              id: "pk-3",
              name: "Technology",
              time: "20 minutes",
              note: [],
              read: [run("Example Lab, "), run("“A timeline tool”", { href: "https://openai.com/example-timeline" })],
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
          header: [cell(run("Pack")), cell(run("Where to start"))],
          rows: [
            { cells: [cell(run("Elections")), cell(run("Polls", { href: "https://example.com/polls" }))] },
            { cells: [cell(run("Markets")), cell(run("A report", { href: "https://www.weforum.org/example-report" }))] },
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
          prompt: [
            p(run("Will your pack’s question come true by next year?", { bold: true })),
            ol([run("Give a number.")], [run("Give three reasons, from your pack.")]),
          ],
          boxes: [],
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
          id: "co-2",
          type: "chooseOne",
          form: "list",
          title: "one short guide that fits you",
          givenBy: "fellow",
          kind: "read",
          time: "10 to 15 minutes",
          noteHeading: "",
          questions: [],
          packs: [
            { id: "pk-4", name: "Forecasting at work", time: "", note: [run("if you like numbers")], read: [run("Forecasting at work", { href: "https://example.com/work" })] },
            { id: "pk-5", name: "Forecasting in public", time: "", note: [run("if you like writing")], read: [run("Forecasting in public", { href: "https://example.org/public" })] },
          ],
        },
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
          groupLabel: "",
          startLabel: "Start here",
          groups: [],
          note: [],
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
      groupLabel: "Pack",
      startLabel: "Start here",
      groups: [
        {
          name: "Elections",
          packId: "pk-1",
          cases: [
            {
              id: "ca-1",
              title: "The surprise result, 2016",
              what: [run("Most polls pointed the other way.")],
              start: [run("A summary", { href: "https://example.com/surprise" }), run(" (2 min) and "), run("a review", { href: "https://example.org/review" })],
              contentNote: "",
            },
            {
              id: "ca-2",
              title: "The close call, 2019",
              what: [run("A forecast within a point.")],
              start: [run("Report", { href: "https://example.com/close" })],
              contentNote: "The sources quote abusive posts: talk to your facilitator before you take this one.",
            },
          ],
        },
        {
          name: "Markets",
          packId: "pk-2",
          cases: [
            {
              id: "ca-3",
              title: "The crash nobody priced, 2008",
              what: [run("Prices said one thing for years.")],
              start: [run("Overview", { href: "https://openai.com/example-overview" })],
              contentNote: "",
            },
          ],
        },
      ],
      note: [p(run("If a case weighs on you, swap it."))],
    },
    {
      id: "is-1",
      type: "inTheSession",
      body: [p(run("You’ll compare forecasts in pairs, then as a group."))],
      beforeYouCome: [p(run("Before you come (about 5 minutes).", { bold: true }), run(" Bring your number on a slip of paper."))],
    },
    {
      id: "gf-1",
      type: "goFurther",
      heading: "Go further (optional)",
      intro: [p(run("More for anyone who wants it."))],
      items: [
        further({
          title: "Superforecasting, a summary",
          url: "https://example.com/super",
          by: "Example Reviews",
          date: "2020",
          time: "10 minutes",
          why: [run("The classic, in short.")],
        }),
        further({
          kind: "watchOrRead",
          why: [
            run("the same story told twice, in "),
            run("a video", { href: "https://example.org/video" }),
            run(" or "),
            run("an essay", { href: "https://example.com/essay" }),
            run(", about 20 minutes either way."),
          ],
        }),
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
        {
          type: "table",
          header: [cell(run("Route")), cell(run("What it is"))],
          rows: [
            { cells: [cell(run("A reading group", { href: "https://example.org/group" })), cell(run("Weekly, in person"))] },
            { cells: [cell(run("A summer project", { href: "https://example.com/summer" })), cell(run("Ten weeks, paid"))] },
          ],
        },
      ],
    },
    {
      id: "ho-1",
      type: "handsOn",
      heading: "Hands-on route (optional, for coders)",
      body: [
        p(run("Score a forecast in code. It runs on a free notebook service.")),
        ul([run("Score it yourself:", { bold: true }), run(" "), run("a short exercise", { href: "https://example.com/score" }), run(", about an hour.")]),
        { type: "code", lang: "python", text: "def brier(p, outcome):\n    return (p - outcome) ** 2\n\nprint(brier(0.7, 1))" },
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

/**
 * A week IN THE GUIDE'S OWN SHAPE, as its export pastes (board pr-weeks,
 * Option B): no ids; the This week table in the guide's own "when" words; a
 * time in brackets after each heading; numbered source lines; Reflect with
 * its prompts as a list; packs from a table; the written answer's range in
 * its part's heading and its send line; the case study as one table with a
 * pathway column; Go further; and "the week's one exercise" and "the Start
 * here tab" where the guide says them. No content note and no In the
 * session, so the checks have something to say. Made-up words throughout
 * (see the module comment).
 */
export function syntheticGuideMarkdown() {
  return `# Week 3: How sure are you?

## This week

| Do this | Time | When |
| --- | --- | --- |
| Parts 1 to 3 below: two shared readings, then your pack | About 55 to 70 minutes | Before session 3 |
| Part 4: your forecast, the week's one exercise (200 to 300 words) | About 30 minutes | To your facilitator by the end of the day before session 3 |
| Your case study: a 3-minute talk on a case from your pack | About 30 minutes | At session 3 |
| Hands-on route (optional, for coders) | An hour or more | Any time; not counted in the total |
| **In all** | **About 2 hours** |  |

## Why this week

Forecasts are only useful if someone checks them. It's the heaviest week of the course: look after yourself, and talk to your facilitator if anything weighs on you.

After this week you can:

- Find a base rate for a question.
- Say how confident you are, as a number.
- Check a forecast once the answer is known.

## Before the session (about 70 minutes, plus your forecast)

Everyone does parts 1 and 2. In part 3 you read one pack. Part 4 is the week's one exercise.

### Part 1: Start with a base rate (about 20 minutes)

Most questions have happened before, in some form.

1. **Read:** ["A field guide to base rates"](https://example.com/base-rates), Ada Example, 2024. 15 minutes.
2. **Read:** section 2, "Counting", of ["The forecaster's handbook"](https://example.org/handbook), Example Press, 2023. 5 minutes. Only the first table.

**Reflect**

- Pick a question you care about. What is its base rate?
- What makes your case different?

### Part 2: Two ways to be wrong (about 25 minutes)

1. **Watch:** ["Overconfidence, explained"](https://example.org/talk), Example Lectures, March 2025. About 20 minutes. The first half is enough.

**Reflect**

- Where were you most overconfident this year?

### Part 3: Your pack (20 to 30 minutes)

Read the pack you chose or were given at the end of session 2. Read it against these:

- **Base rate:** what has happened before?
- **Change:** what is different now?

| Pack | Read | Time |
| --- | --- | --- |
| Elections | Example Press, ["Polls and their errors"](https://example.com/polls) (2023), and Example Radio, ["A podcast on swing"](https://example.org/swing) (2022) | 25 minutes |
| Markets | Example Journal, ["Prices as forecasts"](https://example.com/prices) (2021) | About 30 minutes |
| Technology | Example Lab, ["A timeline tool"](https://openai.com/example-timeline) | 20 minutes |

If you take markets, keep to how prices form, not to trading advice.

### Part 4: Your forecast, the week's written answer (200 to 300 words)

This is the week's one exercise. Your facilitator reads it before the session and gives feedback using the rubric on the Start here tab.

**Will your pack's question come true by next year?**

1. Give a number.
2. Give three reasons, from your pack.

A strong answer names its base rate and says what would change it.

Send it to your facilitator by the end of the day before your session.

## Your case study

You'll get a case from your pack at the end of session 2.

| Pack | Case | What happened | Start here |
| --- | --- | --- | --- |
| Elections | The surprise result, 2016 | Most polls pointed the other way. | [A summary](https://example.com/surprise) (2 min) and [a review](https://www.weforum.org/review) |
| Elections | The close call, 2019 | A forecast within a point. The sources quote abusive posts: talk to your facilitator before you take this one. | [Report](https://example.com/close) |
| Markets | The crash nobody priced, 2008 | Prices said one thing for years. | [Overview](https://example.com/overview) |

If a case weighs on you, swap it.

## Go further (optional)

Extra reading for anyone who wants more.

- **Read:** ["Superforecasting, a summary"](https://example.com/super), Example Reviews, 2020. 10 minutes. The classic, in short.
- **Watch or read:** the same story told twice, in [a video](https://example.org/video) or [an essay](https://example.com/essay), about 20 minutes either way.

## Hands-on route (optional, for coders)

Score a forecast in code. It runs on a free notebook service.

\`\`\`python
def brier(p, outcome):
    return (p - outcome) ** 2
\`\`\`
`;
}
