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
taking a week down takes its Ready with it. A copy of a week never carries
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

### Fill-in boxes, a checklist and a talk

- Fill-in boxes: the guide's code block template, numbered headings and
  labelled blanks, read as headings and boxes; copied out as
  `**Fill in: My plan**` and a numbered list, each box with its id.
- A checklist: in a part with nothing to read or answer, its bullets are
  steps to tick; copied out as `**Checklist**` and `- [ ]` items.
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
written into a week's blocks or its Markdown. Start here and the Glossary are
pages of their own, not blocks.
