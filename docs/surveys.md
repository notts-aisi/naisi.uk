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
`src/lib/scheduler/jobs/surveyNamesOff.ts` (names off),
`src/lib/surveys/onePerson.ts` (one person's answers, opened by an admin).

## The rules, in one place

- **Only admins** make, change, send, remind, close and read a survey, and only
  admins see a name beside an answer. Facilitators never see anything of a
  survey, about themselves included. A programme's lead reads totals and
  comments for their own programme's surveys, never a name, as answers come
  in, on the programme's Surveys tab and each survey's page under it (below).
  Nothing here holds results back until a survey closes.
- **Confidential, never anonymous.** Every survey on the site knows who answered.
  The confidential box at the top of every survey says so, in sv-privacy's words.
  The one anonymous form on the site is not a survey and has no anonymous mode
  of one: it is the keep, change and drop form below, with its own records.
- **Every question needs an answer unless it is marked optional** (Zach, 30
  Oct 2026), in every survey on the site, the ones already open included.
  `isQuestionRequired` in `src/lib/surveys/items.ts` is the one rule: a
  question's own `optional` wins (the editor's Required switch, below); with
  none, a question is optional only when its id is on `NOT_FOR_EVERYBODY`,
  the template text questions that do not apply to everybody, each with its
  reason. Worksheets' `required` field is never read (every survey stored
  before the rule carries `required: false`, which means nothing), so the
  open surveys became required with no data migration. **Consent boxes are
  never required** and have no switch: the follow-ups box, "Don’t share my
  details with Kairos" and "You can quote this, without my name". Consent is
  freely given.
- **Nothing is kept before "Send my answers"**: no draft, no record of when the
  survey was opened or for how long, and no IP address, ever.
  `tests/surveys-no-tracking.test.mjs` walks every survey file for that.
- **One answer per person**, and it cannot change once sent.
- **No reminder goes on its own.** An admin presses Remind. No schedule sends
  anything.
- **No floors.** Results show from the first answer (Zach, 25 Oct 2026), and
  public numbers have no threshold either (Zach, 26 Oct 2026): an admin
  chooses what is published, and every number says what it rests on.
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
knows both. The questionnaire's second opt-in, sharing with Kairos, is shared
by default instead, with a way to say no at the end of every programme
survey's form (see "The Kairos choice").

**Optional by default: the questions that do not apply to everybody.** The
site cannot show a question only to some people, so these template text
questions start with their Required switch off (`NOT_FOR_EVERYBODY`; a
survey made from a template writes `optional: true` on them, and nothing on
the rest):

| Id | Question | Why |
| --- | --- | --- |
| `q_i4_links` | Links to what your team produced | a team with nothing finished, or nothing public, has none |
| `q_i4_when` | If nothing is finished yet, when do you expect it to be? | only for a team with nothing finished |
| `q_f1_where` | The organisation or course | somebody doing independent work has none |
| `q_f3` | What is that work? | only for somebody whose working time goes on AI safety |
| `q_f4_applied` | Since the programme, which programmes or jobs have you applied to? | not everybody has applied |
| `q_f4_accepted` | Which of those accepted you? | only for somebody who applied and was accepted |
| `q_f7` | Anything else that happened partly because of NAISI? | a catch-all |
| `q_ev_change` | Anything we should change? (after an event) | a catch-all |

Every other question is required: every choice, scale, number, percentage and
grid, and every text question anybody can answer ("What do you most want to
get out of this programme?", "Did the programme have any negative effect on
you or your plans?", "What would have helped you stay?"). An admin can turn
any switch either way until the first send. `tests/surveys-required.test.mjs`
walks every template both ways: every question not on the list is required,
every listed one is a text question some template asks, and no consent box
is ever required.

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
| The follow-ups | everybody whose row on the programme's before survey says yes to follow-ups now, and everybody whose row there says nothing who said yes at the end (`followUps`, `consentFrom`) | once the before survey has been sent |

The eyebrow beside the programme says "Week 1" before, the run's last week at
the end, and nothing on a follow-up. Q3 at the end shows each person their own
answer to P6, read for them alone ("At the start you said: ..."); a test link
shows where it would go and nobody's words.

## Follow-ups and changing a consent

P7's box, "Contact me at 6 and 12 months", starts unticked. What the person
says is kept on their row on the before survey (`consents.followUps`, with
`consentsAt`), not in their answers, because it can change.

**The survey at the end asks the same box** (`c_end`, the last item of What's
next) of somebody whose before survey has not had their word (they missed it,
or joined after it), and keeps it on their row there. Whoever said yes or no
on the before survey is not shown the box again (`consentsAskedOf`), and a box
sent for somebody it was not shown to says nothing for them.

**One row holds each person's word** (`followUpsHolderFor`): the before
survey's once it says yes or no, otherwise the survey at the end's once that
does. They change it on any of the programme's survey pages, through their
link (`POST /api/surveys/consent`) or signed in
(`POST /api/surveys/[surveyId]/consent`): on a survey whose form asks them the
box, once it can no longer be answered there (answered or closed), and
anywhere else at any time; "Stop the follow-ups" changes the row that holds
their word. The follow-ups go to everybody whose before row says yes, and to
everybody whose before row says nothing and whose row at the end says yes.
Each press of a follow-up's send or Remind reads the rows again, so the
change holds from the next press. Nobody is emailed by a change, and nothing
about it reaches the admins but the count on the send button.

## The Kairos choice

NAISI shares each person's name and programme record (the sessions they
came to, whether they finished, and the ratings they were given at the end)
with Kairos, its funder, BY DEFAULT, and the privacy policy says so (Zach,
26 Oct 2026). Every programme survey's form ends with a way to say no,
beside the sentence that sharing helps NAISI make its case to its funders
and sponsors, and the person's profile has the same choice.

- **One record per person**, `kairosChoices/{uid}` (`src/lib/kairos/`),
  server-only in both directions. Shared until the person says no: most
  people have no document, and no document reads as shared. It keeps their
  latest word (`shared`), when (`at`) and where (`via`: `survey` or
  `settings`). `kairosChoicesOf` is its one reader and `writeKairosChoice`
  its one writer; `tests/kairos-choice.test.mjs` walks the tree for anything
  else that names it.
- **On the form**: every programme survey (`asksKairos`: before, at the end
  and the follow-ups, whatever their items, so no edit takes it off) ends its
  last page with "Sharing with Kairos" and the box "Don’t share my details
  with Kairos", ticked before the person touches it only when their record
  already says no. The form sends the choice only when the person changed the
  box there, so a form left open never puts back a choice changed elsewhere;
  it is kept with the answers, in their transaction. A test link draws it
  unticked and keeps nothing.
- **On the profile**: the same choice, changed by `POST /api/account/kairos`
  on the caller's own record. Refused during view-as.
- **Saying no** stops only what goes to Kairos with the person's name (the
  Kairos file leaves them out). Admins still see their answers, and the
  answers still count in the totals.
- **Deleting an account** deletes its choice (step 1f).

**The Kairos file** (`POST /api/kairos/export`, `src/lib/kairos/file.ts`), from
Run NAISI › Surveys › Kairos: admins only, once a programme's last session is
over, one row per person on it at its end (the register's rows, leavers left
out) who has not said no, with their name, the programme, the sessions they
came to and of how many, whether they finished (`recordOf`, the lead's
decision or the rule's suggestion), how many ratings they were given and each
rating question's answers in its own column, several joined by "; ". Never an
email address, who gave a rating, or a survey answer. Every press is a
download the site records before it hands the file over (`dataExports`, kind
`kairos`, scope `roundId` and `runId`), and it is refused when that record
cannot be written.

**The Kairos report** (Run NAISI › Surveys › Kairos › a programme,
`src/lib/surveys/kairosReport.ts`, read by `kairosReportLoad.ts`): the
questionnaire's fourteen measures for one programme, in totals and never a
name. Every figure has its n beside it, and that as a share of the people who
started (on the programme at its end, and those who left after a register
marked them). Pairs are by person (`q_c1` before against `q_c1` at the end,
and so on), so only people who answered both count, and an answer whose name
has come off pairs with nothing. Counterfactual FTE is labelled
self-reported. Completions are the finished record (the lead's decision, or
the rule's suggestion), and the figure says so. Applications are those still
in the term (`isInTerm`). The cost per outcome and who goes on to organise next
term say what they need instead of a number. Nothing here compares with
near-misses: none were surveyed this term. The one written answer it lists is
an incubator's links to what each team produced (the questionnaire asks for
the outputs "with links"); the question's hint says they may be passed on to
funders, and privacy v7 says so beside the totals. Any other written answer
is only counted.

## Ratings at a programme's end

The questionnaire's facilitator rating (F1 to F5) and, on an incubator, its
mentor rating (M1 to M3) are **not survey answers**: they are the raters'
own form about each fellow, staff only and never shown to the person rated
(`src/lib/ratings/`, `src/features/ratings/`). They are kept out of survey
code on purpose: the privacy policy holds that no facilitator's page reaches
survey code.

- **Who rates whom** (`src/lib/ratings/rules.ts`): a facilitator is a fellow of
  the group they run (Zach, 26 Oct 2026), so nobody rates themselves, a
  co-facilitator never rates a co-facilitator (whatever else either is), and
  the programme's lead or an admin rates a facilitator. A group's live
  facilitator rates the other fellows of their group; the lead and admins may
  rate any fellow. Only somebody taking part in the group at the end is
  rated, never somebody who left.
- **When**: once the run's last session is over (`runEndOf`), about two
  minutes a person. F1, the sessions they came to, is read from the register
  each time and never typed or stored.
- **Mentors**: nobody is modelled as an incubator's mentor (a team has people
  and a project), so an incubator's facilitators give M1 to M3 on the same
  form, after F2 to F5, with each fellow's team named on their card (the
  Teams tab's own rule of who stands in a team). A test fails the day a team
  names a mentor, so who gives the mentor rating is decided again then.
- **Where**: a group's facilitators at `/learn/<run>/group/<group>/ratings`
  (linked from the group page once the run is over); the programme's lead and
  admins on the programme's Ratings page
  (`/admin/admissions/forms/<form>/programmes/<programme>/ratings`), every
  group, with what everybody said and the rater's name, and their own form
  for the facilitators. A facilitator reads only what they gave. Nobody is
  ever one of the rows on any page, so nobody is shown what was said about
  them. `POST /api/courses/groups/[groupId]/ratings` is the one writer.
- **The record**: `programmeRatings`, server-only. A rating is
  `{runId}__{rater}__{rated}` (`kind: "rating"`); clearing every answer
  deletes it. The run's sheet, `{runId}` (`kind: "sheet"`), holds the day of
  its last session, written with its first rating.
- **Two years**: the `surveys-names-off` job deletes a run's ratings and its
  sheet two years after its last session (`twoYearsAfter`, the day names come
  off its surveys). Deleting an account deletes every rating it gave or was
  given (step 1g), and destroying a run deletes its ratings and its sheet (the
  `ratings` stage, named in the destroy dialog).
- `tests/course-ratings.test.mjs` walks the tree: only the ratings' own
  modules name the collection, and every file outside them that reaches them
  is listed with why it may (no email, no participant's page).

The items are **Worksheets' item model**, sanitised and validated by Worksheets'
own functions, with the questions Worksheets lacks defined beside them in
`src/lib/surveys/items.ts`. Worksheets itself is unchanged.

## The question types

Every one is drawn phone first with real labelled form controls and targets
of at least 44px, works before the page's script arrives, and needs an answer
unless it is marked optional.

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
on), an earlier answer of the person's own shown above it (`pipe`) and the
editor's Required switch turned off or on (`optional`).

**What answered means**, for a required question (`missingRequired` in
`src/lib/surveys/items.ts`, which the answer form, both answer routes and the
resend of blank questions all ask): a single choice, one option; pick any, at
least one tick (a "none of these" counts; "which mattered most" is not
needed); a scale, a percentage or a number, a value (0 counts); a text answer,
something other than spaces; an agreement grid (every point has words), every
line the person is shown; a grid of a programme's parts (words at its ends
only, "How valuable was each part?"), any one line, since its own line says to
leave a part blank you didn't have. A line somebody is not shown (the
Facilitator line, to somebody who facilitates) is never needed. A menu offered
from the profile counts once it holds an answer.

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
the scale's words, the line under a question, each question's Required switch,
the consent's words, the order, the title, the intro, the minutes and the
closing day. The switch writes `optional` on the question, true or false, so
the admin's choice holds whatever the list says; the validator no longer
refuses Worksheets' `required` and names only a contradiction (`required: true`
on a question the survey holds optional). A sent survey's read-only list marks
each optional question "(optional)". Questions are never
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

## The quote tick

Every survey's confidential box says "Totals, and comments you tick to be
quoted, may go in reports to the committee and our funder, Kairos, or on our
site." The tick it speaks of is the box under each long answer, "You can quote
this, without my name", with the line "We might put it in a report for the
committee or our funder, Kairos, or on our site." (sv-privacy, sv-after-phone,
sv-social-phone).

- **One decision, `asksQuotes`** (`src/lib/firestore/surveys.ts`): a
  programme's before survey, its survey at the end, its follow-ups and a
  survey after an event draw the box under every long answer (`isQuotable` in
  `src/lib/surveys/items.ts`); a short answer never has one. The survey about
  leaving draws none: its box says only that totals may go in reports, so none
  of its comments can ever be quoted. The anonymous form is not a survey and
  needs none: it holds no name. `tests/surveys-quote-tick.test.mjs` holds the
  box at the top and the tick to the same answer for every kind.
- **Unticked until the person ticks it.** The tick is sent with the words it
  is under and kept on that text answer as `quote: true`; an answer left
  unticked carries no `quote` at all, and a tick under an answer left blank
  keeps nothing. Like the rest of the answers it cannot change once sent.
- **Refused where no box was drawn**: a tick on a short answer, on the survey
  about leaving, or in any shape but a yes or no, is a 400 and nothing is
  kept. Nothing but the person's own tick marks a comment as one that may be
  quoted.

## Answering (sv-before-phone)

One page, two doors: `/survey/<secret>` with no sign-in, and
`/learn/<run>/survey/<survey>` signed in, the same page inside the programme.
The cards on Home, My programmes, week 1 and the page that says somebody left
link the first, the person's own link (see The cards). The page shows the programme, the title and intro, "Every question
needs an answer unless it’s marked optional." (followed by "The boxes asking
your permission are up to you." on a form with a consent box, the Kairos box
or the quote tick: `answerRuleWords`), the confidential box, the questions a
page (a section) at a time with Back and Next, an optional question marked
"(optional)", "Send my answers", and "It closes on Wed 4 Nov. Once sent, your
answers can’t change."

**A required question left blank.** Next does not leave a page with one, and
Send does not send: each says "This question needs an answer." beside it (on
every line for an agreement grid), a line by the buttons names them by number
("Questions 3 and 7 still need an answer."), and focus moves to the first. The
form checks with `missingOf` over each question's `need` (`requiredNeedOf`,
built on the server for the person, hidden lines left out), the check the
routes make. Before the script arrives the controls carry the browser's own
`required` where the control allows it (a radio group, a menu, a typed box, a
text box; never pick any, which has no "at least one", and never a consent
box), and Send is disabled. **The server is the real check**: both answer
writers (`recordAnswer`, and `recordEventAnswer` for a survey after an event)
refuse a send with a required question blank, 400, before anything is
written, with the questions by number in words and their ids in `missing`
(`blankRefusal` in `src/lib/surveys/blank.ts`); the form marks those the same
way.

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

## The cards (Q50 B)

One function decides whether a survey is waiting for somebody,
`surveysWaitingFor` in `src/lib/surveys/waiting.ts`, and Home, My programmes
and week 1's page all ask it. A survey waits for a person while it is **open**
(`isOpen`), it is **theirs** (they have a row on it that was sent to them,
and for a programme's survey before it or at its end they still hold the
place, by `holdsPlaceOn`, the test the reminder asks through
`placeHoldersOn`), and they **have not answered it**.

- **Home** draws "A survey for you" first under the greeting, above the cards
  for a place, in every form a member's Home takes; **My programmes** draws it
  first under its heading. Week 1's page draws the run's before survey as its
  first card, above This week (`beforeSurveyCardFor`).
- A card says what it is ("A survey for you", the survey's title), its
  programme, how long ("14 questions, about 5 minutes"), when it closes and
  "Answer". **Never how many others have answered**: nothing of anybody else is
  read.
- "Answer" opens **the person's own link** (`/survey/<secret>`), the page their
  email opens, so it opens their own row whatever the run's own gate says
  about them that day. A card is drawn only on the person's own pages.
- **Nothing is read in a view-as session**, and a read that fails draws no card.
  What Home and My programmes may show for a place is held by `MAY_SHOW` in
  `tests/applications-place-in-the-member-area.test.mjs`; the card is its third
  entry.
- **A survey after an event has no card.** It reaches people by its email and
  its QR code, and a card's lines are a programme's; a row of one is never
  "theirs" here (`stillTheirs`).

### The survey at the end, on its programme's pages (Q48 B)

The survey at the end goes to everybody still on the programme at its end,
finished or not, and its programme's own pages draw it as "The survey at the
end" (boards wk-lastweek-phone, en-after-phone, en-after-nofinish-phone), by
`EndSurveyCard` in `src/features/surveys/cards/`:

- **On Home in the run's last week** (the reader's own calendar's last taught
  week), while it is theirs to answer: when to answer it (at the end of
  tonight's session, or of the last session on its day), the same questions as
  week 1 then how it went, how long, that the facilitators leave them the time,
  "Open the survey" and when it closes. It is the card `surveysWaitingFor`
  answers, moved from the top of Home to its place in the programme's cards,
  so it is never drawn twice.
- **On the programme page once the programme is over**: while it is theirs to
  answer, what it asks, how long and when it closes, with "Answer it"; once
  they have sent it, "Your survey at the end", the day they sent it and the
  day their name comes off it (`endSurveyFor`).

What it says of the survey comes from its own record (`atTheEnd` on the
card): its questions and minutes, how many questions it shares by id with the
survey it pairs with ("the same 9 questions as week 1"), and its closing day.
Nothing of anybody else's is read: never how many others have answered. There
is no "then and now" page (Q47 A).

## The leaving survey (Q46)

Confidential, like every survey on the site (Zach: "to allow us to do better
... technically optional but we have good reason to ask"). One per programme,
made by an admin from New survey's "Leaving a programme", from its own
template (`templateItems("leaving", ...)`): three questions, all required, about a minute,
written in the boards' voice for Zach to change before it is used. Its ids
(`q_leave_why`, `q_leave_stay`, `q_leave_again`) are the same in every
programme and are none of the stages', so leaving surveys compare with each
other and with nothing else.

- **It pairs with nothing**, and the stages still pair with each other.
- **It has no closing day.** It takes answers from when it is opened until an
  admin closes it by hand (`isOpen`).
- **Nobody presses send.** An admin **opens** it on its Open tab
  (`POST /api/surveys/[surveyId]/open`, `openLeavingSurvey` in
  `src/lib/surveys/leaving.ts`), which fixes its questions and words and the day
  names come off, as a first send does (`firstSentAt`), claimed once. Send,
  Remind and an email's test are refused for it in a sentence. Its test link
  is made with it, so an admin can see it as people will before opening it.
- **Its box** is sv-privacy's leaving box with the words that called it
  anonymous replaced by what confidential means here: only admins see who said
  what, the lead sees totals and comments and never names, facilitators never
  see the answers, nothing said changes the person's account or a future
  application, totals may go in reports to the committee and Kairos, and the
  name comes off two years after the programme ends, as for every survey.

**Reaching it.** Somebody who leaves the programme by their own hand, by
either door ("Leave the programme" or "I can’t make it", the one `leaveRun`),
while the leaving survey is open, gets their own row on it as they leave,
after the leave has committed (`reachLeaver`), with the secret in their own
link, counted once on the survey (`reached`). A second leave makes no second
row, so each person answers once per programme. Then:

- **The leaving email** (the existing one, transactional) links their own link
  in words that say it is confidential, in place of the outside form
  (`config/courses.dropOutFeedbackUrl`), which it offers only where no leaving
  survey reached the person: an open run, a programme with no open leaving
  survey.
- **The page that says they left** (`LeftProgramme`, and the notes and reading
  list pages, which draw it for somebody who left) draws its card, "Tell us
  why", while it is theirs to answer (`leavingSurveyCardFor`), and once they
  have answered, only that they left. Home and My programmes draw it as "A
  survey for you", as any waiting survey.
- **Nothing reaches anybody who did not leave.** Somebody staff took off the
  programme is not reached: they did not choose to leave, the run closes to
  them, and they get no leaving email. Nobody presses send, and nobody is
  reminded.

## The admins' pages

Run NAISI › Surveys (`/admin/surveys`): open, drafts and closed, each with its
answers, closing day and the way to its tabs; New survey. Each survey has four
tabs: **Questions** (the editor until it is sent), **Send** (above), **Who
answered** (names, for admins only, and the spreadsheet; each name opens that
person's answers, below), **Results**.

**Results** are made on the server and never carry a name. Every number has its
n beside it and the share of the people the survey was sent to (taken from the
survey's own record of each send, so it outlives names coming off); for the
leaving survey, which nobody sends, of the people it reached as they left
(`reached`, kept the same way). For each
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

**A programme's survey results for its lead** (Q46, Q49 A) are at
`/admin/admissions/forms/<form>/programmes/<programme>/surveys/<survey>`, under
the programme's head and linked from its Surveys tab (below): the same results,
for the programme's lead and admins (`loadProgrammeRun` first, a reviewer told
in a sentence), from the first answer, never a name, each question's comments
listed by their words and not in the order they came, so their order says
nothing of when, or after whom, each was written, and without the admins'
switch that leaves out answers sent after someone's first session (a smaller
set beside a larger one). The lead reads every kind of survey the programme
has of its own: before it, at its end, the follow-ups and leaving
(`LEAD_READS` in `src/lib/surveys/leadResults.ts`). A survey after an event is
no programme's, and another programme's is not this one's: each is answered
in a sentence.

## The lead's Surveys tab (sv-programme)

Each programme's tabs have **Surveys**, between Messages and Settings
(`/admin/admissions/forms/<form>/programmes/<programme>/surveys`), a link for
the programme's lead and admins and drawn like a tab not built yet for a
reviewer. Board sv-programme, with Q41 (no floors) and Q49 A (as answers come
in). The page asks `loadProgrammeRun` before it reads any survey; the admin
area is closed during a view-as session, and the page writes nothing.

**What it shows**, made on the server by `leadSurveysTab`
(`src/lib/surveys/leadTab.ts`) and drawn by
`src/features/surveys/lead/LeadSurveysTab.tsx`:

- **This programme's surveys**: each of the programme's own surveys of the
  kinds the lead reads, once it has gone out (sent, or opened for the survey
  about leaving), in the order of the stages, with "29 of 32 answered · closed
  Wed 4 Nov" and a way to its results. Below them, **Ratings** once the
  programme names a run, and **What to keep, change and drop** (the anonymous
  form's answers) once the survey at the end has gone out.
- **What changed**, once the survey at the end pairs with the before survey:
  how many answered both, C1 at stage 2 and up at each end ("Considering,
  planning or already doing it", "8 → 15 of 25") with who moved a stage, and
  C4's averages then and now with how many moved up. Beside it, **Beliefs
  about AI**, which reports and never targets, with a way to them at the start
  and the end. Once names come off, nothing pairs: it says so in the Results'
  own words and compares nothing, and every survey's totals stay.
- **How it went**, once the survey at the end has an answer: Q1, Q2 and Q3 of
  the questionnaire, each an average with a bar per point or per line.
- **The weeks**: the sources people rated on the week pages, up to three
  highest and the lowest, from the retrospective's count and its floor (an
  average shows from three ratings).
- **Your facilitators**: the Facilitator line of "How valuable was each
  part?", for every group together, with the board's note that facilitators
  never see it.
- **In their words**: every written answer's question of the survey at the
  end, five comments shown and the rest behind "See all", in the order of
  their words.

**One count each.** Every number on the tab is the one its own page shows,
through that page's reader: a survey's answers, its rate, its totals and
comments are its Results (`resultsView`, with the lead's order of comments);
"answered both" is the change view's pairing (`bothOf`); "considering,
planning or already doing it" is public numbers' count (`consideringOf` in
`src/lib/surveys/publicNumbers.ts`, which its own measure uses); moved up,
stayed and moved down, and the averages then and now, are the Results' Before
and now; the sources people rated are the retrospective's
(`readSourceRatings` in `src/lib/courses/sourceRatings.ts`, with its
projection of `itemId`, `rating` and `completed`, and `aggregateRetrospective`).

**Nothing about a person** reaches the tab: no name, uid, email address, row
per person, who answered or who did not. The lead never has the download with
names (an admin's alone).

**Not drawn**, because no record holds it (the questionnaire replaced the
board's questions): "How useful was each week?", each facilitator's own
scores, the comments by group and "Comments about facilitators are never
quoted or put in reports". Also not drawn: "Can be quoted" beside a comment
(not on Results either) and the report's download (sv-report is not built).
The board's "Results show once each survey closes" (Q49 B, which Zach did not
choose) reads "Results show as answers come in, never with a name.", and its
"Anonymous totals" for the source ratings reads "totals, never a name"
(ratings are kept with the account), each listed for the boards' designers to
confirm.

**The spreadsheet with names** (`POST /api/surveys/[id]/export`) is one row per
person who answered and one column per question (and per line), choices in their
words, never an address. It is a download the site records before it hands it
over (`dataExports`, kind `survey-answers`, scope `surveyId` and `roundId`), and
it is refused when that record cannot be written.

## Public numbers (sv-public)

Run NAISI › Surveys › Public numbers (`/admin/surveys/public-numbers`): an
admin picks numbers and quotes from a programme's own surveys and publishes
them as a "Last term" block on the public page of the course the programme is
tied to (pub-agi), and can take them down at any time.

- **Only the programme's own surveys** (`src/lib/surveys/publicNumbersLoad.ts`):
  its before survey, its survey at the end and its follow-ups, one per stage.
  Never the survey about leaving, a survey after an event, the anonymous form,
  the ratings or the Kairos file, even where they hold the same question ids.
- **The numbers** (`src/lib/surveys/publicNumbers.ts`, `MEASURES`): a fixed
  list, each a sentence true of the counting beside it, read by the
  questionnaire's fixed ids: would recommend it (Q1, 9 or 10 out of 10), getting
  what they wanted from it (Q3's average), considering, planning or already
  doing work on AI safety (C1 at stage 2 and up, at the start and at the end:
  `consideringOf`, the one count of it, which the lead's Surveys tab shows too),
  explaining the case and the main objections (C4's averages), knowing the field
  (C5's averages), knowing their next concrete step (C7's first line, agree and
  strongly agree), moved towards AI safety (A1) and took a concrete step (C9).
  Before and after count only the people who answered that question both
  times, while their names are on the answers. **Beliefs about AI are never
  offered**: they are reported, never targets (`MEASURE_QUESTIONS` never names
  C8, which holds "Not sure the risk is real", or C2).
- **No threshold** (Zach, 26 Oct 2026): every number is offered from its first
  answer, with its base beside it for the admin ("From 27 answers", "From the
  25 who answered both"), and the block's closing line says how many answered
  at the end and how many of them at the start too.
- **Quotes**: only comments whose writers ticked "You can quote this, without
  my name" (see The quote tick), folded to one paragraph, listed by their words
  and never by when they came. Nothing else of any answer is offered.
- **The record**, `publicNumbers/{roundId}__{programmeId}` (one per programme
  of a term's form; `src/lib/publicNumbers/model.ts`), server-only in both
  directions, holds exactly what is published: each number's figure, words and
  base, each quote's words, the heading, the line under each quote ("Autumn 2026
  fellow"), the closing line, the course, the term, the day of the run's last
  session (which orders a course's terms) and when and by whom. Never a
  respondent, an answer or a survey, so a published quote is linked to nobody
  and a later answer never moves a published number.
- **Publish** (`POST /api/surveys/public-numbers`): admins only, refused during
  view-as. It works the offer out again from the surveys and refuses (409) a
  pick it no longer holds, so what is published is what was previewed; it
  replaces the programme's record whole. **Take it down**
  (`POST /api/surveys/public-numbers/take-down`) deletes it.
- **The public page** reads it on the server through `fetchLastTerm`
  (`src/lib/publicNumbers/fetch.ts`), one equality on `courseId`, the latest
  term's, projected to the block's own fields (`blockOf`): no publisher, id,
  base or date reaches the HTML. Nothing published, no section; a failed read,
  no section. The block (`src/features/publicNumbers/LastTermBlock.tsx`) lays
  itself out by its own width, so the admins' preview shows it as a phone (390)
  and a computer (78% of 1440) will.

## One person's answers (sv-person)

Each name on a survey's Who answered tab opens
`/admin/surveys/<survey>/answered/<who>`: that person's answers, usually for a
request to see or delete them. `<who>` is the person's uid, or on a survey
after an event `g_<signupId>` for a guest (`whoOf` and `subjectOf`).

- **Admins only**, never a programme's lead, a facilitator or a committee
  member: the page sits in the `(admin-only)` tree, which a view-as session
  closes, and the route it asks
  (`POST /api/surveys/[surveyId]/people/[who]`) refuses view-as first and then
  anybody but an admin, before the database.
- **The page reads nothing of the person.** It reads the survey's name for the
  way back; once it is open in the admin's browser it asks the route, once. So
  a prefetch or a preview of the address records nothing and shows nothing.
- **Every opening is recorded first** (`openSurveyAnswersRecorded`, in the
  openings log `recordOpenings`, `src/lib/firestore/recordOpenings.ts`): kind
  `survey-answers`, who opened them and their name then, whose they were
  (`subjectUid`, or `subjectSignupId` for a guest), the survey they were
  opened from, every survey shown (`surveyIds`), and when. Never anything the
  answers say. Before the row is written only the surveys' own records are
  read; the person's name, rows, answers and group are read once it is
  stored. When it cannot be written the route answers 500 "We couldn’t record
  that you opened these answers, so they stay closed. Try again." and nothing
  of the person has been read. An opening of somebody with nothing there is
  recorded too.
- **What it shows** (`src/lib/surveys/onePersonLayout.ts`): on a programme,
  every survey of the same programme that has been sent or opened (the four
  stages and leaving), in that order. When the person was on both the start
  and the end and answered at least one, **The change questions**: those the
  two ask the same way (same id, same type), in the before survey's order and
  numbering, the start and the end side by side, each column read against its
  own survey's options, the end's wording beside the start's where it
  differs. Then each survey's own questions under its title ("The before
  survey only.", "The after survey only." beside the change questions, the
  survey's name otherwise), a survey they were sent and did not answer said
  in a line. After an event, its one survey. Every question as the survey
  holds it: its words, its line, its scale's words. A question left blank
  says "No answer": an optional one, a part of a grid of parts, or any
  question of answers sent before every question was required (30 Oct 2026). The side column says when the name comes off (the surveys' own
  `namesOffOn`) and who has opened these answers (the log, newest first). The
  head names their programme, their told group, and how many of the surveys
  they were on they answered ("Answered both").
- **A name that has come off has nothing to open.** When names have come off
  every survey shown, the route says so (410) and records nothing. A deleted
  account's answers name nobody, so its page says the account was deleted and
  there are none.
- **Not built**: the board's download of one person's answers and deleting
  them (its Export and Careful cards). Neither is drawn until it exists.

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
- **What is published** (public numbers) names nobody and holds nothing that
  points back at an answer, so an account's deletion has nothing of it to find
  and leaves it; a quote whose writer's account is gone stays until an admin
  takes it down, which the policy says they will on request. A form's destroy,
  a run's destroy and names coming off leave it too: it is the programme's
  public page's, and only Take it down deletes it.
- **The openings of one person's answers** are kept as the record of
  downloads (`dataExports`) is: an account's deletion takes none, in either
  direction (the openings of the account's answers, and those it made as an
  admin), names coming off take none, and a run's destroy, which deletes the
  openings log's rows by `runId`, never finds one, since none holds a run. The
  answers outlive every run, and a survey after an event has none. A row names
  a person by an id and holds nothing they said.
- **The anonymous form's answers** (below) name nobody, so an account's deletion
  has nothing of them to find and removes none. They go with the programme's
  course run, in the run's destroy (stage `anonymousFeedback`: the form first,
  then the answers waiting and the answers kept), and a form's destroy leaves
  them, as it leaves the surveys.

## The anonymous form at a programme's end

The questionnaire's separate anonymous form asks what to keep, what to change
and what to drop (Zach, 26 Oct 2026: "anonymous feedback form should be
somewhere else"). It is its own small thing, never an anonymous mode of the
surveys: `src/lib/anonymousFeedback/` (the library),
`src/features/anonymousFeedback/` (the page's parts and the card),
`src/app/feedback/[token]/` (the page), `src/app/api/feedback/` (the route),
the job `anonymous-feedback-move` and the readers' page under a programme's
tabs, `.../programmes/[programmeId]/anonymous-feedback`. No file of it reaches
survey code, and survey code takes from it only `openAnonymousForm`,
`closeAnonymousForm`, `anonymousFormLinkFor` and the card.

| Collection | One per | Holds |
| --- | --- | --- |
| `anonymousFeedbackForms/{surveyId}` | programme, keyed by its survey at the end | the form it was on, the programme, its run, its name and kind, the secret in its one link, when it opened, when it closes, when it was closed by hand |
| `anonymousFeedbackWaiting/{autoId}` | answer, until the night's move | `ANSWER_FIELDS`: `roundId`, `programmeId`, `runId`, `keep`, `change`, `drop`, `day` |
| `anonymousFeedback/{autoId}` | answer, kept | the same seven fields |

All three are server-only in both directions (deny-all rules). Every query is
one equality (`token`, `roundId`, `runId`) or a read of the small waiting
collection.

**Opened, linked and closed by the survey at the end.** Its first send opens the
form (asked again by "joined since", which changes nothing once open), with the
closing time that send fixes; Close closes it with the survey. Once a person
has sent the survey at the end, its end shows a card linking the form, at one
address for the programme (`/feedback/<secret>`), the same for everybody, with
no referrer. A test link, the before survey and the follow-ups show no card.

**What it keeps, and what it never reads.** The page and the route are drawn
from the link alone: no session, no cookie, no view-as marker, no header but
the client's address inside the in-memory rate limit's key, and nothing is
logged. The route does not call the view-as guard, which reads a cookie: nothing
it keeps names anybody, so there is nobody for a view-as session to be recorded
as. The browser sends the answers with `credentials: "omit"` and no referrer.
An answer is the three answers (each up to 2,000 characters, all three blank
refused), the programme and the London day. Two limits keep floods out, both
in memory: 30 a minute per address, 200 an hour per form. No captcha: one would
hand the caller's address and browser to a third party.

**The day, not the time.** The database stamps every record with the minute it
was written, and an answer comes in minutes after its writer sent the survey at
the end, which is kept with their name. So an answer waits in
`anonymousFeedbackWaiting`, and once its London day is over the job
`anonymous-feedback-move` (every tick; registers on, since it emails nobody)
moves that day's answers in random order, up to 200 to a transaction, into
`anonymousFeedback`, each under a new id, and deletes what waited. A kept
answer's own time is then the move's, shared with its day. The database's
recovery copies (up to 14 days) and the hosting provider's request logs still
hold a time for a while; the privacy policy says so, and that neither is ever
matched to the answers.

**Who reads it.** The programme's lead and admins, on the readers' page,
decided by `loadProgrammeRun` before any answer is read (a reviewer is told it
is the lead's and admins'; anybody else meets the admissions gate or "there is
no programme here"; the admin tree is closed during view-as). It shows the
form's link and where it stands, how many answers, and each question's
answers in alphabetical order, from a day that is over only (waiting answers
included, so it reads the same before and after the move). Nothing it is handed
holds a day, a time or an id.

## Surveys after events

The survey an admin sends after one of NAISI's events (boards sv-new "After a
social", sv-send, sv-social-phone, sv-results, ev-manage's Survey after tab).
Confidential like every survey (Q43): the answers keep the person, an account
or a guest, and only admins see who said what. Event-only code lives in
`src/lib/surveys/events/`; the shared survey files tell an event's survey apart
with `isEventSurvey` and hand it over.

- **The record.** A `surveys` document with `kind: "event"`, `audience: { kind:
  "event-came" | "event-signups", eventId }`, a top-level `eventId` (one
  equality finds an event's survey; one survey per event) and `event: { title,
  startAt, endAt }` as it was when made, so it stands without the event. The
  programme fields are empty. Its rows and answers are `surveyPeople` and
  `surveyAnswers` like every survey's, read and written by
  `src/lib/surveys/events/store.ts` alone.
- **Who it reaches** (`events/audience.ts`, through `readAudience`): the people
  who came, from check-in (a sign-up's account, or the guest by their sign-up;
  an account that walked in; a walk-in with no account, by the check-in the door
  made, emailable only when they left an address), or everybody whose sign-up
  is confirmed (never a test sign-up). Never anybody who did neither. A person
  with no account is `respondent: { kind: "guest", signupId }`, the sign-up's or
  the door's record's id; their row is `{surveyId}__g_{signupId}`. The
  programme code reads accounts only (`normalizeSurveyPerson`); the event code
  reads both (`normalizeEventPerson`).
- **Made** from "After a social" (`events/template.ts`, five questions, about a
  minute, fixed ids `q_ev_*`, every one required but "Anything we should
  change?", which starts optional) for a published event that is coming up or no more
  than a week over, with who it emails and a closing day no earlier than the
  event's (`POST /api/surveys` with `template: "event"`). Names come off two
  years after the event (`eventNamesOffOn`), by the `surveys-names-off` job as
  for every survey.
- **Opened, then emailed.** "Open it" on the Send tab (`POST
  /api/surveys/[surveyId]/open-at-event`, admins, emails nobody) opens it for
  its QR code at the event; the first email opens it too if nobody did. Either
  stamps `firstSentAt`, which fixes its questions as every first send does. The
  first email ("Email 14 people", a test first, claimed once by a `first`
  press) may name its audience (`audience: "came" | "signups"` in the send's
  body), which it fixes; "Send to the 2 who came since" and Remind work as for
  a programme's. Every press records who pressed it (`byUid`). The emails are
  notices, surface `event-survey`, with the board's words
  (`events/words.ts`), to an account's own address or to the address a guest
  or walk-in gave the event, each with their own link. The email skips anybody
  who has answered.
- **The QR code** (`events/code.ts`): a short link per event's survey,
  `<word>-survey`, campaign "Surveys", to `/events/<id>/survey`, made with the
  survey (and again by Open), permanent like every printed code, drawn and
  downloaded through check-in's QR routes by admins and, while the survey
  takes answers, by the people who may draw the event's door code (admins and
  SU-recognised committee, `runsCheckIn`), who show it at the end of the event
  from the event's Survey after tab (`surveyCodeAtEvent`, below). Its page
  (`events/codePage.ts`) is outside the route groups and never `notFound()`:
  signed in, somebody who signed up or came answers it (their row is made as
  they answer, `via: "signed-in"`); somebody who did neither is told so, with
  the way to check in while the door is open; signed out, it asks them to sign
  in and tells a guest to use their emailed link.
- **What an answer keeps**: `surveyId`, `eventId`, `respondent`, `answers`,
  `sentAt`, `via`. No group, nothing before Send, no record of opening it.
- **The admins' pages** draw it with its own Send tab (`EventSendTab`: who
  answers, the QR code with Open it, the email with the choice of who it goes
  to), Who answered (guests by the name they gave the event), and Results with
  its own numbers above (answers by QR code and by email, who came, the email's
  rate) and every rate of the answers (`ofAnswers`). Its download is the
  programme table less the group's column, logged as `survey-answers` with
  scope `{ surveyId }`.
- **The event's Survey after tab** (`/events/manage/[id]/survey`): everybody in
  the events area reads that it went, who sent it and when, and who to ask for
  the summary (`events/tab.ts`, which reads no answer and no row); admins read
  the results there too. An event's organiser does not see its results (Q42).
  The people who may draw the event's door code (`runsCheckIn`: admins and
  SU-recognised committee) are shown the survey's QR code there while it takes
  answers, with "Download PNG" and "Show full screen" and nothing else of the
  survey's: not "Open it" (opening fixes its questions, an admin's act on the
  Send tab), not its answers, not who answered. While it is a draft they read
  "Its QR code shows here once an admin opens the survey." One function
  decides it for the tab and for the image route: `surveyCodeAtEvent` in
  `src/lib/surveys/events/code.ts`.
- **A walk-in's email** goes at the earlier of the survey's close and a week
  after the event (Q44): `walkInEmailGoesAt(event, surveyClosesAt)`, kept on
  the check-in record and moved by `setWalkInEmailDeadlines` whenever the
  survey is made, saved or closed by hand (at once when closed), so the
  `event-check-ins-tidy` job stays the one deleter. Adding somebody who came
  stops when the survey closes too.
- **Deletion.** An account deleted takes its name off its answers at once
  (`takeNamesOffForAccount`); a guest's comes off with everybody's, two years
  after the event. An event deleted leaves its survey, as a form's destroy
  leaves a programme's: the survey keeps the event's name and day.
- Guards: `tests/surveys-events.test.mjs` (every route and page as every kind of
  caller), and the policy's "survey after an event" block in
  `tests/privacy-policy.test.mjs`.

## This term in numbers

Run NAISI › Surveys › This term in numbers (`/admin/surveys/term`, board
sv-term, Q51 B): the term at a glance for admins, each event's check-ins and
survey, how many different people came and how many came back, and each
programme's before and after. Counts only, never a name; every count with its
base; no threshold (Zach, 26 Oct 2026). The code: `src/lib/surveys/term/`
(`choose.ts` the term, `load.ts` the reads, `model.ts` the counting,
`words.ts` the board's words, `totals.ts` the file), the page and
`GET /api/surveys/term/totals`.

- **Admins only, three times over**: the `(admin-only)` layout, the page's own
  `canRunSurveys`, and the loader, which asks `canRunSurveys` and the check-in
  bar (`runsCheckIn`) before it reads anything. A view-as session's account is
  never an admin's, so it never gets in.
- **The term, chosen from records** (`chooseTerm`): an application form that
  has opened (not a draft, cancelled or archived). This term is the one whose
  decision day went out most recently, so next term's form, open and
  undecided, does not take over and this term's surveys at the end stay on the
  page; before any decisions, the one that opened most recently. Its label is
  the form's. Its **events** are the published events that started since its
  form opened, up to now (one range on `startAt`), oldest first; its
  **programmes** are the form's that name a course run, in the form's order.
  Only this term is shown: there is no way to look at an earlier one.
- **Every number through the reader its own page uses**, so the two can never
  disagree: an event's Came is its Check-in tab's rows (`doorRows` over
  `loadEventAtTheDoor`) and its check-ins whose names have come off, what
  `doorCounts` counts with `namesOffOf`; its survey's answers and
  "How was it?" are its Results (`resultsView`); Started and Finished are the
  Kairos report's, through the one shared count (`headcountOf` in
  `src/lib/courses/finishing/headcount.ts`); Answered both is the change
  view's pairing (`bothOf` in `change.ts`); the survey at the end's "27 of 31"
  is every answer it holds of the people its sends reached (`sentCountOf`, as
  its Results). `tests/surveys-term-numbers.test.mjs` holds each to its reader.
- **Different people, and who came to two or more**: the counted check-ins of
  the term's events, matched by account (and the account's own address), and
  a sign-up made without an account by the address it gave. A walk-in with no
  account is never matched: the address a walk-in leaves is for that event's
  survey and nothing else. When such walk-ins came to two or more of the
  events, the board's sentence says the count may hold one twice and the
  repeat count may miss some. A check-in whose names have come off is one
  more person nobody can match; it is no walk-in, so it never shows that
  sentence.
- **The notes**: nobody counted and the event ended before check-in was first
  used on the site (the first check-in its events hold, or any before the
  term): "Before check-in"; else "No sign-up and no check-in" for an event
  with no sign-up, else "No check-in". A no-sign-up event with people counted
  says how they were checked in, as the Check-in tab groups them ("by QR",
  "at the door" for the door list and those added later).
- **A programme's row**: "Considering, planning or already doing it" is C1 at
  stage 2 or more (`CONSIDERING_STAGE`), at the start and at the end, of the
  people who answered both surveys; somebody who skipped C1 at one end is not
  counted at that end. Until the survey at the end is sent, the cell says when
  it comes: the month of the run's last session and its last taught week
  (`lastTaughtWeek`), "In February, after week 10".
- **The file** ("Download totals (CSV)") is the page's own view as three
  blocks (the term, its events, its programmes). It names nobody, so it is
  **not** a download the site records: `dataExports` is for files of named
  people, the five the privacy policy lists, and the Kairos report of totals
  is not recorded either. A GET that writes nothing, so the link works before
  the page's script arrives.
- **Retention**: nothing is stored. The counts are worked out each time from
  the check-ins as the Check-in tab counts them, and the check-ins keep names
  for a year after the event.
- The privacy policy says it in "When you come to an event", tied in
  `tests/privacy-policy.test.mjs` ("this term in numbers").

## Not built yet

Downloading or deleting one person's answers from their page; "Can be quoted"
beside a ticked comment on Results (sv-results) and on the lead's tab; the
lead's Surveys tab's per-week usefulness and per-facilitator scores, which no
survey asks; and an option's own words ("Something else: ..."). The model is built so none
of them needs a rewrite: another `audience.kind`, another `respondent.kind`,
the same records.

## Check-in, for the surveys after events

Check-in is built (`src/lib/events/checkIns.ts`, `eventCheckIns`), so an event
survey has who came to send to. What it can rely on:

- One record per person per event: a sign-up (`rsvpId`, and `uid` when the
  sign-up has an account), an account with no sign-up (`uid`), or a walk-in
  with no account (`name`, and `email` only if they want that event's
  survey). A guest's sign-up is the `{ kind: "guest", signupId }` respondent
  above.
- A walk-in's email goes on `emailGoesAt`: when the event's survey closes, or
  a week after the event if that comes first (see "Surveys after events"). The
  walk-in form and the Check-in tab say whichever day it is.
- Names come off a year after the event (`event-check-ins-tidy`), and at once
  when an account is deleted. The record still counts as one person who came,
  by a sign-up or walking in and how, wherever who came is counted
  (`namesOffOf` and `doorCounts` in `src/lib/events/checkInView.ts`): the
  Check-in tab, the door list, a survey's results and This term in numbers. It
  is listed nowhere, and the sign-up it came by keeps no tick, so each is taken
  to be one of the confirmed sign-ups with no tick, and the lists say so.

## The guards

`tests/surveys-items.test.mjs` (the template word for word, the model, the box,
both emails, totals), `tests/surveys-required.test.mjs` (required unless
marked optional: the rule, every template walked both ways, what answered
means for each type), `tests/surveys-routes.test.mjs` (every route and page as
every kind of caller), `tests/surveys-deletion.test.mjs` (both cascades),
`tests/surveys-no-tracking.test.mjs` (no activity, no address, no page that
writes), `tests/surveys-quote-tick.test.mjs` (the box and the tick, one
decision; the tick kept with its answer), `tests/surveys-public-numbers.test.mjs`
(the counting, what is read and never read, both routes and the admins' page as
every kind of caller), `tests/public-numbers-last-term.test.mjs` (the block
on the public page, from the record alone), `tests/surveys-one-person.test.mjs`
(one person's answers as every kind of caller, the opening recorded before
anything is read, and refused whole when it cannot be), and This term in
numbers' three: `tests/surveys-term-numbers.test.mjs` (the counting, and every
number held to its own page's reader), `tests/surveys-term-numbers-page.test.mjs`
and `tests/surveys-term-numbers-file.test.mjs` (the page and the file as every
kind of caller, and nothing about a person in either), and
`tests/surveys-lead-tab.test.mjs` (the lead's Surveys tab and each survey's
results under it as every kind of caller, every number held to its own page's
reader, and nothing about a person in either).

The privacy policy says what a survey keeps, who sees it, when names come off
and what a deletion does, under "When you answer a survey", and
`tests/privacy-policy.test.mjs` holds each of those sentences to the code here:
who reaches survey code, the fields an answer keeps, the notice lane, the
names-off job and the deletion step; what the surveys ask, by kind, against
every question of every template, both ways; the two profile values a survey
offers; the survey at the end showing a person their own earlier answer; and
the follow-ups' box, who it sends them to and how it is changed; and the
survey about leaving: who it reaches and how, what it asks, who reads it,
that the lead may still tell whose an answer is when few have left, and the
page that says somebody left showing its card; and the lead's reading of the
programme's surveys: totals and comments as answers come in, never a name, who
answered or a download, that the lead may still tell whose an answer is when
few answer, and the average rating of each source from three. A change that
alters any of them changes the policy first: a template that asks a new kind
of question fails until the policy names it.

`tests/anonymous-feedback.test.mjs` drives the anonymous form, its link, its
move, its readers and its destroy as every kind of caller, and reads back every
record it keeps. `tests/anonymous-feedback-no-trace.test.mjs` walks every file
both of its doors reach for a session, a cookie, a header, an address, a uid or
a log line, and holds the wall between it and survey code both ways.

`tests/surveys-no-tracking.test.mjs` passes over exactly one sentence that holds
one of its activity names as prose, F1's "What’s your main activity now?",
written as a string; the name anywhere else is still caught, and the entry
fails when the sentence is gone.
