# Surveys

A survey is questions an admin sends to find out how something went or what
people think. This file is the contract for **a programme's surveys**, which
ask the programme impact questionnaire (Zach, 26 Oct 2026): one before the
programme, one at its end, and follow-ups 6 and 12 months on. Each is
confidential, sent by an admin by hand with a personal link each, a test
first, reminders by hand, results made on the server and a logged export
with names. Every later survey (the leaving survey, surveys after events) is
built on these records and these rules.

The code: `src/lib/surveys/` (the library), `src/lib/firestore/surveys.ts` (the
records), `src/app/api/surveys/` (the routes), `src/app/survey/[token]/` and
`src/app/(app)/learn/[runId]/survey/[surveyId]/` (the answer page),
`src/app/(app)/admin/(admin-only)/surveys/` (the admins' pages),
`src/lib/scheduler/jobs/surveyNamesOff.ts` (names off).

## The rules, in one place

- **Only admins** make, change, send, remind, close and read a survey, and only
  admins see a name beside an answer. Facilitators never see anything of a
  survey, about themselves included. A programme's lead will read totals and
  comments for their own programme, never a name, as answers come in; that page
  is not built yet, and nothing here holds results back until a survey closes.
- **Confidential, never anonymous.** Every survey on the site knows who answered.
  The confidential box at the top of every survey says so, in sv-privacy's words.
- **Every question can be skipped.** No question is required.
- **Nothing is kept before "Send my answers"**: no draft, no record of when the
  survey was opened or for how long, and no IP address, ever.
  `tests/surveys-no-tracking.test.mjs` walks every survey file for that.
- **One answer per person**, and it cannot change once sent.
- **No reminder goes on its own.** An admin presses Remind. No schedule sends
  anything.
- **No floors.** Results show from the first answer (Zach, 25 Oct 2026). Public
  numbers will have a threshold of their own, decided when they are built.
- **No answer or result is ever in an email.**
- **Names come off** two years after the programme's last session (Zach, 26
  Oct 2026), the same day for every stage, and at once when an account is
  deleted. The answers stay, so the totals stay.

## The records

Three collections, **server-only in both directions**: no browser reads or writes
them, an admin's included. Every write is a route on the Admin SDK and every read
is a server page or route. The rules blocks are deny-all.

| Collection | One per | Holds |
| --- | --- | --- |
| `surveys/{autoId}` | survey | its stage (`before`, `after`, `followUp6`, `followUp12`), privacy (`confidential`), the admins' name, the title and intro people see, its items, about how many minutes, its audience (`{ kind: "programme", roundId, programmeId }`, or for a follow-up `{ kind: "followUps", roundId, programmeId, consentFrom }`), the programme's short name and kind as they were when it was made, the run the programme named, the survey it pairs with (`pairOf`), an incubator's strand, when it closes, when it was closed by hand, the day names come off and when they did, when it was first sent, a record of each press of a send button (kind, time, how many), the last test of each email (who, when, the wording's fingerprint), the secret of its test link |
| `surveyPeople/{surveyId}__{uid}` | person a survey is for | the survey and form, the person (`respondent: { kind: "account", uid }`), the secret in their personal link, the press that sent it, when it was sent and what became of it, when they were last reminded and how often, whether they have answered, and what their consent boxes say (`consents`, `consentsAt`) |
| `surveyAnswers/{autoId}` | person who answered | the survey and form, the person (`respondent`, null once names come off), the answers, when "Send my answers" was pressed (day and time), how (`link` or `signed-in`), and whether their group had met for the first time by then |

**The person is a map**, `respondent: { kind: "account", uid }`, found by one
equality on `respondent.uid`. Another kind (an event guest's sign-up,
`{ kind: "guest", signupId }`) can sit beside it later without a rewrite, and
names come off by setting the whole map to null.

**Every query is one equality on one field** (`surveyId`, `token`, `testToken`,
`roundId`, `respondent.uid`) or a read of the whole `surveys` collection, a
handful a term, sorted in memory. Nothing needs a declared index. A person's
own earlier answer (Q3's) is one equality on `respondent.uid`, filtered to the
survey in memory.

**A link's secret** is 32 random bytes, base64url, minted the way
`calendarLinks` mints one (`mintSurveyToken`). It is the person's own: the
answer route takes it as its credential, it is never logged, and the answer page
sends no referrer.

## The questionnaire's templates

`templateItems(stage, kind, strand)` in `src/lib/surveys/templates.ts` writes
each stage's questions word for word from the questionnaire, a page per
section:

| Stage | Questions | About |
| --- | --- | --- |
| Before the programme (`before`) | P3 (level and subject, offered from the profile), P4, P5, C1 to C9, P6, and P7's consent | 5 minutes; 14 questions, 17 for an incubator |
| At the end (`after`) | C1 to C9 again (C9 "since the programme started"), T1 to T3 looking back, A1 to A5, Q1 to Q3, N1 to N3 | 10 minutes; 23 questions, 32 for an incubator |
| Six months on, a year on (`followUp6`, `followUp12`) | F1 to F4, F5 (C1 and C2 again), F6 (A2 and A4 again), F7; F2 scored as FTE | 3 minutes; 11 questions |

An incubator adds I1 (before), I2 and I3 (before and at the end, with I2 looked
back on at the end) and I4 to I7 (at the end). I2's first line is worded for
the incubator's research (`strand`: alignment or governance), picked when its
survey is made; its survey at the end takes its before survey's.

P1 (the email registered with) and P2 (the programme) are not asked: the site
knows both. The questionnaire's second opt-in, sharing with Kairos, is not
built; its box goes in P7's consent block, after the follow-ups box.

**The ids are the pairing.** A question asked at more than one stage has the
same id, type and option ids at every stage and in every programme (C1 is
`q_c1` before, at the end and in each follow-up), so answers pair by person
and compare across programmes. Change a question's words freely, never its id.

## Stages and pairs

New survey offers a card per stage. Each programme has at most one survey of
each stage, and each pairs with the nearest earlier one it has (`pairOf`,
fixed when it is made): the end with the before, six months on with the end
(or the before), a year on with six months on. Results compare a question
with the earliest survey of the pair chain that asks it.

| Stage | Who it goes to | Can be made |
| --- | --- | --- |
| Before, at the end | everybody holding a place when it is sent (`programme`): at the start everybody starting, at the end everybody still on it, finished or not | once decisions are sent and the programme names its run |
| The follow-ups | everybody whose row on the programme's before survey says yes to follow-ups now (`followUps`, `consentFrom`) | once the before survey has been sent |

The eyebrow beside the programme says "Week 1" before, the run's last week at
the end, and nothing on a follow-up. Q3 at the end shows each person their own
answer to P6, read for them alone ("At the start you said: ..."); a test link
shows where it would go and nobody's words.

## Follow-ups and changing a consent

P7's box, "Contact me at 6 and 12 months", starts unticked. What the person
says is kept on their row on the before survey (`consents.followUps`, with
`consentsAt`), not in their answers, because it can change. They change it on
their own survey's page, through their link (`POST /api/surveys/consent`) or
signed in (`POST /api/surveys/[surveyId]/consent`): on the before survey once it
can no longer be answered there (answered or closed), and on a follow-up at
any time, where "Stop the follow-ups" changes the before survey's row. Each
press of a follow-up's send or Remind reads the rows again, so the change
holds from the next press. Nobody is emailed by a change, and nothing about it
reaches the admins but the count on the send button.

The items are **Worksheets' item model**, sanitised and validated by Worksheets'
own functions, with the questions Worksheets lacks defined beside them in
`src/lib/surveys/items.ts`. Worksheets itself is unchanged.

## The question types

Every one is drawn phone first with real labelled form controls and targets
of at least 44px, works before the page's script arrives, and can be skipped.

| Kind | Stored as | Answer |
| --- | --- | --- |
| Choose one, pick any, short and long answer, 1 to 5 | Worksheets' own | Worksheets' own |
| Every point described (a stage, 0 to 5) | a single choice, `look: "points"`, `scores` | the option's id; results read its number |
| Each answer counts as a number (a share of working time as FTE) | a single choice, `scores`, `scoreUnit` | the option's id |
| A menu, offered from the profile | a single choice, `look: "menu"`, `profile` | the option's id |
| Pick up to some number | pick any, `maxPicks` | the ids, refused over the limit |
| Pick any, then which mattered most | pick any, `most` | the ids and `most`, which must be one of them |
| 1 to 5 for each line (an agreement grid gives every point its words) | `lines`, `scale.points` | a number per line |
| 0 to 100% | `percent`, with words at the ends | a whole number; the typed box is the answer and the slider beside it a second way in |
| A number | `number`, with its largest | a whole number from 0 |
| A scale with words at chosen points (1 to 7, 0 to 10) | `scale`, `min`, `max`, `anchors` | a whole number; 0 to 10 also gives a net promoter score |
| A consent statement and its boxes | `kind: "consent"` (not a question) | what is ticked goes on the person's row, `consents`, never into the answers |

Any question may also carry a line under it (`hint`), the question it looks
back on (`lookBackOf`, so results set a look-back beside what it looks back
on) and an earlier answer of the person's own shown above it (`pipe`).

**A consent box starts unticked**, and only a tick is a yes. When the answers
are sent, each box's yes or no is written on the person's own row with when it
was said (`consentsAt`), because an answer can never change and a consent can.

**What a profile offers** (`src/lib/surveys/profileOffer.ts`): the level of
study from `profile.status` (a master's, a PhD, staff, other; an
undergraduate's profile does not say which year, so nothing is offered), and
the subject from `profile.subject` when exactly one subject's words are in it.
The menu starts on that answer and says so; the person can change it. Nothing
else of the profile is read.

**Until the first send** an admin may change the words, the options, the lines,
the scale's words, the line under a question, the consent's words, the order,
the title, the intro, the minutes and the closing day. Questions are never
added, taken out or retyped here (`sameQuestions`), and an answer that counts
as a number is reworded, never added or taken out. **From the first send
everything is fixed**: the email people got names the closing day, and the
later stages have to ask the same questions.

The day names come off is worked out from records, two years after the run's last
session (`namesOffDayFor`, through `runEndOf`), each time the survey is saved or
tested, and fixed by the first send.

## Sending and reminding (sv-send-programme)

Who it is for: **everybody holding a place on the programme**, through
`placeHoldersOn`, the one test the hand-over, its panel and Publish share. It is
read fresh every time a button is drawn or pressed; the people rows record who
was SENT it, and the difference is "who joined since".

Three presses, each by an admin, each saying on its button how many people it
reaches, and each sending the number back: when it no longer matches, nothing is
sent and the answer carries the new number.

1. **"Email 30 people"**, the first send, to everybody holding a place. Refused
   until the presser has sent themselves a test of this very wording, signed by
   them (the Publish lock). Claimed once (`firstSentAt`, in a transaction), so
   two presses send it once.
2. **"Send to the 2 who joined since"**, the same email, to whoever holds a place
   and has not been sent it.
3. **"Email 12 people"** under Remind: the reminder, to people it was sent to who
   have not answered and still hold a place. Refused until the presser has sent
   themselves a test of the reminder.

One press at a time per survey (`inFlight`, lapsing after five minutes). The
notice lane's caps apply: three presses an hour for one admin, ten a day per
survey, and a press over the lane's recipient ceiling is refused whole.

Each person's row, with their secret, is written before their email; the email
goes to their account's address, one message each; the row is then stamped with
what became of it. A send that throws leaves the row unstamped, so they are still
owed it.

**The emails** are the boards' words (HANDOFF, "Emails, word for word"): the
survey's intro, then "It’s confidential: only NAISI’s admins can see who said
what, and your facilitators never see it.", the closing day, a button to the
person's own link, and the name of whoever pressed, "For NAISI". Every value is
from the survey's record. They reply to ai-safety@uonsu.com and come from the
site's own sender (the boards draw another address; see the build notes).

**They are notices** (`docs/notifications.md`): they reach everybody holding a
place whatever their notification settings say, with the lane's visible line,
its receipt (`kind: "notice"`, surface `course-survey`) and no unsubscribe. A
follow-up's say instead that the person said yes to follow-ups (surface
`course-follow-up`), since months on they may hold no place. A
test is never a notice: it goes to the presser alone, marked `[TEST]`, as
`course-test`, and its button opens the survey's test link, which keeps nothing.

**Close it now** ends a survey early. Nobody is emailed.

## Answering (sv-before-phone)

One page, two doors: `/survey/<secret>` with no sign-in, and
`/learn/<run>/survey/<survey>` signed in, for a card on Home or week 1 to link
to. The page shows the programme, the title and intro, "Every question can be
skipped.", the confidential box, the questions a page (a section) at a time
with Back and Next, "Send my answers", and "It closes on Wed 4 Nov. Once sent,
your answers can’t change."

**The box** names the programme's lead (while they still stand as its lead) and
the person's own group's facilitators, from records. A placement Publish has not
told them yet is no group of theirs: the box then says "Your facilitators never
see your answers.", the nearest true line the board does not draw. A lead who
also facilitates their group is left out of the facilitators.

Every control is a real form control left to the browser, so nothing typed
before the page's script arrives is lost; until it arrives every page shows at
once and Send is disabled.

**"Send my answers"** keeps the answers once, in a transaction on the person's
own row, refused after the survey closes (by hand or at its time) and refused a
second time. Only the survey's own questions are kept, each checked against its
question. The answer is stamped with the day and time, how it came, and whether
the person's group had met by then (from the start of its first session that is
not cancelled). The signed-in route refuses during a view-as session. The link
route is rate limited by a count in memory that keeps no address.

## The admins' pages

Run NAISI › Surveys (`/admin/surveys`): open, drafts and closed, each with its
answers, closing day and the way to its tabs; New survey. Each survey has four
tabs: **Questions** (the editor until it is sent), **Send** (above), **Who
answered** (names, for admins only, and the spreadsheet), **Results**.

**Results** are made on the server and never carry a name. Every number has its
n beside it and the share of the people the survey was sent to (taken from the
survey's own record of each send, so it outlives names coming off). For each
kind: a choice's count per answer, and a scored one's average or total ("6.4
FTE in all"); pick any then which mattered most counted on its own; a scale,
a percentage or a number by its counts or bands, average, middle value and
spread, and 0 to 10 with its net promoter score; a grid line by line; comments
in full. A survey that pairs with an earlier one shows, under each question
the earlier one asked the same way, **Before and now** for the people who
answered both times, paired by person on the server (`src/lib/surveys/change.ts`):
who moved up, stayed and moved down with the averages and middle values, a
grid's lines, or a choice's counts then and now. A question with a look-back
in the same survey shows **Looking back** beside it the same way. The before
survey also shows how many said yes to follow-ups. A switch leaves out
before-survey answers sent after someone's first session, on its own Results
and on the before side of every later stage's comparison.

**The spreadsheet with names** (`POST /api/surveys/[id]/export`) is one row per
person who answered and one column per question (and per line), choices in their
words, never an address. It is a download the site records before it hands it
over (`dataExports`, kind `survey-answers`, scope `surveyId` and `roundId`), and
it is refused when that record cannot be written.

## Deletion

- **An account deleted**: its survey rows are deleted and its name comes off
  its answers at once (`takeNamesOffForAccount`, step 1e of
  `deleteAccountCascade`), both counted in the summary.
- **A form destroyed**: its surveys are left alone. A survey is the programme's,
  with its own retention, as the course run the form fed outlives the form; it
  stands without its form (it keeps the programme's name and kind), keeps its
  results, who answered and its export, and refuses any further send.
  `tests/surveys-deletion.test.mjs` holds both destroy engines to naming no
  survey collection, so a destroy that takes surveys is a decision made here
  first.
- **Names come off** two years after the programme: the `surveys-names-off` job
  sets every answer's person to null and deletes the survey's people rows on the
  survey's day, then stamps it. It emails nobody, so it registers on.

## Not built yet

The cards on Home, My programmes and week 1; the leaving survey; event
surveys, check-in, walk-ins and QR codes; results for a programme's lead; one
person's answers page; the questionnaire's facilitator and mentor ratings, its
Kairos sharing and the Kairos report, and its separate anonymous keep, change
and drop form; public numbers; this term in numbers. The model is built so none of them needs a
rewrite: another `audience.kind`, another `respondent.kind`, the same records.

## The guards

`tests/surveys-items.test.mjs` (the template word for word, the model, the box,
both emails, totals), `tests/surveys-routes.test.mjs` (every route and page as
every kind of caller), `tests/surveys-deletion.test.mjs` (both cascades),
`tests/surveys-no-tracking.test.mjs` (no activity, no address, no page that
writes).

The privacy policy says what a survey keeps, who sees it, when names come off
and what a deletion does, under "When you answer a survey", and
`tests/privacy-policy.test.mjs` holds each of those sentences to the code here:
who reaches survey code, the fields an answer keeps, the notice lane, the
names-off job and the deletion step; what the surveys ask, by kind, against
every question of every template, both ways; the two profile values a survey
offers; the survey at the end showing a person their own earlier answer; and
the follow-ups' box, who it sends them to and how it is changed. A change that
alters any of them changes the policy first: a template that asks a new kind
of question fails until the policy names it.

`tests/surveys-no-tracking.test.mjs` passes over exactly one sentence that holds
one of its activity names as prose, F1's "What’s your main activity now?",
written as a string; the name anywhere else is still caught, and the entry
fails when the sentence is gone.
