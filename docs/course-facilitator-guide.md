# A course's facilitator guide

The material a group's facilitators run each session from: for each week,
the session's plan and the week's notes (with their answer keys and example
answers); for the whole course How to use these plans, the Handbook, Case
studies and feedback, and Printables; and the two tabs over every week,
Sessions and Week notes. It comes from the course docs, exported as Markdown
one tab at a time, and it is loaded by an admin.

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
| `src/lib/courses/facilitatorGuide/printables*.ts`, `sessionCount.ts` | The printables as PDFs (below) |

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

Publish asks the facilitators' door for a whole group
(`facilitatorGuideReaderForGroup`), with the same bars but no person: a live
group with a facilitator, on a run that is there and not being destroyed, of
a course that is there and not being destroyed (the run's course, never the
group's own). It reads only which weeks have something loaded, so the email
to the group's facilitators says "Their names and week 1’s guide are on your
group page." only while that page shows the link: the group's next session is
its week 1 and week 1 has its session plan or its notes.

## Where it is stored, and where it never is

`courseFacilitatorGuide/{courseId}__{slot}`, one document per place, per
course (every run of a course is facilitated from the same plans). The slot
is `w03-plan`, `w03-notes`, or one of `how-to-use`, `handbook`,
`case-studies`, `printables`, `sessions`, `week-notes`. A week's plan and its
notes are two documents,
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
| `/learn/facilitator-guide/[courseId]` | Sessions and Week notes, then every week with something loaded, under "Each week"; the course's other documents under "For the whole course" |
| `/learn/facilitator-guide/[courseId]/week-3` | "Facilitator guide for week 3": the session plan, then the week's notes |
| `/learn/facilitator-guide/[courseId]/handbook` | One of the course's own documents (`how-to-use`, `handbook`, `case-studies`, `printables`, `sessions`, `week-notes`) |
| `/admin/courses/[courseId]/facilitator-guide` | Where an admin loads it, one document at a time |

A facilitator's group page links "Facilitator guide for week 3" on its
ticket, and their Home links "Facilitator guide" under this week's title, each
only when that week has something loaded. The Printables page and each week's
page link the printables as PDFs (below). `/api/courses/[courseId]/
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

The two parent tabs, "Sessions" (over every session's plan) and "Week notes"
(over every week's notes), have places of their own, `sessions` and
`week-notes`: course documents like the other four, loaded, gated and read
the same way, which keep what a course sums up of all its weeks (its "At a
glance" tables). The course page shows them at the top of "Each week".

### Copy as Markdown

Gives the document back so that, pasted again, it is the same document:
`readGuideMarkdown(guideToMarkdown(doc))` gives back `doc`. Two lists that
meet change their marker so they stay two lists, and every character Markdown
would read as markup is escaped. The byline is not written back.

## The printables as PDFs

The Printables document is also a set of A4 PDFs, ready to send to a printer:
one for each session and one for the whole document. The Printables page
offers them all under "Download to print" (a session with nothing to print
says so and is not a link), and each week's page offers its session's beside
its plan ("Download session 3’s printables (PDF)").

| Where | What it does |
| --- | --- |
| `src/lib/courses/facilitatorGuide/printables.ts` | Which sections go in which session's PDF; the loader's two checks; the file names and the route's address |
| `src/lib/courses/facilitatorGuide/printablesLayout.ts` | Where every line, row and template goes on A4, page by page (pure: the fonts are measured through a function it is handed) |
| `src/lib/courses/facilitatorGuide/printablesPdf.ts` | Draws that, with PDFKit, and nothing else |
| `src/lib/courses/facilitatorGuide/printablesGlyphs.ts` | Which characters the fonts can draw, and how the rest are drawn |
| `src/lib/courses/facilitatorGuide/sessionCount.ts` | How many sessions a course has |
| `src/app/api/courses/[courseId]/facilitator-guide/printables/pdf/route.ts` | `GET`, the whole document; `?session=3`, one session |

**Made on request, never stored.** The route draws the PDF from the stored
Printables document each time it is asked. There is no Storage path and no
storage rule: storage rules go out by a deploy command of their own, which is
easy to forget, and a stored file would need its own deletion with the course
and would go stale whenever the printables were loaded again. A file drawn on
request is always the document as it is now, and there is nothing to delete.

**Who.** Exactly the guide's readers, through the same gate
(`facilitatorGuideReader`). Everybody it refuses, and everybody asking about a
course that is not there, is given the guide's one calm sentence at 200 and no
PDF; somebody signed out is sent to sign in and back to the Printables page.
The route reads and draws and writes nothing, so a view-as session gets
what the member would. Its other answers (no printables loaded, a session
the course does not have, a session with nothing to print, a session that is
not a number) are sentences as plain text, because the route is opened by a
link in a browser. The PDF is saved rather than shown
(`Content-Disposition: attachment`), named for the course and the session
(`naisi-agi-strategy-fellowship-session-3-printables.pdf`), and kept out of
every cache but the reader's (`Cache-Control: private, no-store`).

### Which session a section belongs to

A section is a `##` heading and everything under it to the next `##`, its
`###` headings with it. Its heading says which sessions it is for, as the
course docs write them:

| Heading | Goes in |
| --- | --- |
| `Session 1: credence card`, `Session 1, Option C: the brief` | session 1 |
| `Actor cards (session 1)`, `Intervention cards (session 4, Option B)` | that session |
| `Case slips (end of sessions 1 to 4)`, `Briefing card (sessions 2 to 5)` | each session in the range |
| `Sessions 2 and 3: ...`, `sessions 2, 3 and 5` | each one named |
| `Every week: ...` (or each week, every session, each session, all sessions) | every session |
| anything else | only the whole document's PDF |

What comes before the first `##` (the document's own lines on how to print it)
goes in every session's PDF too. A heading that names no session is a thing to
check when the Printables are loaded ("“Where to buy card” names no session,
so it goes only in the PDF of all the printables."), never a refusal.

How many sessions a course has is the guide's own count of weeks
(`guideWeekCount`), which the admin's place picker offers too: the longest week
plan of the course's runs, and never fewer than a week already loaded. So an
incubator or a shorter course gets its own number, and nothing about a term is
written in code.

### What is drawn

What the document says, in its order, and nothing else: its title, headings,
paragraphs, lists, quotes, boxes to tick and tables in Space Grotesk, and its
templates (code blocks) in Space Mono with every space kept, because they are
forms people write on. Nothing is added or reworded; bold is the heavier
weight, italic leans (the face has no italic), and a link is underlined and
stays a link.

- **A4 portrait, single-sided**, 15 mm margins, the light theme's inks on
  white.
- **Cut lines.** The printables say "cut cards along the lines", so each row of
  a table is a card in a dashed frame of its own, and each template sits in a
  dashed frame. Dashed means cut; the thin solid lines between a row's columns
  are not for cutting.
- **Never split across a page when it fits on the next one:** a row, a
  template, a block (a paragraph, a list, a quote, a table), and a whole `##`
  section or `###` part. A heading always has what follows it on its page, and
  so does a paragraph wholly in bold (a label such as "Rules for Blue") or one
  ending in a colon. Only what is taller than a page on its own is split, at a
  line: a template goes on in a frame of its own, a long table between rows, a
  long paragraph keeping two lines either side.
- **A template** is drawn at 9.5 point, or smaller until its widest line fits
  the frame (the widest real template, 93 characters, prints at about 8.6
  point); a line too wide even at 6 point goes on below itself, so nothing is
  ever cut off. A tab moves to the next stop of eight, as the page draws it.

**Characters.** The fonts are the house's own, the three the certificates
embed. A character is drawn in its own face, or in the other face when only
that one has it, or as an empty box when neither does, never as nothing; the
loader names each such character when the Printables are loaded ("The PDF
can’t draw ✂ (U+2702), so it prints as an empty box."). Neither course's
printables had one when this was built: beyond plain letters they use only
£, × and the minus sign, which both faces have. The character tables in
`printablesGlyphs.ts` are the fonts' own, and a test fails when the font files
and the tables disagree.

**One library.** PDFKit is imported by one file,
`src/lib/courses/certificates/pdf.ts`, which opens every PDF the site makes
(`openHousePdf`), in the house's fonts and never one of PDFKit's own. The fonts
are read from disk when the route runs, so `next.config.ts` traces them into
this route as it does into the certificate's: a new route that draws a PDF
needs its own line there, or it works on a laptop and fails deployed.

`tests/course-facilitator-guide-printables.test.mjs` holds all of the above, the
route driven as every kind of caller.
