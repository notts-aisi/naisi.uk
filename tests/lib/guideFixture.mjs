/**
 * A programme's Start here and Glossary IN THE FELLOW GUIDE'S OWN SHAPE, for
 * the suites about those two pages (`src/lib/courses/guide/`): the Markdown
 * a lead's export pastes, and the documents it reads into.
 *
 * Every word is made up (a fellowship about lighthouses), and every address
 * is on example.com or example.org. The shape is the guide's: a title line,
 * a date under it, an opening paragraph, `##` sections with lists and
 * tables (a table of what a week holds, a rubric whose first heading is
 * empty), a numbered list of questions with bold leads, a bold
 * "Reflections." paragraph, a `###` Support section, and a last paragraph
 * that credits where the course came from.
 */

/** The Start here Markdown a lead's export pastes. */
export const START_HERE_MARKDOWN = `# Lighthouse Fellowship: fellow guide

Mar 3, 2026

Four weeks, one evening a week by the sea. You'll learn how a light is kept, who keeps it and why it matters.

## What you'll get out of it

- Say how a lamp is lit and trimmed.
- Explain who pays for the oil, and why people disagree.

No background in the sea is needed.

## A week, step by step

Each week's page opens with a box of what to do.

| Part | What you do | Time |
| --- | --- | --- |
| Before the evening | Readings and a short film, each with why it matters | About an hour |
| The evening | Two hours together on the rocks | 2 hours |

**Reflections.** Most weeks have a short reflection stop or two. Jot a few lines for each as you go.

**Go further.** Each week ends with more to read for anyone who wants it.

## Talks

From week 2, everyone gives a short talk.

- Prepare a 3-minute talk. No slides.
- Start from the [keeper's log](https://example.com/log) and go further if you like.

Answer these three questions:

1. **What happened?** Who, what and when.
2. **Who kept the light?**
3. **One question for the group.** Something you'd like to hear argued.

## Written work and feedback

Your facilitator reads every answer before the evening.

|  | Not yet | Solid | Strong |
| --- | --- | --- | --- |
| **A clear position** | No view | A view | A view someone could argue with |
| **Reasons** | None | Some | Weighed, not just listed |

## How we behave

- **Come curious.** Nobody expects you to know this already.
- **Look after each other.** Step out whenever you need to.

### Support

If the sea is weighing on you, tell your facilitator, or write to [the society](mailto:someone@example.com).

Adapted from [Example Harbour's lighthouse course](https://example.org/course), with the evenings redesigned for a group on the rocks.
`;

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });
const cell = (...runs) => ({ runs });

/** The document `START_HERE_MARKDOWN` reads into. */
export function startHereDoc() {
  return {
    title: "Lighthouse Fellowship: fellow guide",
    lead: [p(run("Four weeks, one evening a week by the sea. You'll learn how a light is kept, who keeps it and why it matters."))],
    sections: [
      {
        heading: "What you'll get out of it",
        level: 2,
        body: [
          { type: "ul", items: [{ runs: [run("Say how a lamp is lit and trimmed.")] }, { runs: [run("Explain who pays for the oil, and why people disagree.")] }] },
          p(run("No background in the sea is needed.")),
        ],
      },
      {
        heading: "A week, step by step",
        level: 2,
        body: [
          p(run("Each week's page opens with a box of what to do.")),
          {
            type: "table",
            header: [cell(run("Part")), cell(run("What you do")), cell(run("Time"))],
            rows: [
              { cells: [cell(run("Before the evening")), cell(run("Readings and a short film, each with why it matters")), cell(run("About an hour"))] },
              { cells: [cell(run("The evening")), cell(run("Two hours together on the rocks")), cell(run("2 hours"))] },
            ],
          },
          p(run("Reflections.", { bold: true }), run(" Most weeks have a short reflection stop or two. Jot a few lines for each as you go.")),
          p(run("Go further.", { bold: true }), run(" Each week ends with more to read for anyone who wants it.")),
        ],
      },
      {
        heading: "Talks",
        level: 2,
        body: [
          p(run("From week 2, everyone gives a short talk.")),
          {
            type: "ul",
            items: [
              { runs: [run("Prepare a 3-minute talk. No slides.")] },
              { runs: [run("Start from the "), run("keeper's log", { href: "https://example.com/log" }), run(" and go further if you like.")] },
            ],
          },
          p(run("Answer these three questions:")),
          {
            type: "ol",
            items: [
              { runs: [run("What happened?", { bold: true }), run(" Who, what and when.")] },
              { runs: [run("Who kept the light?", { bold: true })] },
              { runs: [run("One question for the group.", { bold: true }), run(" Something you'd like to hear argued.")] },
            ],
          },
        ],
      },
      {
        heading: "Written work and feedback",
        level: 2,
        body: [
          p(run("Your facilitator reads every answer before the evening.")),
          {
            type: "table",
            header: [cell(), cell(run("Not yet")), cell(run("Solid")), cell(run("Strong"))],
            rows: [
              { cells: [cell(run("A clear position", { bold: true })), cell(run("No view")), cell(run("A view")), cell(run("A view someone could argue with"))] },
              { cells: [cell(run("Reasons", { bold: true })), cell(run("None")), cell(run("Some")), cell(run("Weighed, not just listed"))] },
            ],
          },
        ],
      },
      {
        heading: "How we behave",
        level: 2,
        body: [
          {
            type: "ul",
            items: [
              { runs: [run("Come curious.", { bold: true }), run(" Nobody expects you to know this already.")] },
              { runs: [run("Look after each other.", { bold: true }), run(" Step out whenever you need to.")] },
            ],
          },
        ],
      },
      {
        heading: "Support",
        level: 3,
        body: [
          p(
            run("If the sea is weighing on you, tell your facilitator, or write to "),
            run("the society", { href: "mailto:someone@example.com" }),
            run("."),
          ),
        ],
      },
    ],
    credit: [
      run("Adapted from "),
      run("Example Harbour's lighthouse course", { href: "https://example.org/course" }),
      run(", with the evenings redesigned for a group on the rocks."),
    ],
  };
}

/** The Glossary Markdown a lead's export pastes: a title, an opening line and one table. */
export const GLOSSARY_MARKDOWN = `# Glossary

The words you'll meet most, in plain words. Ask "what exactly do you mean?"

| Term | In plain words |
| --- | --- |
| Beam | The light a lamp throws, turning over the water. |
| Fresnel lens | Rings of glass that bend a lamp's light into one [narrow beam](https://example.com/fresnel). |
| Keeper | The person who keeps the light lit, *every* night. |
| Light list | The book that says which light is which, by its flashes. |
| Wick | What the oil burns on. Trim it, or it smokes. |
`;

/** The document `GLOSSARY_MARKDOWN` reads into. */
export function glossaryDoc() {
  return {
    title: "Glossary",
    lead: [p(run("The words you'll meet most, in plain words. Ask \"what exactly do you mean?\""))],
    columns: ["Term", "In plain words"],
    terms: [
      { term: [run("Beam")], definition: [run("The light a lamp throws, turning over the water.")] },
      {
        term: [run("Fresnel lens")],
        definition: [run("Rings of glass that bend a lamp's light into one "), run("narrow beam", { href: "https://example.com/fresnel" }), run(".")],
      },
      { term: [run("Keeper")], definition: [run("The person who keeps the light lit, "), run("every", { italic: true }), run(" night.")] },
      { term: [run("Light list")], definition: [run("The book that says which light is which, by its flashes.")] },
      { term: [run("Wick")], definition: [run("What the oil burns on. Trim it, or it smokes.")] },
    ],
    after: [],
  };
}
