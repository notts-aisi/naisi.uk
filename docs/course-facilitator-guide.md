# A course's facilitator guide

The material a group's facilitators run each session from: for each week,
the session's plan and the week's notes (with their answer keys and example
answers), and for the whole course How to use these plans, the Handbook, Case
studies and feedback, and Printables. It comes from the course docs, exported
as Markdown one tab at a time, and it is loaded by an admin.

**Nobody taking part ever reads it.** A group's facilitators take part in the
course as well, and they read it because they facilitate.

| Where | What it does |
| --- | --- |
| `src/lib/courses/facilitatorGuide/model.ts` | The places in a guide (`GuideSlot`), its pages (`GuidePage`), a document's blocks, the caps and the check |
| `src/lib/courses/facilitatorGuide/markdown.ts` | A document's Markdown, read and written ("Copy as Markdown") |
| `src/lib/courses/facilitatorGuide/recognise.ts` | What a document is, from its own title and headings |
| `src/lib/courses/facilitatorGuide/access.ts` | The one gate: who reads a course's guide, and who loads it |
| `src/lib/courses/facilitatorGuide/store.ts` | Every read and write, each behind the gate |
| `src/lib/firestore/courseFacilitatorGuide.ts` | The stored document and its normaliser |

## Who reads it

One gate, `facilitatorGuideReader`, decides, and every page and route that
reads a document asks it first (the store takes nothing else):

- an admin;
- a facilitator of a live group (not archived) on a run of the course, while
  their account still stands behind the role;
- the lead of a programme that names a run of the course, while they still
  stand as one (`programmeLedBy`).

Nobody else: not a run's track lead, reviewer or run-level facilitator, not a
facilitator of another course, and never anybody taking part. Everybody the
gate refuses, and everybody asking about a course that is not there, is given
the same calm sentence, so nobody learns which courses exist.

Loading is an admin's job (`facilitatorGuideWriter`), as loading a week is.

## Where it is stored, and where it never is

`courseFacilitatorGuide/{courseId}__{slot}`, one document per place, per
course (every run of a course is facilitated from the same plans). The slot
is `w03-plan`, `w03-notes`, or one of `how-to-use`, `handbook`,
`case-studies`, `printables`. A week's plan and its notes are two documents,
not one with two parts: they are two tabs of the course docs, pasted one at a
time, and "Copy as Markdown" gives each back exactly as it was pasted.

`firestore.rules` refuses every browser, admins included: the loader's route
writes it and the pages read it, on the server. It holds course material and
a time, nothing personal, so it is not in the per-account sweep, and it goes
in the course's destroy, in the final batch with the course's page.

**It never goes in a week.** Anyone signed in can read a week's document, so
nothing here is written into one, and the week loader refuses facilitator
material outright (a session plan's or a week's notes' title, a course
document's title, or a heading only facilitator material has, below).
`tests/course-facilitator-guide-guard.test.mjs` walks the tree for both rules.

## The pages

| Address | What it is |
| --- | --- |
| `/learn/facilitator-guide/[courseId]` | Every week with something loaded, and the course's own documents |
| `/learn/facilitator-guide/[courseId]/week-3` | "Facilitator guide for week 3": the session plan, then the week's notes |
| `/learn/facilitator-guide/[courseId]/handbook` | One of the course's own documents (`how-to-use`, `handbook`, `case-studies`, `printables`) |
| `/admin/courses/[courseId]/facilitator-guide` | Where an admin loads it, one document at a time |

A facilitator's group page links "Facilitator guide for week 3" on its
ticket, and their Home links "Facilitator guide" under this week's title, each
only when that week has something loaded. `/api/courses/[courseId]/
facilitator-guide` tells a page drawn in the browser which weeks have, titles
only.

## The Markdown

The course docs' own export, as it is. Each tab is one document:

```
# Session 3: How sure are you?

Oct 25, 2026 · @ada example

## At a glance

**Goals.** By the end, everyone has put a number on one claim.

**Bring.**

- [ ] A pack of sticky notes
- [ ] The week 4 case slips

## Run sheet

| Time | What happens |
| --- | --- |
| 0:00 to 0:10 | Arrive and check in |
```

- The first line is the title. Something before it, or a second title line,
  stops a save: paste one document at a time.
- **The byline is left out**: a line under the title made only of date chips
  and mentions ("Oct 25, 2026", "@ada example", with " · " between). Bylines
  aren't page content. The loader says it left one out.
- Headings stay headings; paragraphs, lists, tables and code are read by the
  week loader's own reader of text (`readProseTokens`), so the two never
  disagree about a line. A quote stays a quote (a week's notes quote an
  example strong answer). "- [ ]" lines are boxes to tick on paper, drawn and
  never a control. Code blocks are printable templates, drawn exactly as
  written, every space kept.
- Pictures, HTML and links that are not https or mailto are left out and
  said. A block of code, a table or a quote inside a line of a list stops a
  save, because the page could not draw it there.
- Nothing is cut short in silence: a document over a cap is named, with the
  cap, and is not saved until it fits.

### Telling the documents apart

| Title | Is |
| --- | --- |
| `Session 3: ...` | week 3's session plan |
| `Week 3 notes: ...` | week 3's notes |
| `Week 3: ...` | week 3 of the fellow guide: never loaded here |
| `...: session plans`, `...: facilitator guide`, `Case studies and feedback`, `Printables`, `Sessions`, `Week notes` | one of the course's own documents |

Pasting into a place the title says it is not (session 4's plan into week 3)
stops the save. A course document whose title does not carry its usual words
is a thing to check, not a refusal.

Headings only facilitator material has, which the week loader refuses: "Run
sheet", "If it goes differently", "The point of the week", and any "answer
key".

The two parent tabs, "Sessions" and "Week notes", have no place of their own:
to keep their "At a glance" tables, paste one under How to use these plans or
the Handbook with its title line made a heading ("## Sessions").

### Copy as Markdown

Gives the document back so that, pasted again, it is the same document:
`readGuideMarkdown(guideToMarkdown(doc))` gives back `doc`. Two lists that
meet change their marker so they stay two lists, and every character Markdown
would read as markup is escaped. The byline is not written back.
