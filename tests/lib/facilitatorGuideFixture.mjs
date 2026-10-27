/**
 * SYNTHETIC FACILITATOR MATERIAL IN THE COURSE DOCS' EXPORT SHAPE, for the
 * facilitator guide's suites: a session plan, a week's notes, a handbook with
 * its byline and a template, a case-studies page, printables with templates
 * and a table, and a week of the fellow guide to hold the two loaders apart.
 *
 * Every word and every address here is made up for these tests, about a
 * made-up course on reading the weather. None of it is the course docs'
 * text: the course material is not in this repository, which is public, and
 * facilitator material is never shown to anybody taking part. Only the
 * headings that tell the kinds of document apart (documented in
 * `docs/course-facilitator-guide.md`) are the export's own. Addresses are on
 * example.com and example.org.
 */

/** Week 3's session plan: At a glance with things to take along, a run sheet, two options, If it goes differently. */
export const PLAN_W3 = `# Session 3: Reading the sky

## At a glance

**Aims.** Each person leaves with a rain forecast for Friday and one reason for it.

**Ready beforehand.** Week 3's two readings and the pressure chart, around an hour.

**Take along.**

- [ ] One cloud atlas per pair (Printables)
- [ ] Pens in blue and green
- [ ] Next week's case slips in an envelope

**Room.** Put the question "Umbrella on Friday?" on the whiteboard.

## Run sheet

| Time | What happens | What you do |
| --- | --- | --- |
| 0:00 to 0:15 | Settle in | Ask the whiteboard question around the circle. |
| 0:15 to 0:25 | Warm-up | Vote with thumbs on Friday's rain. |
| 0:25 to 0:55 | Cases | Each case gets three minutes and one question. |

## Main activity (40 minutes)

### Option A: Looking out

Pairs stand at the window and agree on a percentage.

1. Pairs, 15 minutes: agree a percentage for Friday.
2. Everyone, 10 minutes: line the percentages up on the wall.

### Option B: Cloud snap

A card game for groups who like to move. Skim [the snap rules](https://example.com/snap) beforehand.

1. Shuffle and deal.
2. Two rounds, then swap partners.

## If it goes differently

- **Nobody opened the chart.** Use Option A, which needs nothing read.
- **Short on time.** Cut the warm-up to five minutes.
`;

/** Week 3's notes: the point of the week, questions with a link, an answer quoted for comparison, a table. */
export const NOTES_W3 = `# Week 3 notes: Reading the sky

## The point of the week

Turning "might rain" into a percentage makes a forecast something you can score later.

## Questions that come up

- **Two apps say different things. Which is right?** Each app trusts its own model ([a short guide](https://example.org/models)).
- **It said 60% and stayed dry. Was it wrong?** One dry day proves nothing either way.

## A strong answer, for comparison

Here is an answer worth showing the group:

> 65% for rain by Friday lunchtime: the barometer has dropped two days running.
>
> I'd change my mind if the wind swung back to the east.

| Part | Looks like |
| --- | --- |
| Number | A percentage |
| Reason | One sign you can point to |
`;

/** A course document: the handbook, with the export's byline, a template in a code block and a checklist. */
export const HANDBOOK = `# Weather Fellowship: facilitator guide

Oct 25, 2026 · @ada example

What a facilitator does from week to week, in one place.

## First things

- [ ] Read session 1's plan the evening before.
- [ ] Find your room on the map and try the door.

A welcome note to send your group:

\`\`\`markdown
Hello everyone, I'll be running our group this term.
   Have a look at week 1 before we meet on Thursday.
\`\`\`

**Who to ask.** Your lead for anything about the group; an admin for anything urgent; someone@example.com otherwise.
`;

/** A course document: case studies and feedback, with a table of levels. */
export const CASE_STUDIES = `# Case studies and feedback

## A case round

Each person has three minutes on their case, then the group asks one question.

| Level | Sounds like |
| --- | --- |
| Not yet | No percentage at all |
| Solid | A percentage with a reason |
| Strong | A percentage, two reasons and what would change it |
`;

/** A course document: printables, a template kept to the character and a table of cards. */
export const PRINTABLES = `# Printables

Cut along the dotted lines. Print on card if you can.

## Session 1: forecast slip

\`\`\`markdown
FRIDAY FORECAST                 Name: ____________

Chance of rain:  ____%
\`\`\`

## Session 2: cloud cards

| Card | Cloud |
| --- | --- |
| 1 | Cumulus |
| 2 | Stratus |
`;

/** A course document: how to use these plans, with the export's byline of a date alone. */
export const HOW_TO_USE = `# Weather Fellowship: session plans

Oct 25, 2026

Each plan below fills one evening of two hours.

## The pattern of an evening

| Time | Part |
| --- | --- |
| 0:00 to 0:15 | Settle in |
`;

/** Week 1's session plan, a second week for the course page's list. */
export const PLAN_W1 = `# Session 1: First look

## At a glance

**Aims.** Every name is said aloud twice.

## Run sheet

| Time | What happens |
| --- | --- |
| 0:00 to 0:10 | Name game |
`;

/** A week of the fellow guide: what people taking part read. Never facilitator material. */
export const FELLOW_WEEK_3 = `# Week 3: Reading the sky

## This week

| Do this | Time | When |
| --- | --- | --- |
| Parts 1 and 2 below | About 40 minutes | Before session 3 |
| **In all** | **About 40 minutes** |  |

## Why this week

A percentage can be checked; a feeling can't.

After this week you can:

- Put a percentage on Friday's rain.

## Before the session (about 40 minutes)

### Part 1: Clouds (about 20 minutes)

1. **Read:** ["Clouds"](https://example.com/clouds), Ada Example, 2024. 20 minutes.

### Part 2: Pressure (about 20 minutes)

1. **Read:** ["Pressure"](https://example.org/pressure), Ada Example, 2024. 20 minutes.

## In the session

You'll line up your percentages.

## Go further (optional)

- **Read:** ["More clouds"](https://example.com/more), Example Press, 2020. 10 minutes. A longer read.
`;

/**
 * The tab over every session's plan, with what it sums up of all of them in
 * a table. Loaded only by the suites that ask for it, so the course page of
 * `GUIDE_SEED` stays as it was drawn.
 */
export const SESSIONS = `# Sessions

One plan per evening, in the tabs under this one.

## At a glance

| Evening | To open | What we do | To print |
| --- | --- | --- | --- |
| 1. First look | Names round the room | A: Cloud walk · B: Barometer race | Forecast slips |
| 3. Reading the sky | The pressure line | A: Looking out · B: Chart swap | Cloud atlases |
`;

/** The tab over every week's notes, with each week's idea and the question to expect. */
export const WEEK_NOTES = `# Week notes

What each evening is for, in the tabs under this one.

## At a glance

| Week | The idea | The question to expect |
| --- | --- | --- |
| 1. First look | A forecast is a number with a reason | "Isn't it just a guess?" |
| 3. Reading the sky | Pressure moves before the clouds do | "Why not look at an app?" |
`;

/** Every document a suite loads, by the slot it goes in. */
export const GUIDE_SEED = [
  ["how-to-use", HOW_TO_USE],
  ["handbook", HANDBOOK],
  ["case-studies", CASE_STUDIES],
  ["printables", PRINTABLES],
  ["w01-plan", PLAN_W1],
  ["w03-plan", PLAN_W3],
  ["w03-notes", NOTES_W3],
];
