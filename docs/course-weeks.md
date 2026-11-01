# Course weeks: blocks and their Markdown

A week of a course run is an ordered list of blocks, stored on the week's
document as `CourseWeekDoc.blocks`. A week is written, loaded, copied and
pasted back as Markdown in the fellow guide's own shape. This file is the
contract between four things that must agree: the guide's export, what an
admin pastes into the run's week editor, what "Copy as Markdown" writes, and
the code that reads and writes it.

| Where | What it does |
| --- | --- |
| `src/lib/courses/weekBlocks/model.ts` | The blocks, the read side (`sanitizeWeekBlocks`) and the check (`weekBlocksProblems`) |
| `src/lib/courses/weekBlocks/prose.ts` | Text inside blocks: runs with bold, italic and links, as data |
| `src/lib/courses/weekBlocks/limits.ts` | Every cap, spread into `COURSE_FIELD_LIMITS` |
| `src/lib/courses/weekBlocks/markdownRead.ts` | Markdown to blocks |
| `src/lib/courses/weekBlocks/markdownWrite.ts` | Blocks to Markdown ("Copy as Markdown") |
| `src/lib/courses/weekBlocks/merge.ts` | Ids kept across a paste, and what points at what |
| `src/lib/courses/weekBlocks/paste.ts` | A paste, read whole: the one way from Markdown to blocks |
| `src/lib/courses/weekBlocks/found.ts` | "What we found" and "things to check" |
| `src/lib/courses/weekBlocks/reader.ts` | The one reader of a week's sources, answers and checklist, for both shapes |
| `src/lib/courses/weekBlocks/due.ts` | When work is due, for one group, from its own calendar |

## Two shapes of week

A week written before blocks existed has no `blocks` key at all. It reads
and draws exactly as it always has, from its guide, materials, exercises and
checklist. A week with `blocks` (a list, even an empty one) is a block week:
what its people read, tick and answer is in the blocks, and the old arrays
are not drawn for it. `isBlockWeek` is the one test.

Every server reader that asks what a week holds asks `reader.ts`, which
answers for both shapes. Every copy of a whole week (a template, a run's copy
forward, a group's copy, renumbering) carries the blocks through
`weekBlocksField`; a test walks the tree for a whole-week copy that does not.

## The round trip

What the writer writes, pasted back, is the same week with the same ids:
`readPastedWeek(weekToMarkdown(week))` gives back `week`, and copying what
was read writes the same text again. The format suite holds this for a
synthetic week with every kind of block in it. Two things make it hold:

- every id is written at the end of the line that opens its block or item,
  or on a line of its own just before a block that has no line of its own
  (plain text, a table);
- every character Markdown would read as markup is escaped, and two lists
  that meet change their marker (`-` then `*`, `1.` then `1)`) so they read
  back as two lists.

## Ids

Every block, and every thing a person answers or ticks inside one (a source,
a reflection prompt, a pack, a case, a fill-in box, an answer box, a
checklist item), has an id: letters, digits, `-` and `_`, at most 48, never
holding `__`. Ticks, answers and per-person records key on them, so they
survive every copy.

```
### Part 2: Two views (about 40 minutes) {#pt-k3j9x2ab4c}

1. **Read:** [A hopeful view](https://example.com/hopeful), Ada Example, 2025. 20 minutes. {#src-0m2kq81bza}

{#tx-b81kd03mxa}

A paragraph with no line of its own carries its id on the line before it.
```

When a week is pasted:

- an id the stored week has, on the same kind of thing, is kept, wherever the
  thing has moved to;
- an id the stored week does not have, an id on a different kind of thing,
  or the second use of one id, gets a fresh id, so a paste can never point
  one person's answers at somebody else's question;
- a line with no id gets a fresh one;
- whatever the stored week has that the paste does not is listed, and the
  loader counts the answers on it. When any would go it says how many and
  saves only once that is confirmed.

## Ready and Published

`published` means the week's people can open it. `ready` means the
programme's lead has marked the week ready: week 1 opens to everyone who holds
a place once it is ready (Q35), before groups go out. Ready counts only on a
published week (`normalizeCourseWeek` reads `ready` as false otherwise), so
taking a week down takes its Ready with it. Marking a week ready publishes it
in the same write (Zach, 26 October 2026), so the lead needs nobody else to
open a week they have finished; a week with nothing in it cannot be marked.
"Not ready" takes back the mark alone and leaves Published as it is. A copy of a week never carries
Ready, as it never carries `pitching`: each run's lead marks their own. No
browser write may change it.

## When work is due

A block names only its rule: before the session, the day before it, or at
it (`When`). The moment is each group's, from the group's own calendar
(`dueMoment`). "The day before" is read by the course's setting
(`CourseDoc.dayBeforeDueTime`, in the course's details): a London time on the
day before, such as 12:00, or none, for by the end of that day. When the
group's session is cancelled, the work is due by the same rule before the
group's next session. Work first sent after the moment shows as Late to the
group's facilitators, the lead and admins, and to nobody else.

A week LOCKS when its person submits it, or when the group's session that
week starts (the "before" rule's moment), whichever comes first; the people
running the group can reopen it for one person. The week page says until
when under the title. See "The week you submit" in `docs/courses-ops.md` and
`src/lib/courses/weekWork/`.

The loader says when the Markdown's words ("by noon the day before") and the
course's setting disagree. The site goes by the setting.

## The Markdown, section by section

The examples here are made up. Headings are matched on their words, in any
case; an id may follow any heading.

### Title

```
# Week 3: How sure are you?
```

The number must be the week being loaded; the loader refuses another week's
Markdown.

### This week

```
## This week

| Do this | Time | When |
| --- | --- | --- |
| Parts 1 to 3 below: two readings, then your pack | About 55 to 70 minutes | Before session 3 |
| Part 4: your forecast, the week's written answer (200 to 300 words) | About 30 minutes | To your facilitator by the end of the day before session 3 |
| Your case study: a 3-minute talk | About 30 minutes | At session 3 |
| Case study and written question | None this week | You'll draw your first case at the end of session 1 |
| Hands-on route (optional, for coders) | An hour or more | Any time; not counted in the total |
| **In all** | **About 2 hours** |  |
```

- A row's "When" reads as one of the three rules: "day before" is the day
  before; "at session" or "in the session" is at it; "before" or "bring it"
  is before. The guide's own words are kept as written.
- "None this week" is a row with nothing to do. "Not counted" makes a row
  optional: outside In all, never counted.
- What a task covers is worked out from its words once the ids are settled:
  "Part 4", "Parts 1 to 3", "Parts 1 and 2", "the three parts below" (every
  part), "your case study", "the written answer", a talk or pitch a part
  prepares, and "Get ready" or "Before you come" (In the session). A part's
  sources, reflection stops and checklist items are covered through their
  part. A task that names nothing it covers is listed to check.

### Why this week, and After this week you can

```
## Why this week

A first look at the questions the course asks.

After this week you can:

- Find a base rate for a question.
- Say how confident you are, as a number.
```

The outcomes may also be a heading of their own (`### After this week you
can`). The public course pages show Why this week and the outcomes.

### Content note

Added on the site, not in the guide's export. Its body, then its support
links as a list:

```
## Content note

If anything this week weighs on you, talk to your facilitator, or to one of these.

- [A listening line](https://example.org/listen): Open overnight
- [Write to the society](mailto:someone@example.com)
```

### Before the session, and the parts

```
## Before the session (about 70 minutes, plus your forecast)

Everyone does parts 1 and 2.

### Part 1: Start with a base rate (about 20 minutes)

Most questions have happened before, in some form.

1. **Read:** ["A field guide to base rates"](https://example.com/base-rates), Ada Example, 2024. 15 minutes.
2. **Read:** section 2, "Counting", of ["The handbook"](https://example.org/handbook), Example Press, 2023. 5 minutes. Only the first table.
3. **Notebook:** ["Score your own forecasts"](https://example.com/notebook), Example Lab. About 10 minutes. Runs on a free notebook service.

**Reflect**

- Pick a question you care about. What is its base rate?
- What makes your case different?
```

- A part's brackets hold its time, or for the written answer's part its word
  range ("250 to 350 words").
- A source line opens with its kind in bold: Read, Watch, Listen, Watch or
  listen, Watch or read, Explore, Notebook. Words before the link are its
  lead. After the link: who, and when, then the time, then a note. A
  notebook's "Runs on ..." or "Needs ..." sentence is what it needs to run.
  Only a notebook has one: on any other kind such a sentence is part of the
  note, where it stays, and a copy of the week writes what a notebook needs
  for a notebook alone, so a week copied out and pasted back is the same week.
  Every source is a link (Q36), an `https://` one; a source with no link of
  its own carries its links in its note.
- Reflect, then one or two prompts as a list, is one reflection stop.
  Another Reflect starts another stop.
- Paragraphs between the blocks of a part stay where they are, as text.

### Choose one: packs from a table

```
Read the pack you chose or were given at the end of session 2. Read it against these:

- **Base rate:** what has happened before?
- **Change:** what is different now?

| Pack | Read | Time |
| --- | --- | --- |
| Elections | Example Press, ["Polls and their errors"](https://example.com/polls) (2023), and Example Radio, ["A podcast"](https://example.org/swing) (2022) | 25 minutes |
| Markets | Example Journal, ["Prices as forecasts"](https://example.com/prices) (2021) | About 30 minutes |
```

- Each row is one pack: its name, what to read as written (as many links as
  it has) and one time. A pack is ticked as one. An extra column after the
  name ("In one line") is the pack's note.
- A list straight before the table is the questions to read every pack
  against.
- Who settles which pack a person has (Q32): "Choose one" or "pick one" with
  no word of choosing earlier or being given is each person's pick on the
  site; anything else ("the one you chose at session 2", "you'll be given")
  is a facilitator's draw, typed into the group page.
- Copied out, a Choose one opens with a line saying so: `**Choose one** ·
  given out by your facilitator` or `· picked by each person`.

### Choose one: options in a list

```
2. **Read:** one short guide that fits you, 10 to 15 minutes:
   - [Forecasting at work](https://example.com/work), if you like numbers
   - [Forecasting in public](https://example.org/public), if you like writing
```

A source line ending in a colon, with linked options under it, is a Choose
one picked by each person. Each option is a pack.

### Tables

A table inside a part, other than a table of packs or cases, is a Table
block. A table inside a section's text stays in that text.

### The written answer

The guide's shape: the part's heading names the week's written answer (or
written piece), and its brackets the word range.

```
### Part 4: Your forecast, the week's written answer (200 to 300 words)

**Will your pack's question come true by next year?**

1. Give a number.
2. Give three reasons, from your pack.

A strong answer names its base rate and says what would change it.

Send it to your facilitator by the end of the day before your session.
```

- The paragraphs after the heading, up to the question, stay the part's
  framing; the question runs to the guidance, which starts "A strong answer"
  (or "A strong memo", "A strong plan"). The send line is left out: the site
  says when and to whom, from the due rule and the group.
- With no word range, the question's last numbered list of bold headings is
  the answer's boxes, sent together (a one-page plan):
  `1. **What I bring:** your subject, skills, and anything you've made.`
- Copied out, it opens with its own line:
  `**Written answer** · 200 to 300 words · due by the end of the day before the session`.

What each person writes in it, who reads it and "Late" are
`src/lib/courses/writtenAnswers/`: `access.ts` is the one gate and `model.ts`
the stored fields. It is sent by submitting the week, which also locks it,
and its readers read its words only once the week is submitted or locked
(`workIsReadable`, `src/lib/courses/weekWork/model.ts`). Feedback on it is a
signed comment (`src/lib/courses/feedback/`, "Feedback" in
`docs/courses-ops.md`); the course's rubric (`src/lib/courses/rubric.ts`)
is guidance for writing, and no level of it goes back to the person. Admins
and the programme's lead may also rate it for the team, from 1 to 10 with a
comment the person never sees (`src/lib/courses/workRatings/`, "Ratings for
the team" in `docs/courses-ops.md`). The answer keeps the block's id, so a
paste that keeps the id keeps everybody's answers to it.

### Fill-in boxes, a checklist and a talk

- Fill-in boxes: the guide's code block template, numbered headings and
  labelled blanks, read as headings and boxes; copied out as
  `**Fill in: My plan**` and a numbered list, each box with its id. On the
  week page each box saves as the person types, as a row of their own
  (`courseExerciseResponses`, kind `fillIn`, keyed on the box's id), read by
  the people the line under the boxes names; a part with boxes is done when
  every box holds something.
- A checklist: in a part with nothing to read or answer, its bullets are
  steps to tick; copied out as `**Checklist**` and `- [ ]` items. Each step
  is ticked as a week's checklist item always has been (the person's own
  progress row of the checklist kind, keyed on the step's id).
- A talk inside a part: a part titled for a pitch or talk ("Your 2-minute
  pitch") is a talk to get ready for, its "Prepare ..." paragraph and list
  how to prepare; copied out as `**Talk:** a 2-minute pitch · picked by each
  person`.

### Your case study

```
## Your case study

You'll get a case from your pack at the end of session 2.

| Pack | Case | What happened | Start here |
| --- | --- | --- | --- |
| Elections | The surprise result, 2016 | Most polls pointed the other way. | [A summary](https://example.com/surprise) (2 min) |
| Elections | The close call, 2019 | A forecast within a point. The sources quote abusive posts: talk to your facilitator before you take this one. | [Report](https://example.com/close) |

If a case weighs on you, swap it.
```

- An optional first column groups the cases ("Pathway", "Pack"); a group
  with a pack's name points at that pack. Groups may instead be headings
  over tables of their own.
- A content note on one case is written into "What happened": a sentence
  telling the person to talk to their facilitator before taking it, or
  "Content note: ...". It is kept apart from what happened, and that case
  stays out of the draw.
- The talk is named in This week ("a 3-minute talk") or in a "Prepare ..."
  paragraph, which starts how to prepare. Copied out, the case study opens
  with `**Talk:** a 3-minute talk · given out by your facilitator`.

### In the session

```
## In the session

You'll compare forecasts in pairs, then as a group.

**Before you come (about 5 minutes).** Bring your number on a slip of paper.
```

The paragraph that starts "Before you come" and what follows it are what to
do before the session, kept as written.

When "Before you come" says people are paired ("Your facilitators pair you
up"), the week asks for pairs (`pairsAskOf` in
`src/lib/courses/pairs/model.ts`), and asks who is bringing a laptop when the
same words name one. The group's facilitators pair people on the pairs page,
and each person's week page shows their own pair under these words. Nothing
in the Markdown changes: the words decide. See `docs/courses-ops.md`, "Pairs
for a session in pairs".

### Go further, and the hands-on route

```
## Go further (optional)

Extra reading for anyone who wants more.

- **Read:** ["A summary"](https://example.com/super), Example Reviews, 2020. 10 minutes. The classic, in short.
- **Watch or read:** the same story told twice, in [a video](https://example.org/video) or [an essay](https://example.com/essay).

## Hands-on route (optional, for coders)

Score a forecast in code.
```

- Go further's items are its last list; it is never on the path and never
  counted.
- The hands-on route keeps everything under its heading as written: lists,
  links and code blocks, every character. It is outside This week's total.

### Any other section

A section with a heading of its own ("Where to go next") is kept as text:
paragraphs, lists and tables, as written.

### A section of routes

A section holding a table whose first column is Route (Technical AI
Safety's week 6, "Where to go next") is a section of routes
(`isRoutesSection` in `src/lib/courses/routes/model.ts`). It is read and
copied as any other section, so the round trip is the same. On the week
page, once the run's course has its routes and deadlines as a record
(`CourseDoc.routes`, set by an admin in the course's details: see
`docs/courses-ops.md`, "Routes and deadlines"), the section shows that list
in place of what the guide wrote under its heading, each route past its
deadline saying so. Until then it shows the guide's tables as written.

The record is written in the same shape, read by its own reader
(`src/lib/courses/routes/markdown.ts`) with the week's text reading:

```
Checked on 25 October 2026. Dates change, so check each route's own page.

**Part-time, alongside a degree**

| Route | What it is | Who it suits | Deadline | Next round |
| --- | --- | --- | --- | --- |
| [A sprint](https://example.com/sprint) | Five weeks, remote. | Anyone who codes | 1 November 2026 | Monthly |
| [A workshop](https://example.org/workshop) | Online, any time. | | Rolling | |

**Funding:** words after the last table are kept as written.
```

- The first line is the day they were checked. A table's first column is
  Route, its name as one https link; What it is follows; Who it suits,
  Deadline (a day, or Rolling, or empty) and Next round are written where a
  table's routes use them.
- Between two tables there is only the next group's heading, in bold.

## Text inside blocks

Bold, italics, links, bullet and numbered lists, tables and code blocks are
kept as data, never as markup, and drawn as elements and text. A link is
`https://` or `mailto:`; any other link is kept as words and said. Pictures
and HTML are left out and said. Nothing is cut short: a field longer than its
cap is named, with the cap, and the week is not saved until it fits.

## What the loader says

After "Read it" the loader shows:

- **What we found**: one row per section in the board's order, each found,
  missing, or to check, with a short count ("1 source, 1 reflection stop").
- **Things to check**, in the board's words, none of which stops a save: no
  In the session section; a week Why this week calls heavy with no content
  note; lines that call the written answer "the week's one exercise" or point
  to "the Start here tab"; links a link checker cannot read (they work in a
  browser); a This week task that names nothing it covers; packs with one
  time each where each holds several sources; anything left out.
- **What stops a save**: another week's Markdown, a source with no https
  link, a Reflect with no prompt or more than two, a field over its cap, an
  id used twice, and the rest of the check, each in a sentence that says what
  to change.

## What never goes in a week

Anyone who can open a week can read every block in it. Facilitator material
(session plans, facilitator guides, answer keys, printables) is never
written into a week's blocks or its Markdown: it is the course's facilitator
guide (`docs/course-facilitator-guide.md`), and the loader refuses a paste
whose title or headings say it is facilitator material. Start here and the
Glossary are pages of their own, not blocks.

## Start here and the Glossary

A programme's Start here and its Glossary are the two pages of the fellow
guide that are not weeks. Each is a document of its own, read from the
guide's Markdown with the same reading of text as a week (runs, links,
lists, tables, code), with caps of its own, and loaded by an admin from the
run's editor as a week is (paste, Read it, what we found, things to check,
Save, Copy as Markdown).

| Where | What it does |
| --- | --- |
| `src/lib/courses/guide/model.ts` | The two documents, the read side, the check, and `runGuideFields`, the one copy of them |
| `src/lib/courses/guide/limits.ts` | Their caps, each sized from the real guides with room |
| `src/lib/courses/guide/markdown.ts` | Markdown to each document and back, what was found and what to check |

Both are stored on the run's own document (`startHere`, `glossary`), beside
its weeks, and only the server writes them. Every copy of a run's
curriculum carries them through `runGuideFields`: a copy forward (each kept
where the target has its own, unless it overwrites), a template saved from
the run, and a template applied to a run (each the template holds replaces
the run's; one it does not hold leaves the run's). They go with the run's
document. Neither is public: the pages are `/learn/<run>/start-here` and
`/learn/<run>/glossary`, open to exactly the people the run's week 1 opens
to.

### Start here

```
# Lighthouse Fellowship: fellow guide

Mar 3, 2026

Four weeks, one evening a week by the sea.

## A week, step by step

| Part | What you do | Time |
| --- | --- | --- |
| Before the evening | Readings and a short film | About an hour |

**Reflections.** Jot a few lines for each stop as you go.

### Support

If the sea is weighing on you, tell your facilitator.

Adapted from [Example Harbour's course](https://example.org/course), redesigned for a group on the rocks.
```

- The title line is kept for the copy and never drawn: the page is "Start
  here". A line holding only a date straight under it is the guide's
  byline, left out and said.
- The paragraphs before the first `##` are the opening. Each `##` or `###`
  heading starts a section, its text kept as written: lists, numbered
  lists, tables (a rubric whose first heading is empty included) and code.
  A deeper heading becomes a bold line, and says so. A section headed
  "Support" is drawn in a box of its own.
- The page puts its line about who reads a person's reflections (their
  group's facilitators and the programme's lead, named from records) under
  the first paragraph that opens with a bold "Reflections". The loader says
  when no paragraph does.
- The document's last paragraph, when its first words are "Adapted from", is the
  credit line, drawn at the foot.

### The Glossary

```
# Glossary

The words you'll meet most, in plain words.

| Term | In plain words |
| --- | --- |
| Beam | The light a lamp throws, turning over the water. |
| Fresnel lens | Rings of glass that bend the light into one [narrow beam](https://example.com/fresnel). |
```

- One table of two columns: each row a term and what it means, kept in the
  table's order. A definition is a line of rich text with its links. The
  column headings are kept for the copy and not drawn.
- The text before the table is the opening; any text after it is drawn
  after the terms.
- No table, more than one, a third column, a row with no term or a term
  with no definition stops a save. A term in the table twice is a thing to
  check.

## The lead's Weeks tab, and a week for one group

A programme's lead writes its run's weeks on the programme's Weeks tab
(board pr-weeks, option B as Q39 chose), and so do admins. The run's week
editor under `/admin/courses` stays an admin's.

| Where | What it does |
| --- | --- |
| `(tabs)/weeks/page.tsx` | Each week of the run's plan: Ready, Draft or Empty, its first session, the day it should be ready by and its owner |
| `(tabs)/weeks/[weekId]/page.tsx` | One week's page: paste and check, its settings, Preview as a fellow, Mark ready, and the week for one group |
| `(tabs)/weeks/[weekId]/preview/page.tsx` | The week as a fellow reads it, drawn by the member's own week page with nothing that can be pressed |
| `(tabs)/weeks/copy/page.tsx` | Copy weeks from another run of the course |
| `(tabs)/weeks/[weekId]/review/page.tsx` | The week's review, an admin's alone, from the week's first session (docs/courses-ops.md, "The week review"); each row of the tab says Review to an admin and "Review: admins only" to the lead |
| `(tabs)/weeks/[weekId]/review/explainer/page.tsx` | Schedule an explainer from the week's review, an admin's alone (docs/courses-ops.md, "Explainers"); the week's page lists the explainers scheduled from its review to the lead and admins |
| `src/lib/courses/weeksTab/` | What the tab shows, its words and its addresses |
| `src/lib/courses/weekPaste.ts` | The checks every paste is held to, for the run's week and a group's copy alike |

- **Who.** The lead of the programme that names the run (`programmeLedBy`)
  and admins: the tab's pages, the week loader, Mark ready, the owner route,
  the route that sets how a week meets, and the facilitator guide's loader.
  Everybody else gets one refusal, decided before anything of the run is read.
- **States.** Ready is `weekIsReady` (marked, on a published week); Empty is a
  week with nothing in it, or with no page; Draft is anything else, published
  or not. A published week that is not marked ready still opens to each
  group. Every published week is open at once to everybody the run is open
  to (Zach, 27 October 2026: weeks are published at the start so people can
  read ahead); which week is this week, when work is due and the weekly
  emails stay on each group's calendar, and a sealed predictions card still
  opens only after the group's session before its week.
- **First session and ready by.** The earliest session that week among the
  run's groups that still meet, each on its own calendar, a cancelled one left
  out; ready by is seven days before it.
- **Owner** is `ownerUid` on the run's week, null for the programme's lead,
  written only by `PUT .../weeks/[weekId]/owner`. The owner can be the lead or
  one of the run's helpers (its track leads, with an approved account). A
  stored owner who is neither any more is shown as the lead. No copy of a
  week carries it.
- **In person or Online** is the groups' own week mode, `sessionModes`, the
  field "Change a session" writes: online shows the session's join link on the
  programme page, never in an email. `PUT .../weeks/[weekId]/mode` sets it for
  every group of the run whose session that week can change, leaves alone a
  group that has met that week and one whose session was changed on its own
  (moved, cancelled or pushed back), and refuses whole when a group that would
  go online has no meeting link. It emails nobody.
- **The facilitator guide box** loads the week's session plan and notes
  through the guide's own route, which admits the lead the guide's reader gate
  admits. The guide never goes on a week.
- **A week with no page yet** (Zach, 26 October 2026). A week of the run's
  plan that nobody has opened in the run's week editor shows the paste box,
  and its first save makes its page: the document the week editor makes
  (`emptyWeekFields`, unpublished) with the pasted blocks and title.
- **A week for one group** goes through
  `/api/courses/groups/[groupId]/weeks/[weekId]/blocks`, for admins and the
  programme's lead on any group of the run and for a group's facilitators on
  their own. The first save makes the group's copy through `templateWeekFields`
  with the pasted blocks, so every id the paste keeps stays and ticks and
  answers stay with their blocks; later saves change the copy's blocks and
  title. A copy is made only of a published week. The answers a paste would
  take out are counted for that group's people and facilitators alone. The
  run's week and every other group's are never written. A facilitator gets
  the same card on their group's week editor, for a week written as blocks.

### Not built, on purpose

- **Option C's "Add a block" editor** (write a week block by block, no
  Markdown). Q39 chose B; a page to build a week by hand comes later.
- **The board's block-by-block fields**: a found row opening its block's
  fields to edit in place. A week is changed by copying it as Markdown,
  editing that and pasting it back; what was read is checked through What we
  found, the things to check and Preview as a fellow.
- **Reordering weeks** (the board's drag handles and Move up or down). Once a
  run is out of draft its plan is an admin's, in the run's editor.
- **A course's own weeks.** A course holds none yet, so "Copy weeks from the
  course" copies another run's, through the copy route the run editor uses,
  never overwriting a week the run has.
