# Surveys

A survey is questions an admin sends to find out how something went or what
people think. This file is the contract for the first one built, **the before
survey** of a programme: a confidential survey an admin sends to everybody
holding a place, by hand, with a personal link each, a test first, reminders by
hand, results made on the server and a logged export with names. Every later
survey (the after survey, the leaving survey, surveys after events) is built on
these records and these rules.

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
- **Names come off** a year after the programme's last session, and at once when
  an account is deleted. The answers stay, so the totals stay.

## The records

Three collections, **server-only in both directions**: no browser reads or writes
them, an admin's included. Every write is a route on the Admin SDK and every read
is a server page or route. The rules blocks are deny-all.

| Collection | One per | Holds |
| --- | --- | --- |
| `surveys/{autoId}` | survey | its kind (`before`), privacy (`confidential`), the admins' name, the title and intro people see, its items, about how many minutes, its audience (`{ kind: "programme", roundId, programmeId }`), the programme's short name and kind as they were when it was made, the run the programme named, when it closes, when it was closed by hand, the day names come off and when they did, when it was first sent, a record of each press of a send button (kind, time, how many), the last test of each email (who, when, the wording's fingerprint), the secret of its test link |
| `surveyPeople/{surveyId}__{uid}` | person a survey is for | the survey and form, the person (`respondent: { kind: "account", uid }`), the secret in their personal link, the press that sent it, when it was sent and what became of it, when they were last reminded and how often, whether they have answered |
| `surveyAnswers/{autoId}` | person who answered | the survey and form, the person (`respondent`, null once names come off), the answers, when "Send my answers" was pressed (day and time), how (`link` or `signed-in`), and whether their group had met for the first time by then |

**The person is a map**, `respondent: { kind: "account", uid }`, found by one
equality on `respondent.uid`. Another kind (an event guest's sign-up,
`{ kind: "guest", signupId }`) can sit beside it later without a rewrite, and
names come off by setting the whole map to null.

**Every query is one equality on one field** (`surveyId`, `token`, `testToken`,
`roundId`, `respondent.uid`) or a read of the whole `surveys` collection, a
handful a term, sorted in memory. Nothing needs a declared index.

**A link's secret** is 32 random bytes, base64url, minted the way
`calendarLinks` mints one (`mintSurveyToken`). It is the person's own: the
answer route takes it as its credential, it is never logged, and the answer page
sends no referrer.

## The before survey's questions

`beforeSurveyItems` in `src/lib/surveys/items.ts` writes the six change questions
as sv-before-phone draws them, word for word, on three pages: what you think
about AI (three choices), what you could explain (one numbered question, "1 to 5
for each line", its five lines typed per programme when the survey is made), and
your plans (a choice and a pick-any). Their ids are fixed strings
(`CHANGE_QUESTION_IDS`), the same in every programme's survey, so answers pair by
person and compare across programmes; the after survey will copy them.

The items are **Worksheets' item model**, sanitised and validated by Worksheets'
own functions, with the one question Worksheets lacks ("1 to 5 for each line")
defined beside them. Worksheets itself is unchanged.

**Until the first send** an admin may change the words, the options, the lines,
the order, the title, the intro, the minutes and the closing day. Questions are
never added, taken out or retyped here (`sameQuestions`). **From the first send
everything is fixed**: the email people got names the closing day, and the after
survey has to ask the same questions.

The day names come off is worked out from records, a year after the run's last
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
test is never a notice: it goes to the presser alone, marked `[TEST]`, as
`course-test`, and its button opens the survey's test link, which keeps nothing.

**Close it now** ends a survey early. Nobody is emailed.

## Answering (sv-before-phone)

One page, two doors: `/survey/<secret>` with no sign-in, and
`/learn/<run>/survey/<survey>` signed in, for a card on Home or week 1 to link
to. The page shows the programme, the title and intro, "Every question can be
skipped.", the confidential box, the questions three pages at a time with Back
and Next, "Send my answers", and "It closes on Wed 4 Nov. Once sent, your
answers can’t change."

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
answered** (names, for admins only, and the spreadsheet), **Results** (totals
per question and any comments, made on the server and never with a name, with a
switch that leaves out answers sent after someone's first session).

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
- **Names come off** a year after the programme: the `surveys-names-off` job
  sets every answer's person to null and deletes the survey's people rows on the
  survey's day, then stamps it. It emails nobody, so it registers on.

## Not built yet

The cards on Home, My programmes and week 1; the after survey and the change
view; the leaving survey; event surveys, check-in, walk-ins and QR codes;
results for a programme's lead; one person's answers page; reports; public
numbers; this term in numbers. The model is built so none of them needs a
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
names-off job and the deletion step. A change that alters any of them changes
the policy first.
