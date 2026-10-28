# The application system

One application form a term, for every programme. A person ticks the
programmes they want, ranks them, says whether they would facilitate, and
answers only the question sets that apply to them. Each programme's lead
reviews and decides for that programme. Everybody hears on one decision day.

This document is the contract. The shapes are in
`src/lib/applications/model.ts`, and every rule below is a pure function with a
test, so where this page and the code disagree, the code and its tests win and
this page is the bug.

## The words

Use these, one way each, in code and in the interface.

| Word | Means |
| --- | --- |
| application form | The one form for a term. Stored on an admission round. |
| programme | A fellowship or the incubator, for one term. |
| stream | A programme's own questions. The only questions that can be scored. |
| question set | A group of questions shown to the people it applies to: everybody, a kind of programme, one programme, or people who would facilitate. |
| rank, 1st choice | Applicants rank what they tick. `choiceNumber()` gives 1 for a 1st choice. |
| lead | Decides one programme. |
| reviewer | Reads, scores and comments on one programme. Cannot decide. |
| Accept, Pool, Decline | The three decisions a lead can make. Decline is for spam or not eligible. |
| pooled applicant | Somebody no programme they ranked took. The committee's word, never shown to them. |
| invitation | An offer of a programme they did not pick. They accept it. |
| No offer this time | What a pooled applicant with no invitation hears. |

Applicants never read "waitlist" or "rejected" about a programme decision.
`WORDS_APPLICANTS_NEVER_SEE` in `words.ts` is the list a test holds copy to.

## Where the data is

| What | Where | Written by |
| --- | --- | --- |
| The form | `admissionRounds/{roundId}` with `formVersion: 2` | Admins, through routes |
| Question sets | `admissionRounds/{roundId}/questionSets/{setId}` | Admins, through routes |
| An application | `admissionApplications/{roundId}__{uid}` | The applicant, through routes; decision day |
| A review | `admissionReviews/{roundId}__{applicantUid}__{reviewerUid}` | That reviewer, through a route |
| Decisions | `admissionDecisions/{roundId}__{uid}` | Leads and admins, through routes |
| Assessments | `admissionAssessments/{roundId}__{uid}` | An admin asking Claude or Pangram, through a route |

Every one of these is `allow read, write: if false`. Nothing is read or written
from a browser. The routes run on the Admin SDK and are the boundary.

A round with `formVersion: 2` is an application form and is edited only by the
application form's own routes. The older round editor and its routes belong to
rounds without it.

### What is kept apart from an application

Three things about a person are not on the application, and each is held
narrower than the application is.

**The access-requirements answer.** The last step has one optional box, with
the older form's question, and what somebody writes there is in practice
about their health, a disability or who they care for. It is stored where the
older rounds store it, `admissionApplicationPrivate/{roundId}__{uid}`: a
collection of its own, at the application's own id, holding that one answer.

- It is not in `draft` and not in `sent`. It is saved as it is typed, through
  a route of its own (`application/access-requirements`), there is one copy,
  and an admin reads what is stored at that moment. It can be changed until
  the close and needs no second Send. The form saves the draft first, because
  the first save of a draft is what creates the application, and a row is
  only ever written beside one: the application's id is the only way back to
  the row. Both deletions take the row in the application's own batch.
- The applicant reads back their own, and a view-as session is refused, the
  read included, because the session is then not theirs.
- **Only an admin reads anybody else's**, by pressing a button on the review
  screen, and every read appends a log line of kind `access-requirements-read`
  in the transaction that reads it
  (`applications/[uid]/access-requirements`, a POST). A lead and a reviewer
  are refused before anything is read. The answer is in no payload a review
  screen is sent and not in the record kept afterwards.
- One file under `src/lib/applications/` names the collection
  (`applicant/accessRequirementsDoc.ts`), two modules import it, and two
  routes import those. `tests/applications-d2-zeta-access-requirements-boundary.test.mjs`
  walks the tree for anything wider, and lists every route in the site that
  can reach an answer with what it is.

**The record kept after a term.** `memberRecords/{uid}/applications/{roundId}`
(what they applied for, the outcome, average scores, each reviewer's overall
comment) is written when a term settles or a form is destroyed, and it
outlives both the form and the account. It holds reviewers' comments about a
named person, so it is read by admins and nobody else: one panel shows it, on
the admin Members page, and `tests/applications-d2-zeta-member-record-readers.test.mjs`
walks the tree for a second.

**The log.** A log line about an application names the applicant by account
id and never by name. The log is kept when an account is deleted, so a name on
a line would outlive the person's account; the id leads to the name only while
there is an account. That covers the five `application-` kinds and
`access-requirements-read`: who a line is about is `subjectUid`, and the
sentence says "an applicant". Anything that draws a line looks the name up
then, and says "somebody whose account has been deleted" when there is none
(`subjectLabel()` in `review/audit.ts`).
`tests/applications-d2-zeta-audit-names.test.mjs` lists every file that
names one of those kinds and runs every writer.

### The fence

A form sits in the same collection as the rounds that came before it, so every
route, page, job and lookup written for those rounds can be pointed at one.
None of them knows a form's programmes, its question sets or decision day, and
none may treat a form as a round. Each asks `isApplicationForm` of the stored
document and then does one of three things.

- **It refuses.** Every older route answers 409 with one sentence
  (`refuseApplicationForm` in `src/lib/admissions/formFence.ts`), after its own
  "not found" answers and before it writes, sends or serves anything. The
  older applicant routes do it through `loadRound`. The older pages stand
  aside the same way. The round page shows that sentence and, for an admin,
  keeps the danger zone, and it links to the form's own pages for somebody
  those pages open for: an admin, or a lead or reviewer the form names. The
  appointment queue answers as it does for a round that is not there.
- **It leaves the form alone.** The two scheduler jobs that walk open rounds
  skip a form and count it, so nothing older emails an applicant on one. The
  lookup behind the course pages drops a form, so one is never offered as a
  single course's own intake. A course's page does offer the form, by another
  door that the form's own code decides: see "A programme and its course
  page".
- **It serves both**, on purpose: destroying a round, deleting an account, the
  member record, the list of one person's applications, the apply page and
  the page that reads one application back. Each of those two pages shows a
  form on the form's own screen, which it asks for first. Everything after
  that is the page's older half, and to it a form is a round that is not
  there: the older apply flow's loader answers nothing for one, and the page
  that reads an application back answers not found, so neither older screen
  is ever drawn for a form. The apply page's title keeps the same order, so a
  form that is still a draft has no title of its own, as it has no page.

The refusal comes after a route's "not found" answers, never before them. A
form nobody has opened reads to an applicant as a round that is not there, and
somebody who may not see a round is not told it is a form. So who is asking
comes before what the round is, on every older route that refuses: an account
with no role is given one answer by each of them, whatever its id addresses
(a form, a form nobody has opened, a round of the older kind in any state, or
nothing). The decide route reads the round first, because its decider is
named on the round, and answers "not found" to anybody who may not see it
before it says anything else.

`tests/admissions-form-fence.test.mjs` walks the tree for every route, page and
layout with a round id in its address, and for every other file that can
address a round. Each is listed with what it does about a form, and what its
entry says is read out of the source and then executed. Every handler that
refuses a form itself also says what its refusal comes after, and each staff
route is run as an account with no role against everything an id can address.
A new one fails until somebody decides what it does.

The routes under `/api/admissions/forms` are the form's own, and the routes
under `/api/admissions/rounds` are the older ones. A form's own route reaches a
round only through `src/lib/applications/`, whose loader answers null for a
round that is not a form, so the fence holds in the other direction too.

## The four rules everything else follows from

**1. An applicant's own document changes only when the applicant acts, when
decision day publishes, or when an admin offers a place somebody gave back
after it** (see "A place given back after decision day"). Scores and comments
are in `admissionReviews`. Each
lead's decision, each pooled applicant's outcome and each exception are in
`admissionDecisions`. Neither is reachable from anything that serves an
applicant: `tests/applications-boundary.test.mjs` walks the import graph of
every route gated by `requireApplicant(`, every public page and
`src/lib/applications/repo.ts`, and fails if one arrives at
`src/lib/applications/staffRepo.ts` or at a file that names either collection.
So "nobody hears anything early" is a property of the import graph, not
something each screen has to remember.

One field is written by neither: `invitation.lastReminderOn`, the London day
of the last reminder for an invitation nobody has answered. The reminder job
(`src/lib/scheduler/jobs/applicationInvitationReminders.ts`) writes today
into it before it sends, so a day sends at most one. It reads no decision
document and changes nothing the person was told.

**2. There are two copies of what the applicant wrote, and what a send
replaces is kept.** `draft` is what the form is showing and is saved as they
type. `sent` is the application of record and is replaced whole each time
they press Send. Reviewers read `sent` and nothing else. An applicant can
change their answers until the close, and a half-made change never unseats
the application they already sent.

When they do send again and something is different, the application of
record that send replaces is kept on the same document (`sentHistory`), with
when it was sent, and the people reviewing the application are shown what
each part said before. A send that changes nothing keeps nothing. See "What
an application said before".

**3. One place a term.** A person is placed on the highest programme in their
own ranking that accepted them (`placementFor`). A second place exists only as
an admin's named exception.

**4. Nothing is stored that can be worked out.** Section scores, choice
numbers, who is pooled, free places and whether decision day is ready are all
derived when they are read (`scoring.ts`, `decisions.ts`). A lead changing
their mind needs no recount.

## Who can do what

`src/lib/applications/access.ts` holds the only predicates a staff route uses.

| | Reads an application | Scores and comments | Decides | Edits the programme | Runs the term |
| --- | --- | --- | --- | --- | --- |
| Admin | every one | every programme | every programme | every programme | yes |
| Lead of a programme | those that ranked it, and anybody who joined it by invitation | that programme | that programme | that programme | no |
| Reviewer of a programme | those that ranked it, and anybody who joined it by invitation | that programme | no | no | no |

"Runs the term" is the form itself, the outcome each pooled applicant hears,
revoking an acceptance, an exception, the decision-day send, and offering a
place given back after it.

**A refusal says nothing about an application its caller may not read.**
Deciding is a right over a programme, and reading is a right over one
person's application. So a writer that is handed somebody's id asks
`canReadApplication()`, the predicate the review screens read by, before it
names the applicant or says where their application stands. Somebody who may
not read the application is answered exactly as if nothing had been sent: the
same status, the same words and no name, whatever the real reason, for one
decision and for several at once. Somebody who may read it is told what is
in the way. `tests/applications-readable-before-answering.test.mjs` lists
every function under `review/` and `decisionDay/` that takes the database,
with what it is handed and what holds it, and reads each entry's claim out
of the source.

**Nobody reads or decides their own application on a committee screen.**
Anybody on the committee can apply, an admin included, and what is scored
and decided about a person is not theirs to see before decision day. So
every committee screen is built for whoever is looking, with their own
application left out before anything is listed or counted: the review list
and the review screen (`termPictureFor()` in `review/term.ts`), and pooled
applicants, decision day and the term page's pooled numbers (`termsFor()` in
`decisionDay/plan.ts`, read as `shown`). A number that counted it, beside a
list that did not show it, would say where it stands, so it is in no number
either: not a count of people, and not a programme's places. The two pages
an admin runs the term from say so in one line whenever the viewer has
applied, wherever their application stands.

Every writer refuses the caller's own id in one sentence (`OWN_APPLICATION`
in `review/refusals.ts`), before anything is read: a decision, an acceptance
taken back, and the outcome a pooled applicant hears. "Everybody with nothing
picked" is everybody but the caller. Their own outcome is another admin's to
choose. The writer of a pooled outcome still counts free places over the
whole term, whoever is asking, so an invitation always has a real place
behind it.

**The send still tells them.** Decision day is one send for the whole term,
and an admin who applied hears on it like everybody else. `termsFor()` hands
back the whole term beside the one the viewer is shown, and the whole term is
read for two things only: the send itself, and whether it may go
(`sendBlockersFor()`). An application of the viewer's with no outcome holds
the send like anybody's, a press publishes their result and emails them, and
the term is marked as sent only when they have one. What holds the send is
said in the words of what the viewer is shown, and when the only thing in
the way is their own application, one sentence says that and nothing about
what it needs. The number a press sends back is the number the page showed,
so it is counted the way the page counted it.

`tests/applications-own-application.test.mjs` lists every function that
reads the committee's lists of applications, decisions or reviews, with
whether it leaves the viewer's own out or why it reads everybody, and every
function that holds the whole term, with what it does with it.

**A view-as session is not the applicant.** Admin "view as" borrows a
member's session, so every read addressed by "the caller's own uid" would be
the member's. An application is its owner's to read: the people who review it
read what was sent and never the draft, and the SU membership answer is
shown to nobody but an admin, on one page. So while a view-as session is live
(`markerIsLive`, the one comparison the admin area and the write guard go by)
the person's own application is not shown and not read. The form
(`/apply/<roundId>`), the list (`/applications`) and the page for one
application (`/applications/<roundId>`) each draw a notice in its place
(`src/features/applications/viewAsNotice.ts`). The form's own `GET` and the
list's `GET` refuse, as every write already does. The dashboard card offers
the way to the list and names nothing on it. Whether the member holds a
place is not asked either (`holdsPlace()`), so the dashboard and the list of
their programmes (`/learn`) cannot tell, and do what they do for somebody
who holds one: neither says the member is on nothing, and neither says they
are not. The check comes before the read
on each of them, so nothing of the application is fetched to be left out
afterwards, and nothing of it is in the page. A marker left over from a
session that has ended is not a session. A round of the older kind keeps the
rule its own page states. `tests/applications-view-as-own-application.test.mjs`
lists every place under `src/app` and `src/features` that reads the caller's
own application, with how each is held to the check.

**Somebody who joins by invitation is read from the moment they accept, and
not before.** An invitation is to a programme the person did not pick, so
while it is only picked, or sent and not yet answered, that programme's lead
and reviewers are shown a number of places kept for invitations and never
the person. Once the person accepts (`joinedByInvitation()` in
`decisions.ts`), the programme's lead and reviewers read the application as
if it had ranked the programme (`canReadApplication()` takes the joined
programme beside the ranking), and it has a row in the programme's list,
marked `byInvitation`, standing as accepted, with no decision to make and
nothing of that programme's to score. If they later cannot make it, the row
stays, marked withdrawn, like anybody else's who left after applying.
Somebody who says no thanks is never read by the programme they turned down.
`tests/applications-wave-h-joined.test.mjs` runs every kind of account
against every way an invitation can stand.

A lead edits their own programme's settings, with two exceptions that are
an admin's: closing the programme, and switching its scores on or off once
reviewing has begun on it (see "Scores").

A lead or a reviewer has to be an admin or SU-recognised committee, because
applications are personal. That is checked against their live user document
when they are named (`setProgrammeRoles` in `roles.ts`, the one writer) and
again every time the role is used (`isNamedWithStanding`), because nothing
takes a name off a form when its owner's standing changes. Only an admin
changes a lead. A lead can add and remove their own programme's reviewers.

Naming somebody is an access grant, so both of its questions (is the caller
this programme's lead, or an admin; is each person named eligible) are asked
inside the transaction that writes, of the form and the user documents that
transaction read. A lead who was replaced, or somebody named who stopped
being eligible, after the request began makes the transaction run again and
meet the refusal. The same two questions are asked once before it, to answer
a request that is plainly not allowed without opening a transaction, and that
earlier answer decides nothing by itself.

The round's `reviewerUids` is kept as the union of every lead and reviewer on
the form, with the `users.admissionsReviewer` flag that draws the sidebar
entry, so every existing gate keeps working without knowing about programmes.

**Somebody's answer about SU membership is an admin's to see, on one page.**
The form's last step asks whether a person has SU membership and tells them
the answer will not affect their application. The decision-day page shows an
admin each person's answer under their name, so that somebody can help the
people joining a programme to get their membership before term. That is the
one place the answer leaves its owner's own form, and four things about it
hold together:

- **Only an admin is sent it.** The page and its route answer whoever
  `canRunTerm()` refuses, and leave, before the page is built. No payload a
  lead or a reviewer is sent has the key in it, on any screen.
- **Nothing that decides, recommends or orders applications reads it.** It is
  read in one expression, where the page's three groups are listed (`groupOf`
  in `decisionDay/send.ts`), for people whose outcome is already chosen. The
  plan, the scores, the review screens and the send itself are never handed
  it, and pooled applicants, where an admin chooses what somebody hears, does
  not show it.
- **Never the viewer's own.** The groups are of the term as the viewer is
  shown it, so an admin who has applied is not on their own page.
- **Not in a view-as session.** A session borrowed from a member is not an
  admin's, and the member's own form and route answer it as the paragraph
  above says.

The site's privacy page says who is shown the answer and that it does not
affect whether a place is offered. `tests/applications-su-membership-answer.test.mjs`
lists every file outside the applicant's own form that names the answer, and
runs the page, the review screens and pooled applicants as an admin, a lead,
a reviewer and a view-as session.

## A programme and its course page

A programme is for a course, and `programmes.<id>.courseId` says which: the
id of a course on the site, or null for a programme with no course page. It
is something else than `runId`. A course is the evergreen page; a run is one
term of it, and `runId` is the run accepted people are placed on: see "From
the form onto a course run".

**One writer.** The programme's `PATCH`
(`/api/admissions/forms/[roundId]/programmes/[programmeId]`) is the only
thing that stores it, for the programme's lead or an admin, from the "Course
page" box on the Settings tab. `editor/courses.ts` holds the one rule the box
and the route both go by, so the route accepts exactly what the box offered
the caller:

| A course that is | Can be picked by |
| --- | --- |
| published | the programme's lead, or an admin |
| a draft | somebody who may read a draft course: an admin, or a holder of `draftCourse` or `approveCourse` |
| archived, or not there | nobody |

"Not there" and "not yours to pick" are refused in the same sentence, after
the route has decided the caller may change the programme at all, so the
route says nothing about which ids exist. The box always shows the course
already chosen, whatever has become of it: by its title to somebody who may
read it, and by a few words in its place to somebody who may not, or when it
has been deleted. A tie already stored is never checked again by a later save
of the same page, so a course somebody else unpublished cannot stop a lead
changing their places.

**Nothing follows a course around.** A course can be unpublished, archived
or deleted after a programme is tied to it, and no write is made to the form
when that happens. Whatever reads `courseId` treats a course that is not
there, or has no public page, as no course.

### What the course's page says

`findFormsByCourse()` in `lifecycle/openForm.ts` answers, for each course,
the form that speaks for it and where that form is in its term. It is the one
place this is decided, for the course's own page and for the catalogue, and
it reads every form with the single equality `findOpenForm()` uses.

| The form is | The course's page |
| --- | --- |
| a draft, archived or cancelled | is told nothing, and is exactly the page it would be with no form |
| open, and its opening is still ahead | says the day applications open, and offers nothing to press |
| taking applications | says "Apply by Sun 18 Oct", and its button leads to `/apply/<roundId>` |
| closed, by the clock or by an admin, or further on | says applications have closed, and offers nothing to press |

"Taking applications" is `roundWindowState`, the predicate the form's own
routes refuse on, so a page never offers a button the form would turn away.
A draft is answered exactly as a form that does not exist, the same reading
the form's own page gives it. A cancelled form is the one status the two read
differently: its own page says applications have closed, and no course's page
says anything, because a term that was called off promises no decision day.

- **A programme that has been closed speaks for no course**, whatever it is
  still tied to: it is off the site and out of the form.
- **A closed form hands over only the times that have passed.** Closed by
  hand, the time written on it can still be ahead, and a page that printed it
  would say applications closed on a day that has not come.
- **It is one form whichever button somebody presses.** The button's address
  is `applyPathFor()`, built in one place, and it is the same for somebody
  signed in and somebody who is not: the form's own page decides what a
  person with no account sees.
- **Between two forms tied to one course**, taking applications beats opening
  soon beats closed (`pickLiveRound`, the ranking the course pages already
  used). So last term's form goes on saying it has closed until next term's
  is opened, and a draft for next term changes nothing.
- **A round of the older kind can still speak for a course.**
  `speakingRoundFor()` in `src/features/courses/fetchFormRound.ts` is the one
  rule: the form speaks, unless the older round is further along. With no
  tie, the page is handed the older lookup's own answer untouched.
- **An open-enrolment course keeps its own sign-up window.** The course
  pages' own rule (`roundOwnsDates`) is unchanged, so a tie to a course whose
  run admits everybody from a session picker puts no Apply button on it.
- **What a page is handed** is `CourseFormView`, written out field by field:
  the form's id and address, its state, its three dates, and from the tied
  programme when it starts as its lead wrote it and the run it places people
  on. Not the form's label, and not a programme's name, places or people.

## What the form asks

### Question sets, and who is asked each

A question set's `scope` says who is shown it, and its role follows from its
scope. `setApplies()` in `sections.ts` is the one rule.

| Scope | Shown to | Role | Scored |
| --- | --- | --- | --- |
| `everybody` | anybody who has picked at least one programme the form carries, whatever its kind | `general` | never |
| `kind` | anybody who has picked a programme of that kind (a fellowship, or the incubator) | `general` | never |
| `programme` | anybody who has picked that programme | `stream` | where its questions say so and the programme uses scores |
| `facilitating` | anybody who said yes to facilitating | `facilitator` | never |

**The set for everybody is asked once, first.** Somebody who picks a
fellowship and the incubator is asked it once, before every other set. Where
it is asked is a rule and not a place in a stored list: `everybodyFirst()`
puts it first, `orderedSets()` and the editor's own list both go through it,
and `orderWithNewSet()` stores it first when it is made. Nobody is asked it
before they have picked a programme, because until then nobody reads the
answers.

**A form has at most one.** `createSet` (`editor/write.ts`) refuses a second,
inside the transaction that would have made it, from the sets the form
itself lists. The editor offers the choice only while the form has none.
Like any set it is made, renamed, edited and deleted by an admin, until
somebody sends an application and the questions lock. Its name is its
author's own, and `namedAsQuestions()` (`words.ts`) is how every screen says
it: "Shared" reads "Shared questions", and a name that already says it is
questions is left as it is.

**It is never scored.** The reader gives any set with this scope the role
`general` whatever is stored, so a scored question is refused on write and
cleared on read, and no programme's reviewers are offered a score for one of
its answers. A reviewer can still comment on one.

**Its answers are read by everybody who may read the application, and by
nobody else.** That is `canReadApplication()`: an admin, and the lead and
reviewers of each programme the person ranked or joined by accepting an
invitation. The review screen draws it as an open section, first, marked
"Asked of everyone" and "Not scored". It is what already held for a kind's
general set among the programmes of that kind. Nothing reaches anybody who
could not already read the application.

**Readiness.** Everybody who applies has to be asked something. A set for
everybody with a question in it meets that for every programme at once, and
then no kind of programme needs a general set of its own: one that is
missing or empty asks nobody anything, like a stream with no questions.
Without it, each kind with a programme open needs its own general set, as it
always has. An empty set for everybody is not there.

**A scope is copied by name.** Each function that copies a scope or turns
one into a role (`scopeForApplicant`, `scopeView`, `roleForScope`,
`familyOf`) is a switch with no default, so a scope it does not name fails
the build. `tests/applications-set-for-everybody.test.mjs` reads the scopes
out of `model.ts` and puts each through every copy, and runs the set through
the editor's routes, the applicant's and the review screen's.

### A set has two lines of its own

Besides its name and its questions, a question set stores two lines of text.
They are two fields, written in two boxes, and they are never one another.

| | The line shown to applicants | The note for admins |
| --- | --- | --- |
| Field | `applicantLine` | `intro` (the name is older than what it holds) |
| Who reads it | everybody who is asked the set | whoever edits the form: admins |
| Sent to an applicant | yes, with the set | never |
| Drawn | under the set's heading on its step, before its first question | in the editor only |
| Links | an `https://` address and `[words](https://address)`, as in a help line | none: it is shown as typed |
| Limit | `APPLICATION_LIMITS.setApplicantLine` characters, as typed | `APPLICATION_LIMITS.setIntro` characters |
| Which sets | every kind, the set for everybody included | every kind |

**Each is read from its own field and from no other.** The reader
(`normaliseQuestionSet`) gives a set stored before the line existed an empty
line, whatever its note says. The applicant's projection
(`projectQuestionSetForApplicant`) sends `applicantLine` and does not name
`intro`, so the note is not a field of what an applicant is sent, and it
does not stand in for a line that is empty. `SetLine`
(`src/features/applications/apply/SetLine.tsx`) draws the line and reads
nothing else of the set.

**Writing it.** Both go through the route that changes a set
(`changeSet`, `PATCH .../sets/[setId]`), each under its own name, and each
is refused under its own name when it is over its limit. A new set starts
with neither. Like the set's name and questions, both are an admin's, and
both lock once somebody has sent an application: the line is part of what
that person was shown. In the editor they are the two boxes under More, then
Rename: "Line shown to applicants" and "Note for admins".

**Where the line shown to applicants is drawn.**

| Where | Drawn | Why |
| --- | --- | --- |
| The applicant's form, on the set's step | yes, through `LinkedText` | it says how to fill that step in |
| "Preview as an applicant", from the editor | yes | it is the form itself, in a new tab |
| The form's last step, where the answers are checked | no | it lists answers under each set's name, and the line is not an answer |
| An applicant's page after sending | no | it lists no questions |
| The review screen | no | reviewers are shown the questions and the answers; the payload does not carry the line |
| What an application said before | no | a kept version holds what the person sent, and the line is the form's |

`tests/applications-set-line-for-applicants.test.mjs` holds each of these: it
writes both lines through the editor's route on every kind of set, reads
what the applicant's route and the review screen's then send, renders the
component, and reads the editor's two boxes out of the source.

### A question that asks for an order

A question's type is one of `short`, `long`, `choice`, `multi`, `scale` and
`rank`. A `rank` question's options are the things to put in order, two to
ten of them. The answer is the options the person placed, in their order:
each one of the question's own, none of them twice. They may place as many
as they like, and what they leave out is simply not in the answer. A required
ranking needs a first choice and nothing more.

**Stored as "several choices" is.** A list of option texts on the
application, so no rule and no stored shape changes: every collection here is
closed to browsers, and a list of option texts is a shape the routes already
wrote. The difference is the order. For `multi` the list is kept in the
question's own order. For `rank` it is kept in the person's, which is the
answer: the first entry is their first choice.

**A save cleans and a send checks.** `cleanContent` (`applicant/draft.ts`)
keeps only the question's own options, each once, in the order given, so
nothing stored can name an option twice or one the question never had. The
send reads the stored draft through the same clean-up and then
`answerProblem` (`validate.ts`), which refuses in words: "Pick at least a
first choice.", "Pick from the options.", "Put each one in your order once."

**Never scored.** `NEVER_SCORED_TYPES` in `model.ts` is the list, and it
holds `rank`. A ranking is an order somebody gave, not a piece of writing, so
there is nothing in it to give 1 to 5. The reader clears the flag whatever is
stored, the editor's route stores the question unscored whatever was sent,
and the editor never sends one. In a set whose Scored switch is on, the
switch passes a ranking by and its card says "Not scored". A reviewer can
still comment on it.

**One ranking control.** `RankList`
(`src/features/applications/apply/RankList.tsx`) is the form's one list that
somebody puts in order. The Rank step draws the programmes a person ticked
through it, and a ranking question draws the options they placed through it.
A row moves three ways, and none needs the others: drag its handle, focus
the handle and use the keyboard, or press its up or down button. So it works
with a keyboard alone and on a phone. For a ranking question the options are
tick boxes above the list (the chips "several choices" uses): ticking one
puts it at the end of the order and unticking takes it out. On a phone a row
that holds a sentence puts its two buttons under its name.

**How it is shown afterwards.** The review screen draws a ranking as a
numbered list, first choice first. What it is sent is the same field
"several choices" uses (`items`), and the question's `type` says which of
the two it is. The form's last step says the order in words ("1. Evals, 2.
Governance"). The same options in another order are another answer: the
applicant's page says they have changed something they have not sent, a send
keeps what it said before, and the review screen shows the earlier order
under the current one.

**When an author changes the options.** A ranking does what "pick one" and
"several choices" do. Once anybody has sent an application the questions are
locked, so nothing changes under an answer of record. Before that, only
drafts exist, and nothing writes to a draft but its owner: it says what it
said until their next save or send, which keeps what is still an option (a
ranking closes up in the person's order, "several choices" keep the ticks
that are left, and a "pick one" whose option has gone reads as not
answered). The form shows only what is still an option, and asks for the
answer again once they press Send.

**Every type is named wherever a type decides.** `answerProblem`,
`cleanAnswer` and the form's `controlFor` are each a switch with no default,
so a type they do not name fails the build: no type is ever checked, cleaned
or drawn as another. A question's options come from the programmes somebody
ranked only for a "pick one" (`optionsFor`).
`tests/applications-rank-question.test.mjs` reads the types out of
`model.ts` and runs each through all three, and runs a ranking through the
editor's routes, the applicant's and the review screen's.

### A help line can carry a link

A question's help line is plain text. An author types it, and an applicant
reads it under the question. A set's line shown to applicants is the same
kind of text, read under the set's heading, and everything below holds for
it too. Two shapes in such a line are drawn as a link, and nothing else in
it is ever markup:

- an address that begins `https://`, written out where it stands;
- `[words](https://address)`, which shows the words.

**One function and one component.** `linkedParts()` in `linkedText.ts` splits
a line into the parts that are text and the parts that are links.
`LinkedText` (`src/features/applications/kit/LinkedText.tsx`) draws them: a
text part as a text node and a link part as an anchor that opens in a new
tab with `rel="noopener noreferrer"`. Nothing is set as HTML. What a reader
sees is the words, or the address itself.

**Only `https:`.** Every other way of writing an address stays text exactly
as it was typed: `http:`, `javascript:`, `data:`, `mailto:`, an address with
no scheme, a path on this site. The scheme is read whatever its letter case.

**An address is on a named site, in plain characters.** Letters, digits,
hyphens and dots, ending in a name, with nothing before it: no name and
password, no number written as a site, and no character that only looks like
a letter. An address that fails this is not cut down to the part that
passes. The whole of it stays text, so no link goes anywhere but the address
a reader was shown.

**Where a bare address starts and stops.** It starts at the beginning of the
line, or after white space or an opening bracket or quote mark. It stops at
white space, a control character, a square bracket, `<`, `>` or `"`. A full
stop or a comma at its end belongs to the sentence, and so does a closing
bracket the address did not open.

**The words of a link are words.** `[words](address)` is a link only when
the words say something, carry no control or hidden direction character, and
name no site of their own other than the one the link goes to. Words that
read `example.org` over an address somewhere else are left as text, and each
address there that can stand by itself is linked to itself.

**The limit counts what was typed.** A help line is at most
`APPLICATION_LIMITS.questionHelp` characters and a set's line shown to
applicants at most `APPLICATION_LIMITS.setApplicantLine`, brackets and
address included.

**Two places draw one.** `HelpLine` in the form's `fields.tsx` draws a help
line and `SetLine` draws a set's line, both through `LinkedText`, and no
other file under the form's folders uses the component. The editor shows
either as typed, in its box.

**Where a help line is drawn.**

| Where | How | Why |
| --- | --- | --- |
| The applicant's form, under each question | through `LinkedText` | it is where the line is read and followed |
| "Preview as an applicant", from the editor | through `LinkedText` | it is the form itself, in a new tab |
| The editor's own Help text box | as typed, in the box | it is where the line is written. One sentence under the box says what becomes a link (`LINKS_HINT`), and a test runs that sentence's example through the function |
| The review screen | not drawn | reviewers are shown the question and the answer, not the help line |
| An applicant's page after sending | not drawn | it lists no questions |

`tests/applications-linked-text.test.mjs` runs the function against a table
of hostile input, renders the component and the form's own step over the
same table, and reads every `href` under the form's folders out of the
source. An address written out in full, or built on a fixed path of this
site, is what it says. Every other is on a list in that test with what it is
built from, and one entry there is made from what an author typed: the
component's.

## Scores

Scoring is per answer, 1 to 5, and optional per programme (`useScores`). Only a
stream set's questions can carry `scored`; the flag is cleared on read anywhere
else, the set asked of everybody included. A ranking is never scored, in any
set (`NEVER_SCORED_TYPES`).

- A reviewer's score for a programme is the mean of what they gave its answers.
- The section score is the mean of the reviewers' scores, one voice each.
- **A first review is blind to other reviewers.** A lead or a reviewer is not
  shown what anybody else gave or wrote about an application until they have
  saved a review of their own for it (`firstReviewOf` in `scoring.ts`). An
  admin can switch that off for the form (`revealOtherReviews`), which changes
  what leads and reviewers are shown.
- **What a review of their own is.** Where there is anything for them to
  score on the application, it is every one of those scores. Where there is
  nothing for them to score, it is an overall comment of their own, with
  something in it. Nothing to score is not already scored: a programme with
  scores switched off, a stream with no scored question, an applicant who
  left every scored question blank, and somebody who joined by invitation
  and so answered none of the programme's questions, all leave a reviewer
  with nothing to score, and none of those is a review. A comment on one
  answer is not one either. A score or an overall comment taken back makes
  it a first review again.
- **It is one answer for the application, across every programme on it that
  the person reviews.** An overall comment is one text about the whole
  application, and a comment on a shared answer belongs to no one programme.
  So somebody who reviews two programmes an applicant ranked has both to
  finish before either shows them anybody else's, and what they are shown is
  the same whichever of the two they open the application under. `lookingAt`
  in `review/term.ts` is the one place the rule's question is put together,
  with every programme the application is listed on, and the list and the
  review screen both ask through it.
- **While anything is held back, the screen says what is left to do.** The
  payload carries it (`others.until`) and
  `src/features/applications/review/otherReviewsWords.ts` words it: answers
  still to score here, answers still to score for another of their
  programmes, or an overall comment.
- **A programme's scores are its lead's to switch until reviewing begins on
  it, and an admin's from then on.** Scores decide what a review of the
  programme is. So once any review says something about an application on
  the programme's list (`reviewingHasBegunOn` in `scoring.ts`), switching
  them on or off is held to an admin, as closing the programme is.
  `changeProgramme` asks inside the transaction that writes, and the
  settings page shows a lead the switch switched off, with the reason.
- **An admin is never blind.** An admin is shown every score and comment, on
  every programme, whether or not they have scored and whatever the switch
  says: on a programme's list, on the single application and in the
  recommendations made from the scores. "Admin" is the role on the site,
  never a role on a programme, so a lead who is not an admin still scores
  blind first. `otherReviewsShownTo` in `scoring.ts` is the whole rule. Every
  caller hands it the one object `lookingAt` made, which carries the
  caller's own standing, and nothing else reads the switch as a condition:
  `tests/applications-review-routes.test.mjs` walks the tree for both, and
  holds that whether there is anything left to score (`hasScored`, which is
  true of nothing) decides the list of applications still waiting and
  nothing about whose work anybody is shown.
  `tests/applications-blind-first.test.mjs` runs the rule through the routes
  for every kind of "nothing to score".
- **Names are shown.** Reviewers see who they are reading. The form says who
  reads an application and does not mention names.

## What an application said before

An edit counts only once the applicant presses Send again. What that send
replaces is not lost: it is kept, and shown to whoever reviews the
application.

### What is stored

Three fields on the application document, beside `sent`. None is on a
document that has never needed it.

| Field | Means |
| --- | --- |
| `sentHistory` | The earlier applications of record, oldest first. Each is `{ content, sentAt }`: a whole content, exactly what `sent` held, and when THAT version became the application of record. |
| `sentHistoryDropped` | How many earlier versions are no longer kept. |
| `sentChangedAt` | When `sent` became what it is now: the first send, or the latest send that changed something. |

`sentAt` is the last press of Send and moves even when nothing changed, so it
cannot say when the current version began. `sentChangedAt` can, and the date
under an earlier answer and the line about a score both need it.

`sendApplication` (`applicant/store.ts`) is the one writer, inside the
transaction that replaces `sent`. It compares the new content with the stored
one, both read through `normaliseContent` (`sameContent`, in
`versions/kept.ts`). ANY difference is a change: an answer, About you, the
ranking, facilitating, availability, the SU membership answer, the university
address the account held at that moment. The comparison does not ask what a
screen shows, because what is kept must not depend on how it is drawn.

It is on the application document so that whatever deletes an application
deletes its history in the same write, and so that it needs no collection,
rule or index of its own.

### How much is kept

A document has a size limit, and the draft and the application of record have
to fit beside the history. `SENT_HISTORY_LIMITS` (`model.ts`) holds it to 10
earlier versions and 300,000 bytes. Beyond either, the oldest version THAT IS
NOT THE FIRST is dropped, and counted in `sentHistoryDropped`, so a screen
can say "Changed 14 times" truthfully when only 10 can be opened. **The first
version sent is never dropped** (`keepVersion`): with the first alone over
the weight, the history is the first, alone.

The cap only ever drops from between the first version kept and the next, so
that is the one place the kept versions are not consecutive (`hasGap`).

### Who is shown it

Whoever may read the application: an admin, and the lead and reviewers of a
programme the person ranked or joined by invitation. Nobody else, and never
the applicant. Their own routes build what they answer field by field
(`applicant/project.ts`) and name none of the three fields.
`tests/applications-versions.test.mjs` lists every file under `src` that
does name one, both ways, so a new reader is written down from the change
that adds it.

The record the committee keeps about a person (`memberRecords`) holds none of
the applicant's writing, from the version on record or from one before it.

### How the review screens show it

`review/earlier.ts` reads the versions PART BY PART, not as whole earlier
applications. A part is one thing the screen draws: one answer, one About
you fact, the ranking, whether they would facilitate, when they are free.
For each, the versions are collapsed into runs in which the part said the
same thing. The last run is what the screen already shows. The runs before
it are what it said before, newest first, each with the day the first
version of that run was sent. A part that never changed shows nothing extra.

- **Only what the screen shows is a part.** The SU membership answer is kept
  with every version and is not read there: the form tells applicants it
  does not affect their application, and reviewers are not shown it. An
  answer to a programme the person has since unticked is kept too and is not
  shown; the ranking's own history says the programme went. A university
  address in an earlier version is an admin's to read, as the one on record
  is.
- **So a change can be counted and have nothing to open.** The line under
  the applicant's name counts every change to the application of record, and
  says so plainly when none of it is on the screen.
- **A question they were not asked is not an answer they gave.** A version in
  which a question set did not apply (the programme was not ranked yet, or
  they had not said yes to facilitating) is passed over when that set's
  answers are compared, and the set's card says once when it joined the
  application (`setAddedOn`). Asked and left blank is different: that is an
  answer, and reads "No answer."
- **A score and a comment stay on the question, not on a version.** Where a
  score was given before the answer last changed, one line under the answer
  says so (`changedSinceScoredLine`). A review row records when it was last
  saved, not when each score was given, so the line is said only when it is
  certain: the reviewer has saved nothing since before the change. It names
  nobody whose review the reader is not shown.
- **When a part last changed is said only when it is known.** A value first
  seen right after the gap the cap leaves may have arrived in a version that
  is gone. Its day is still shown, and nothing is claimed about a score
  against it.

The words these screens use for all of it are in
`src/features/applications/review/changesWords.ts`.

## Decisions and decision day

A lead's decision for their programme is Accept, Pool or Decline.
`outcomeFor()` turns all of a person's decisions into the one thing they hear:

| Outcome | When |
| --- | --- |
| accepted | A programme they ranked accepted them, and none ranked higher still owes a decision. |
| invited | Pooled, and the committee picked an invitation to a programme on the form. |
| no-offer | Pooled, and the committee picked no offer. |
| declined | Every programme they ranked declined them. Not emailed unless an admin says so. |
| needs-outcome | Pooled, and nobody has picked yet. Holds the send. |
| undecided | A programme still owes a decision. Holds the send. |

A programme owes a decision until it decides, or until a programme the person
ranked higher accepts them (`owesDecision`).

Somebody who ranked nothing the form carries is pooled, never undecided. No
programme they ranked took them, which is what pooled means, and no programme
can owe them a decision, so the committee picks what they hear. The send
refuses an empty ranking, so this is only ever a stored application the form
has changed under.

`tallyTerm()` gives every count the manager shows and `readinessFor()` says
whether the send may go. `tests/applications-model.test.mjs` runs the whole
arithmetic against a term of 122 applicants: 66 accepted, 2 invited, 53 no
offer, 1 declined, 121 emails.

Nothing is emailed before decision day. The send is one action by an admin: it
publishes each outcome onto the applicant's own document (`result`, and
`invitation` where there is one) and sends the emails. Until it runs, every
applicant's status stays "sent".

### A test before the send

No press of Send is taken until an admin has sent themselves a test of the
emails as they are worded now. The test is the page's "Send a test to me":
the first person's real email in a group, to the admin's own address. It is
never the admin's own: an application of theirs is not in the group a test
is taken from, as it is not on the page. Each one that is handed to the mail
provider is recorded on the form as
`decisionEmailTest`: who sent it, when, and a fingerprint of every decision
email's wording at that moment (each programme's own `emailWording`, and the
form's `noOfferWording`). A test this copy of the site held, or one to an
address on the do-not-email list, reached nobody and is not recorded. A
programme's own test, sent from its settings page, is not this test and
leaves no record.

`testStanding()` in `decisionDay/tested.ts` compares the record's fingerprint
with the form as it stands: `fresh`, `stale` (a decision email's wording has
changed since), or `none`. Nothing stamps a "wording changed" time, so no
writer of wording has to remember to, and wording put back to exactly what
was tested is tested wording again. `sendBlockers()` and `owedBlockers()`
(`decisionDay/plan.ts`) hold both kinds of press on anything but `fresh`,
with a sentence that says which, and a caller that hands over no answer is
held too. A press composes its emails from the same reading of the form it
judged the test against. The decision-day page's last readiness row says who
tested and when, or that a test is owed.

### What became of the email

A result is published first and its email follows, so the two can come apart:
the mail can be down, or a press can be cut off between them. `result.email`
records what became of the email, and that record is what a later press of
Send goes by.

| `result.email` | Means | A later press |
| --- | --- | --- |
| `owed` | Not sent, for certain: never tried, or tried and known to have handed nothing over. | Sends it. |
| `sending` | A press has taken it up and has not yet recorded what happened. | Leaves it. |
| `sent` | Handed to the mail provider. `result.emailedAt` says when. | Leaves it. |
| `not-sent` | Deliberately not sent: a declined application with "Email them" off. | Leaves it. |
| `held` | This copy of the site may not write to that address. | Leaves it. |
| `suppressed` | The address is on the do-not-email list. | Leaves it. |
| `unconfirmed` | It may or may not have gone, and nothing can say which. | Leaves it. The page names the person. |

Only `owed` is ever sent, and it is taken up in a transaction that requires
the state to be `owed`, so two presses racing cannot both send it. That is the
whole of "nobody is emailed their decision twice". A failure is recorded as
`owed` only when it is positively known to have handed nothing over
(`handoverAfter`); anything else is `unconfirmed`. A `sending` older than any
press can live reads as `unconfirmed` (`emailStanding`), and so does a stored
result that does not say: nothing is sent on a guess. Both functions are in
`decisionDay/emailState.ts`.

This is still decision day writing to the applicant's own document, and
nothing else doing so: the press that publishes a result, and a later press
that sends an email the first one left owed, are the same send. Neither
changes what the person was told.

The term is marked as sent (`decisionsSentAt`) once everybody has a result. An
email still owed does not hold that back, and stays listed on the decision-day
page until it goes.

### What was sent is a record

A person's `result`, and what became of its email, are written once by the
send, and no reply and no offer of a freed place changes them. A reply does take its owner out of the term.
So the decision-day page reports the send from everybody it addressed
(`everybodyAddressed()` in `decisionDay/plan.ts`): the people in the term,
and anybody already told who has since left it (`left` on the plan), each
read through what they were told (`toldTo()`). "6 people applied" and each
group's list stay as they were when somebody gives a place back, and once
the term is marked as sent each readiness row's detail is counted from the
results too. What a press can still do (who is left to tell, which emails
are owed, whose account is waiting) is of the people in the term, as is
every count of places.

### Once somebody has been told

The send publishes one person at a time and can stop part way: a mail server
that is down, or a term too big for one press. So "this person has been told"
(`hasBeenTold()`: their own document carries a `result`) comes before "the
term has been sent" (`decisionsSentAt`), sometimes by a whole press, and a
later press skips anybody already told. From the moment a person is told,
what was decided about them is fixed: a lead's Accept, Pool or Decline, an
admin taking an acceptance back, and a different pooled outcome are each
refused for that person, inside the transaction that would have written, with
a sentence that says what can still be done. Otherwise the committee's
screens could come to say one thing while the person holds another. After
that, a place changes hands only when its holder gives it back (see
"Replies"), and a place given back can be offered, once, to somebody told
"No offer this time": that is the one outcome that changes after the send,
and it has a writer of its own (see "A place given back after decision
day"). The pooled applicants' writer still picks nothing after the send, and
its refusal says where a freed place is offered instead.

### Once decision day has begun

A form takes applications when its status is `open` and the clock is inside
its dates, and nothing moves the status when the close passes. So there are
two ways to take applications again, and from the first person told
(`decisionDayHasBegun()`: the stamp, or before it the form's own counters)
both are refused: the status route will not reopen the form, and the form's
editor will not move when applications open or close (`changeForm` in
`editor/write.ts`), because on a form still marked `open` a later close would
take applications again at once. From the first person and not the last,
because a send can stop part way: a form that took applications again then
would let somebody decided on and not yet told send a different application,
and the next press would tell them a decision made about the one before.

### Accepting somebody approves an account that is still waiting

A person can apply before their join request has been looked at. When they
are accepted, `approveWaitingAccount` (`accounts/approve.ts`) makes the
change the Approvals tab makes: `pending` becomes `member`, with who
approved and when. It checks three things itself, inside the transaction
that writes: the account is waiting (a member, a committee member, an admin
and a refused account are left exactly as they are), the person's own
application on the form shows an acceptance (a place they were told they
have and have not given up, or an invitation they have accepted), and the
approver named is an admin right now. The decision-day send calls it for
each person it tells they are in. The route an invited person accepts
through calls it too (`accounts/afterReply.ts`), naming the admin who sent
the decisions, after the reply has been written and never as part of it: an
approval that cannot be made leaves the reply standing and the account in
Approvals, and the next press of Send approves it.

### The daily reminder for an invitation

Somebody invited is reminded once a day, from 10:00 in London, from the day
after they were told up to their own reply-by day, until they reply
(`decisionDay/reminders.ts`). The job ships switched off. The decision-day
page says invited people are reminded only while a scheduled run has
actually run it (`decisionDay/armed.ts`). A freed place offered after
decision day is not reminded, by name (`freed-place`): see "A place given
back after decision day".

## Replies

After decision day somebody answers on their own application, through one
applicant route (`application/reply`). A place is presumed: "I'm coming"
records `attendance` and changes nothing else. "I can't make it" (from anybody
holding a place) and "No thanks" (to an invitation) give the place back: the
reply is recorded, the status becomes `withdrawn`, and the form's counters
move with it. An accepted invitation records `invitation.response`, makes
the status `accepted`, and approves the account if it was still waiting (see
above). `result` is what decision day said and no reply changes it. A place given back cannot be taken again from the page. `standingOf()` in
`status/standing.ts` reads all of that off the document, and `decideReply()`
in `status/replies.ts` is the whole table.

**Once somebody is in a group, "I can't make it" is leaving the programme**
(Q12). When Publish has told them their group on the run their place's
programme names, the reply takes the one leave "Leave the programme" takes
on their programme page, in the same transaction and through the same
code (see "Leaving the programme gives the place back"): they leave their
group at once, and their reason goes where a leaver's does, with their seat
on the run and not on the application. Whatever leaving refuses is refused
in its words. Somebody not in such a group (not placed yet, or placed and
not told) gives their place back as described here.

### Why somebody did not take a place

The two replies that give something back are asked why: one of a short list
("The times don't work for me", "I have too much on this term", "I'm doing
something else instead") or "Other" with a few words of the person's own, at
most `APPLICATION_LIMITS.releaseReasonOther` characters. A reason is
required. The route refuses the reply without one before it reads a document
(`parseReplyRequest()`), and the transaction that writes the reply refuses
it too. It is stored on the person's own application as `releaseReason`, in
the same write as the reply, and by no other write: a reply that gives
nothing back carries none, and the first reason given stands. The one
exception is a reply that is leaving the programme (somebody in a group,
above): its reason is kept with their seat, in the words of the option they
chose or their own, where the programme's lead and admins read it, and the
application carries none.

The committee reads it wherever the person's row is, because the answer is
often something that can be put right. `gaveBackOf()` in `status/reasons.ts`
is the one reading: the button the person pressed and their reason, off
their own document. It is on the withdrawn row of each programme they ranked,
on the application itself, and on the pooled applicants page, which keeps
pooled people who left after they were told in a list of their own (`left`),
counted nowhere. So nobody disappears from a screen by replying. The reason
is not sent back to the applicant, and the programme whose invitation
somebody turned down still never reads them.

### One set of words for an outcome

Somebody reads where they stand on their own page and, one line each, on the
list of everything they have applied to (`/applications`), which is older
than application forms and words a row from the stored status. The status
does not say enough: a place given back and an invitation turned down are
both `withdrawn`, and a declined application must read exactly as no offer
does. So for an application made on a form the list takes its chip and its
sentence from `outcomeWords()` in `status/words.ts`, read with the view the
person's own page is drawn from (`loadListWords()` in `status/load.ts`).
With no outcome to state (a draft, sent and waiting, withdrawn before
anything was decided) there are no words, and the list keeps its own.
`tests/applications-wave-h-list-words.test.mjs` holds that function and the
page to the same words.

Somebody who left the programme, by "Leave the programme" or by "I can't
make it" once they were in a group, reads "Left the programme" and "You left
AGI Strategy." on both, never that they told us they can't make it, which is
said of somebody who gave the place back before a group. The view knows the
difference because the page's read asks the run the place's programme names
one thing (`readPlaceOnRun`, "Leaving the programme gives the place back").

The way back to that list is a card on the dashboard, "Your applications"
(`src/features/applications/home/YourApplications.tsx`), drawn for somebody
who has applied to anything. It names each application and links to it, and
it states no outcome at all: a summary card is a third place the words could
come to disagree, and nobody should learn a decision from one. A waiting
account, which the dashboard does not admit, has the same link on the page
it is held on.

Two pages of the member area tell a member with no run that they are on
nothing: the dashboard ("You’re not on a programme yet.") and the list of
their programmes (`/learn`, "You're not on a course yet"). A place is not a
run. Somebody decision day gave a place has no run until they are put on
one, and of them that sentence is untrue. So both pages ask whether the
member holds a place (`holdsPlace()` in
`src/features/applications/home/holdsPlace.ts`, which asks the read behind
the person's own page), and they ask it only so as not to tell somebody
with a place that they are on nothing. The answer is yes, no, or could not
tell. It carries no round, no programme and no words, so a page that asks
it has nothing of an outcome to print. On a no, the page reads as it always
has. On a yes, and on could not tell, it does one and the same thing: the
sentence is left out, and the way to the member's applications is on the
page, which is the card above on the dashboard and the same card, naming
nothing, where the empty state would be on `/learn`. NEITHER PAGE STATES AN
OUTCOME, for the reason the card does not.
`tests/applications-place-in-the-member-area.test.mjs` puts every way an
application can stand through both pages, and holds that what each draws
carries no outcome word and no programme's name, and that a member reads
one of two pages: the page of a member known to hold no place, and the page
of everybody else. In a view-as session it is one page, however the
member's application stands.

An admin's hand-over onto a course run changes none of this. The row it
writes is the course side's list to place people from, and it is announced
nowhere in the member area, so somebody who has been handed over goes on
reading these same two pages until they are put in a group ("What the
person sees", under "From the form onto a course run").

### Who is in the term

A reply cannot touch the decision documents, so they go on saying Accept for
somebody who has given the place back, and `tallyTerm()` counts a place from
the decision documents. What frees the place is `isInTerm()` in
`decisions.ts`: an application is part of the term's arithmetic when it has
been sent and is not `withdrawn`. Every caller of `tallyTerm()`, and anything
else that counts places, decisions owed or people to be told, filters by it
first, so a place given back is free on the review list, the term page, the
pooled applicants screen and the send in the same moment. A screen may still
list somebody who has left (the review list keeps the row, marked as
withdrawn). It may not count them.
`tests/applications-journey-in-term.test.mjs` walks the tree for callers.

### Who holds a place

`holdingOf()` in `decisions.ts` is the one answer to who holds a place on a
programme now. `tallyTerm()` counts `placed`, `joined` and `invited` from it
and from nothing else, and `freePlaces()` is worked out from those, so every
screen that shows a place shows the same one.

- **A place is held** by somebody the programme's lead accepted who is still
  in the term (the place their ranking gives them, and any second place an
  exception names), and by somebody invited to it who accepted.
- **A place is kept for an invitation** only while that invitation is
  unanswered and its person is still in the term.
- **A freed place is read the same way**: kept while it is unanswered, held
  once it is accepted, through the person's standing like decision day's
  own invitation. It is on a programme they ranked, so `joined` (somebody on
  a programme's list by an invitation alone) does not count them: they are
  among its applications by their ranking already.
- **On the programme's list, a freed place accepted reads as accepted**, as
  a place joined by an invitation does (`holdsFreedPlace` in
  `src/lib/applications/review/board.ts`, asked by the list and by the
  application itself): the row stands as accepted with the line "Accepted
  an invitation", it is counted under Accepted and not Pooled, and the
  lead's Pool stays on the application as the record of what was decided.
  So the tabs, the row and the places line say one thing.

It reads both halves of the record, because neither is enough: only the
decision documents know a lead's Accept and an exception, and only the
application knows a reply. Until a person is told, the committee's pick is
all there is, so before decision day every number is what the decisions
alone give. Once they are told, only their own document is asked about their
invitation, through `standingOf()`, the reading their own page is drawn
from. So the committee's screens and the person's page cannot disagree about
whether they are in.

Every caller of `tallyTerm()` hands each applicant over with its application.
`tests/applications-wave-h-places.test.mjs` runs one stored term, in which
every kind of reply has been made, through each of them.

## A place given back after decision day

Decision day tells everybody at once, and until this was built nothing could
change an outcome after it: the send was the only writer of one, somebody
told "No offer this time" had nothing to answer, and the run a programme
names takes no application of its own. So a place given back after the send
could only be offered by email, and the person could not then be put on the
run.

One change is now made after the send, and it is held strictly:

- **only from "No offer this time" to an invitation.** The invitation is
  written beside the result, which stays what decision day said;
- **only to a pooled applicant who ranked the programme**, and whom its own
  lead pooled. Somebody it declined is not offered its place: its lead said
  they were not eligible;
- **only while a place is free**, by `freePlaces()`, read and never
  rewritten, so a place kept for an invitation nobody has answered is not
  free;
- **only while the window is open**: from the send until midnight in London
  at the end of the last day of week 1 of the course run the programme
  names, worked out from that run's start date and week plan
  (`freedPlaceWindow`). No date is typed in code. A programme that names no
  run, or a run with no start date or no week 1, has no window;
- **only by whoever `offersFreedPlaces()` admits**, asked of the caller's role
  on the programme: an admin, or the programme's own lead. It is one line in
  `freedPlaces/rules.ts`, asked by the page, both routes and the writer's own
  transaction;
- **with one line in the log for each press**, of kind
  `application-freed-places-offered`, saying how many and on which
  programme, and naming nobody.

A settled, cancelled or archived form offers nothing, and neither does a
closed programme or one with no number of places.

### What a press writes

`offerFreedPlaces` (`freedPlaces/offer.ts`) is the one writer. One
transaction, for everybody picked at once, so a press offers all of them or
none. It reads the form, the run, every sent application and every decision
on the form, the groups it names and the places on the run of anybody an
earlier offer is waiting on, and asks everything above of what it read. Two
presses at once read the same documents, so the one that commits second runs
again and meets the refusal: the last place is offered once.

| Document | What |
| --- | --- |
| The person's own application | `invitation` in decision day's own shape, with the day to accept by the admin chose; `freedPlace` (`groupId`, `offeredAt`, and the email's own state, read like a result's through `decisionDay/emailState.ts`); `status` from `no-offer` to `invited` |
| The form | `applicationCounts`: `no-offer` down and `invited` up by as many, in the same transaction |
| `courseAudit/{auto}` | one line, `subjectUid: null`, `runId: ""`, the form's `roundId` |

`result` is not touched, and no decision document is written. So decision
day's page goes on reporting what decision day sent, and the pooled
applicants' page goes on saying what was picked before it.

### The email, and the test that comes first

"A place has come up on AGI Strategy", in the board's words, composed by
`composeFreedPlaceEmail` (`freedPlaces/words.ts`) from records: when the
person was told, the weekly time and next session of a group of the run, the
day to accept by, and the lead who signs it. It names when the group meets,
so it goes WHOLE OR NOT AT ALL: a slot with nothing in it refuses the press
with a sentence, before anything is written. "You told us you’re free on
Wednesday afternoons." is the one sentence that can go: it is said from the
person's OWN painted week (`freeOnInTheirWeek`), only when that week has at
least an hour painted in the part of the day the group's time falls in (the
rule the page's "Free Wed afternoons" reads a week by), and the page's
preview says it the same way. It never names the group, its room or a link: "Once you accept,
we'll email you your group and room", and Publish is what does. It goes
through decision day's own mail door (`sendDecisionEmail`), with the same
reply-to, after the offer has committed, because its buttons open the
person's own page.

THE GROUP whose time it names is picked for each person on the page, from
the run's groups whose whole weekly session their painted week covers
(`maskCoversSession`, #67's fit reading) and that have a seat: its places,
less the people in it and less the offers already waiting on a seat in it
(unanswered, or accepted and not yet placed). Somebody whose week covers no
group, or who painted nothing, cannot be picked: no true sentence says when
they are free.

NO PRESS GOES UNTIL THE ADMIN HAS SENT THEMSELVES A TEST: the first person's
real email, to the address on the admin's own session, marked as a test. A
test that reaches the mail provider is recorded on the form
(`freedPlaceTests.<programmeId>`: who, when, the day to accept by, and a
fingerprint of the email's wording with its slots marked,
`freedPlaces/tested.ts`). The press is refused unless the fingerprint it works
out for its own day to accept by is the one recorded, so choosing another day
asks for another test, and a build that changes the words makes every older
test stale. A press carries the number its button named ("Send 2
invitations") and is refused when the people picked are not that many.

What became of each email is recorded on `freedPlace` the way decision day
records its own. One known not to have gone is still to go, and a smaller
press ("Send the 1 email still to go") takes it up in a transaction that
requires that; one nobody can vouch for is never sent again.

### What the person sees, and how they answer

`standingOf()` reads an invitation beside a "No offer this time" result
exactly as it reads decision day's: an invitation until they answer, a place
once they accept, a place given back once they say no thanks. An invitation
beside a declined result is never read. So the person answers on their own
application page, with decision day's invitation card and its Accept and No
thanks, through the same reply route and the same transaction, which moves
the counters as it always did (`invited` to `accepted` or `withdrawn`), and
an acceptance approves an account that is still waiting
(`holdsAcceptance()`, which reads the standing). The card's first sentence is
the offer's own ("On Fri 23 Oct we couldn't offer you a place this term.
Someone has given theirs back, and we'd love you to have it."), because
decision day's "a great fit for it instead" is untrue of a programme they
ranked. The view says which it is (`freed`).

The day to accept by is decision day's soft rule (`REPLY_BY_IS_A_DEADLINE`):
shown, and not a wall. The board's email says "Please accept by" and draws no
wall, and the window closing stops offers, not replies.

Once they accept they hold a place, and `holdingOf()` says so with no second
reading: the hand-over, places left, the status page and the list of their
applications all see it. So an admin presses Hand over again (it adds only
who is missing), puts them in the group whose time their email named, and
presses Publish, which emails only them. `tests/applications-freed-places-journey.test.mjs`
runs that whole path through the real handlers.

The daily invitation reminder leaves a freed place alone: its day to accept
by is days away and chosen by the admin, who can see who has answered, and a
reminder would have to name the group's time again. The record kept when a
term settles says "no-offer, then invited (AGI Strategy)", with the run.

### The page

"Offer freed places" (`.../programmes/[programmeId]/applications/freed-places`),
under the programme's Applications tab, which links to it under its count of
places left. It lists who gave a place on the programme back, how many places
are free and until when, and the people a freed place can be offered to, each
with their score for the programme, when they are free in a few words
(`freeInWords`), and the groups their week covers. Nothing it is sent carries
an address or a painted week. The preview is composed by the function the
send uses, from the page's own fields. A lead who is not an admin is shown a
person's score once their own review of that application is done, as on
every other list of applications (`reviewsVisibleTo`, through `lookingAt`). A
reviewer who opens it is told it is for the programme's lead and admins;
anybody with no role on the programme is not shown it.

`tests/applications-freed-places-offer.test.mjs` breaks each part of the rule
through the routes, as every kind of caller and across the window's edges in
London; `tests/applications-freed-places-person.test.mjs` holds the standing,
the replies, every count and the person's page; and
`tests/applications-freed-places-page.test.mjs` holds the page and the link.

## From the form onto a course run

Decision day tells everybody where they stand. What happens next happens on
a course run: groups with a time, a room and facilitators, a placement
email, and the member area. That is the course system, which was built
before application forms and keeps a list of its own of who may be placed:
the accepted rows in `courseApplications` for a run. Placing somebody
starts from such a row (the allocation board, a placement, Publish, the
cohort's mailing list), and what the person is shown starts from the place
on the run that a placement then makes.

So the two are joined at that list and nowhere else, in three steps. The
first two are an admin's. The third is an admin's and the programme's lead's,
on the run their programme names, from the programme's own Groups tab (see
"The programme's lead on the run" below).

| Step | When | The one function | What it writes |
| --- | --- | --- | --- |
| Name the run a programme places people on | any time | `setProgrammeRun` (`handover/run.ts`) | `programmes.<id>.runId` on the form |
| Hand over the people who hold a place | after decisions have been sent | `handOverProgramme` (`handover/handOver.ts`) | a row for each of them on the run's own list, the run's count, one line in the log |
| Put them into groups | after that | the allocation board's own routes, as they were | the place on the run, when a person is first put in a group |

Nothing in this section emails anybody, and decision day is unchanged. The
first email after decision day is the placement email Publish sends from
the board, as it always was. A hand-over tells an applicant nothing, and
neither does a placement: the first thing the course system shows somebody
is their group, once Publish has emailed it to them.

### The run a programme names

`programmes.<id>.runId` is the course run this term's accepted people go
onto. It is something else than `courseId`: the course is the evergreen
page, and the run is one term of it.

**One writer, and it is an admin's.** `setProgrammeRun` stores it, from the
"Course run" panel on the programme's Settings tab
(`PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/run`).
Placing people on a run is part of running the term, so a programme's lead
is refused like anybody else, before anything is read. The programme's own
`PATCH` goes on refusing the field, and says where it is set.

**Which run.** A programme can name a run that:

1. is a run of the course the programme is tied to. So a programme needs
   its course tie before it can name a run;
2. is not archived, not being destroyed, not cancelled and not completed;
3. takes people by placement. A run in open enrolment hands out its own
   seats from a session picker and has no allocation board;
4. holds no application of its own;
5. is named by no other programme, on any form.

`runStanding` holds the first three, and is asked again at every hand-over,
because nothing follows a run around: it can be archived or moved to
another course after a programme names it. The last two are read inside
the transaction that writes, so a run that takes an application or is named
elsewhere while the request runs is refused.

Rule 4 is what makes the board's list a fact about the data. From the
moment a programme names a run, the run's own apply page refuses (below).
A run that starts with no application of its own therefore only ever holds
the rows a hand-over wrote, and the people on its board are the people who
hold a place on the programme.

**A draft run can be named.** That is the order to do it in: name the run
while it is a draft, and its own apply page is shut before the run passes
through "applications open".

**The picker offers what the writer accepts.** `loadRunPanel`
(`handover/load.ts`) lists the runs of the tied course by the same rules. A
run that cannot be picked for a reason an admin can act on (it has
applications of its own, another programme names it) is listed and not
pickable, with the reason. The run already named is always shown, whatever
has become of it.

**Once anybody has been handed over, the run stays.** It can no longer be
changed or cleared here. The rows a hand-over wrote sit on that run, and a
programme pointed somewhere else would leave them behind, on a run whose
own apply page had just opened again. The panel then stops listing why
other runs could not be picked: nothing can be picked any more.

### A run the form places people on takes no application of its own

A course run has an apply page and route of its own
(`/courses/[courseId]/apply`, `/api/courses/runs/[runId]/apply`), from before
application forms. A run can only leave draft by way of "applications
open", and while it is there that page takes applications whenever the
run's own dates allow, which with no dates set is always.

A run that a programme names must not. Its people come through the form and
an admin's hand-over, and an application made to the run itself would be
read by nobody. So the question is asked of the forms, and not of the run:

- **`runTakesPeopleFromForm(db, runId)`** in `lifecycle/openForm.ts` is true
  when a programme on ANY form names the run, whatever state that form is
  in (a draft, open, closed, settled, archived or cancelled) and whether or
  not the programme has been closed. Every state, because a rule that
  waited for the form to open, or stopped once it settled, would leave a
  window in which the older page took applications after all.
- **The route** refuses to make an application (`POST`) and to change one
  (`PATCH`), with one sentence and a 409, after its "not found" answers and
  BEFORE the run's own window is read, so no status and no date opens the
  door. Withdrawing (`DELETE`) is untouched: it takes work off the team.
- **The page** draws a card in words for everybody, signed in or not. It
  draws no form and no status card, and reads nobody's application.
- **The words say nothing about the form.** A form that is still a draft is
  nobody's business. The reader is sent to the course's own page, which is
  told where the term's form is by the form's own code and says the right
  thing in every state. The sentence and the card are in
  `src/lib/courses/formPlacedRun.ts`.

The run's status machine is unchanged. `tests/applications-handover-older-way-in.test.mjs`
runs the route and renders the page for every way a run can stand.

### The hand-over

An admin presses it once for each programme, after decisions have been
sent, on the same panel (`POST .../programmes/[programmeId]/run/hand-over`).

**Who is handed over** is who holds a place on the programme now, and has
been told. That is `holdingOf()` and nothing else (`placeHoldersOn` in
`handover/holders.ts`), asked of the people `isInTerm` admits, so the
hand-over cannot disagree with any other screen about a place:

- somebody the programme's lead accepted, placed there by their own
  ranking;
- NOT somebody a higher choice took: one place a term;
- somebody invited who has ACCEPTED, and not before;
- NOT somebody who gave their place back.

**When.** Only once the term is marked as sent (`decisionsSentAt`), and
only for somebody decision day has reached (`hasBeenTold`). A row is its
owner's to read under the collection's own rule, and being put in a group
shows them the run, so neither may come before they have been told.
The run has to pass `runStanding` still, and has to have left draft: a
draft run's own members cannot open it, so nobody could be shown their
group on one. `handOverBlocker` is the one answer, for the panel that
draws the button and for the writer, which asks it again inside each
transaction of what that transaction read.

**What a press writes, and all it writes.**

| Document | What |
| --- | --- |
| `courseApplications/{runId}__{uid}`, for each holder with no row | `runId`, `courseId`, `uid`, `displayName`, `status: "accepted"`, `fromForm: { roundId, programmeId }` and two timestamps (`buildFormPlaceRow`) |
| `courseRuns/{runId}` | `applicationCounts.accepted` moves by the number of rows made, in the same transaction |
| `courseAudit/{auto}` | one line of kind `run-hand-over`: who pressed, the programme, how many. It is keyed to the run and names nobody |

It puts nobody in a group: the board's first placement goes on making the
place on the run. It emails nobody. It writes no subscription.

**Nothing of the application crosses over.** A row carries who the person
is and where the place came from. No address, no answer, no score, no
comment, no ranking, and not their availability either: the board asks for
what it needs when it is drawn (below). So there is one copy of everything
a person wrote, the one on their application, and whatever deletes that
application leaves nothing of it behind on a run.

**Pressed again, and twice at once.** A row's id is the run and the
person, so there is one place it can be. Each transaction reads the rows it
is about to write and creates only the ones that are missing. A second
press finds them all and writes nothing at all. Two presses at once read
the same gaps; the one that commits second has read rows that changed,
runs again and creates none, so the count moves once. So pressing again is
how somebody new is added (somebody who has since accepted an invitation),
and it is always safe.

**It only ever creates.** A row that is already there is left exactly as
it is, whatever it says, and nobody is ever taken off a run from here.

`tests/applications-handover.test.mjs` runs the press as every kind of
caller, against every way a term and a run can stand.

### A row from the form is an admin's and its programme's lead's

The course routes were written for people who applied to a run itself,
and the people a run names read those rows: its track leads open the
board, and its admissions reviewers and track leads open its queue. A row
a hand-over wrote is different. Its person applied on the form, where who
may read an application is decided programme by programme, and being named
on a run gives nobody that right.

So `rowIsServedTo()` (`src/lib/firestore/courseApplications.ts`) gives a
row with `fromForm` to an admin, and to the lead of the programme that names
the run for the rows that programme's hand-over wrote, and to nobody else,
on every staff route that reads or acts on rows. Who the caller is on the
run is worked out once per request by `runStaffingOf`
(`src/lib/courses/runStaffing.ts`), and the route hands that answer to
`rowIsServedTo`. The lead already reads those people's applications on the
programme's Applications tab, so nothing new about them reaches the lead,
and never an address:

| Route | For somebody who is neither an admin nor the programme's lead |
| --- | --- |
| the allocation board | such a row is not listed |
| a placement | answered `not-accepted`, exactly as for a uid with no accepted row |
| Publish, and its test | the press is refused with a sentence that says who publishes such a run; nobody is emailed or named |
| the run's own queue | such a row is not listed. The run's counters still count it, as a number |
| decide, and reviewer notes | answered "Application not found", as for a row that is not there |

A track lead still opens the board, and still sees, places and publishes
everybody who applied to the run itself. A run that holds a row its presser
is not served holds their press of Publish, with a sentence that says who
publishes it.

**A browser reads no more than the routes serve.** `firestore.rules` gives
a `courseApplications` document to an admin and to the person it is about,
and to nobody else, and shuts every write. The rules suite holds that for
a row with `fromForm`, as the run's track lead, its reviewer, a course
approver and SU-recognised committee.

**The person reads their own row**, as they always could. It holds their
name, that they hold a place, and which form and programme it came from:
nothing they have not been told.

`tests/applications-handover-row-readers.test.mjs` lists every file under
`src` that addresses the collection, with what it does about such a row,
and a new reader fails it until somebody decides.
`tests/applications-handover-board.test.mjs` runs each staff route as an
admin, as the run's track lead and as its reviewer, and
`tests/course-hub-lead-rows.test.mjs` as the programme's lead, with a row
from another programme planted on the run.

### What the board is told

The form asks for a painted week, and the board's own availability chips
compare session labels ticked on the run's older form. So for a row from
the form the board's read carries `fromForm` on the row, worked out when
the board is drawn (`formPlaceFactsFor` in `handover/board.ts`):

| Field | Means |
| --- | --- |
| `availability: "given"` | they painted a week, and `canMakeGroupIds` is each group whose WHOLE weekly session that week covers (`maskCoversSession`). It can be none of them |
| `availability: "none-given"` | they sent the form with nothing painted. Said in words, because "can make none" and "never said" are different |
| `availability: "not-on-file"` | their application is no longer there to read. They keep their place on the run, and nothing is claimed about when they are free |
| `holdsPlace` | false once they have given the place back on the form |

The painted week itself never leaves the application system: the board is
handed the outcome of the comparison and nothing else. A group with no
session time set is never one somebody can make. The read is an admin's and
the programme's lead's (`rowIsServedTo`): an admin may read every
application, and the lead is answered about their own programme's rows and
no others.

**What a card then says** is one function, `cardFit`
(`src/features/courses/allocationFit.ts`), for both kinds of person on the
board. Somebody from the form is shown the sessions they can make as
chips, and is marked when they sit in a group they cannot make. "No
availability given" is said in words and is never a clash. A week that
covers none of the sessions is a warning. Somebody who has given their
place back is marked "Gave their place back", wherever they sit. Somebody
who applied to the run itself is drawn from the labels they ticked, as
before. `tests/applications-handover-board-cards.test.mjs` puts the rows
the route sends through that function.

**The membership badge is the account's, and nothing about membership
crosses over.** The board and the run's own applications page draw "Paid
2026/27" or "Unpaid" on a card. Both read it when the screen is drawn, from
the person's account: `users.paidMembershipYears`, the cache the membership
record's own writers keep (the grant and the import routes, in the same
write as the membership row), against the run's academic year. That is the
same read for somebody from the form as for anybody, so the badge says what
the membership record says today. It is not the answer the form asks about
Students' Union membership, which stays on the application and is shown to
whoever its own rule says.

Only when the account cannot be read does a screen ask the row
(`membershipKnownFromRow` in `src/lib/firestore/courseApplications.ts`). A
row from the run's own form answers with the snapshot its apply route took.
A row the hand-over wrote carries none, so its answer is "not known" and no
badge is drawn. A screen never says "Unpaid" about somebody because a field
is absent.

### The programme's lead on the run

The lead of the programme that names a run does, on that run and no other,
everything a run's track lead may do there, through the same routes and the
same checks, and three things more: they are served the rows their
programme's hand-over wrote, they open the programme's Groups tab (People in
groups is the run's allocation board, Times the times picture, Facilitators
who staffs each group), and they read every register of the run on the
Attendance tab, read only. Naming the run and the hand-over stay an admin's.

Their power is worked out from the form each time it is used, by one module
(`src/lib/courses/programmeLead.ts`): the programme whose `runId` names the
run, its `leadUid`, and that account still meeting the bar a lead is
appointed behind, asked through `isNamedWithStanding`. Nothing is copied
onto the run, so a lead who is replaced, whose account changes, or whose
programme stops naming the run has none of it at the next request. Should
two programmes ever name one run, nobody leads it through either. The same
module says who signs Publish's facilitators' email.

`tests/course-hub-lead-routes.test.mjs`, `-rows`, `-registers` and `-pages`
run every route and page as an admin, the lead, the lead of another
programme, a lead who lost their standing, a lead replaced by another, a
reviewer, the run's track lead, a facilitator, a member placed on the run
and somebody signed out; `tests/course-hub-lead-every-gate.test.mjs` walks
the tree for a gate that admits a track lead and not the lead.

### A place given back

- **Before the hand-over**: they hold no place, so they are not handed
  over, and no list names them.
- **Afterwards, before Publish has told them a group**: nothing removes
  them. Their row stays on the run, and so does their group if they are in
  one. The programme's own read (`GET .../programmes/[programmeId]/run`)
  names them under `gaveBack`, and their card on the board says "Gave their
  place back", so that an admin can act: take them out of their group on
  the board, then take their row off the run's own list (its applications
  page). A row from the form carries no address, so the run's own decide
  route emails nobody about it. Publish never writes to somebody whose card
  says it, and never waits for one with no group: the card, the board's
  count of who is still to place and Publish's plan ask the one answer
  (`gaveTheirPlaceBack` in `src/lib/courses/placeGivenBack.ts`) of the same
  facts, so the count on Publish's button, its test and its press leave them
  out, and the board says how many. Somebody staff put back on the run
  after they left is back: their place on the form is theirs again (the
  allocate route gives it back to them), so their card stops saying it, and
  Publish tells them.
- **Once they are off the run**, by leaving or because staff took them off,
  the same read names them apart, under `left` and `takenOff` (each one's
  seat is read by id to tell which): their seat is free and the place is
  given back, so the panel says there is nothing to do ("Left the
  programme", "Taken off the programme"). Somebody put back on the run since
  holds their place again and is in none of these lists.
- **Once Publish has told them their group**, giving the place back is
  leaving the programme, the person's own act (next section): their reply
  takes them out of their group. Their row on the run's own list stays.

The hand-over and the panel never take anybody off a run. A person's own
act does, from either of the two doors to the one leave, and so does staff's
Remove on the board (next section).

### Leaving the programme gives the place back

The other way round is the person's own act on the run, and it has two
doors. Somebody in a group leaves from their programme page ("Leave the
programme", behind the course's title typed to confirm), through the run's
own leave (`DELETE /api/courses/runs/[runId]/enrol`). Or, once Publish has
told them their group, they reply "I can’t make it" on their application
page (Q12), which the reply route takes as the same leave. Both doors ask
`leavePathFor` (`src/lib/courses/leaving.ts`) whether the person may leave,
and `leaveRun` (`src/lib/courses/leaveRun.ts`) writes what leaving writes,
for both, so the two cannot come to differ. The reply door first asks
`readPlaceOnRun` (`src/lib/courses/placeOnRun.ts`) whether the person is in
a group Publish has told them about on the run their place's programme
names; the application page asks the same function, so the page and the
reply always agree about which side of that line somebody is on.

For a seat the hand-over's row gave them, the leave also gives their place
on the form back, in the same transaction, exactly as "I can’t make it"
gives it: `readPlaceToGiveBack` and `givePlaceBack` in `status/record.ts`
ask the reply's own decision (`decideReply`) and share its writer, so
`attendance` says they can't make it, the application is `withdrawn` with
`withdrawnAt`, and the form's counts move. Every count of places, the freed
places page and the programme's lists say so the moment they have left;
whether the place can then be offered is the freed places rules' to say,
and after the end of the run's week 1 it cannot.

- **The reply door refuses what leaving refuses, in its words**: after the
  run's last session, and a seat that is not theirs (the run's own older
  form gave it, or its row names another programme or form). Somebody not
  in a group Publish has told them about (not placed, or placed and not
  told) gives their place back as a reply always has, and the run is not
  touched.
- **Their application page, once they are in a group**, offers neither
  "I’m coming" nor "I can’t make it": it points them to their programme's
  page and says giving the place back now means leaving their group (whom
  to write to, on a seat the team takes them off; nothing, once the run has
  ended). An incubator's page names no group. Once they have left, by either
  door, it says "Left the programme" and the day. The words are on no
  board, and are listed for the boards' designers (`status/runWords.ts`).

- **Only a place they hold on the programme the run's row names** is given
  back. A place already given back, a place on another programme, or no
  application at all is left as it stands, and they leave the run anyway.
- **Not after the end.** Leaving closes when the run's last session is
  over, so no place on the form goes back after it, and somebody who
  finished keeps their finished record.
- **No reason is written onto the application**, by either door. What they
  say when they leave is kept with their place on the run, where the
  programme's lead and admins read it; a reason on the application is read
  by everybody who reads applications. The reply buttons still ask for one,
  and from somebody in a group it is kept with their seat, in the words of
  the option they chose. Nor is it copied into the log of course actions,
  which outlives the account: that line says "Left the course." and nothing
  of what they said.
- **Their row on the run's own list is not changed**, and Publish waits for
  nobody who has left (`enrolmentHasLeft`).

**Staff taking somebody off gives the place back the same way.** Remove on
the allocation board (`POST /api/courses/runs/[runId]/enrolments/[uid]/remove`)
asks `leavePathFor` where the seat's place came from, and for a seat the
hand-over's row gave them that is still on the run it gives the place on the
form back in its own transaction, with the same two functions and no reason.
Nothing goes back after the run's last session, as for leaving. Their
application page then says "Taken off the programme" and the day ("You’re no
longer on AGI Strategy."), never that they told us they can't make it, with
no link to the programme's page, which closes to them; the list of their
applications says the same. Somebody who gave the place back themselves
before the removal (their reply carries its reason) still reads what they
told us. The words are on no board, and are listed for the boards'
designers (`status/words.ts`). `tests/course-publish-follow-ups.test.mjs`
runs it as an admin and as the programme's lead.

**Putting somebody back gives the place to them again.** When an admin or the
programme's lead places a seat that has left back on the run (the allocate
route), the place on the form that leaving or Remove gave up is theirs again,
in the same transaction (`readPlaceToRestore` and `restorePlaces` in
`src/lib/applications/status/record.ts`): the application holds the place
(`accepted`), the "I can’t make it" that gave it up, any reason given with it
and the day it went are taken off, and the form's counters move back. So
their page says they hold a place (and, once Publish tells them, their
group), never "You’ve told us you can’t make it.", and every list and count
of the programme's places says the same through `standingOf` and
`holdsPlaceOn`, with no second rule. Only a place given back on that
programme by "I can’t make it" is given again; anything else stays as it is
and the seat records the put back (`putBackAt`), so the card and Publish
follow it as before. `tests/course-hub-put-back.test.mjs` runs it as an admin
and as the programme's lead.

`tests/course-hub-leaving.test.mjs` runs the leave as every kind of caller
and holds what it writes on both sides, and
`tests/course-hub-cant-make-it-after-placement.test.mjs` runs the reply door
beside it, holds the two doors to the same records, the application page
to its words in every state, and the tree to one writer of a seat that has
left and one answer to "in a group".

### What the person sees

**Nothing, because of the hand-over.** The hand-over writes a row the
course side places people from. That row is a working list and not news for
its owner. What became of their application is said on their own
application page and on the list of their applications and nowhere else,
and what comes next for their kind of programme is said there too ("One set
of words for an outcome"). So the member area says nothing because of the
row. `/api/courses/me` lists every run somebody is on, and has always drawn
a person's own accepted or waitlisted row on a run as a card ("Place
offered", "Waitlisted"). It passes a row with `fromForm` over before it
looks at its status. Whatever the run's own applications page then does to
the row (accepts it again, moves it to the run's waiting list, rejects it,
annotates it), nothing is announced, and the words of a run's own
application form are never drawn for somebody who never used that form.

**So after a hand-over they read what they read before it.** The dashboard
and the list of their programmes (`/learn`) are the two pages "One set of
words for an outcome" describes for a member who holds a place and has no
run: neither says they are on nothing, neither states an outcome, and the
way to their applications is on the page. A hand-over changes none of that.
It is invisible to the person, which is what the panel beside the button
tells the admin who presses it.

**The first thing the course system shows them is their group, once
Publish has told them it.** An admin's first placement of somebody on the
board makes their place on the run, and that place is the board's working
copy until Publish emails them their group (`allocatedEmailAt` on the
enrolment, which a move clears). Until then their member area reads exactly
as it did before the placement and the run stays shut to them, and nobody
but an admin is shown their name in the group: not its facilitators, not
its other members. Moving people on the board emails nobody and shows
nobody anything. Once Publish has emailed them, the run and their group
show and the run opens to them, as for anybody in a group. Somebody moved
to another group after Publish is untold again, and reads nothing of the
run until Publish is pressed again and emails them alone their new group.
One function decides all of it, `placementIsTold` in
`src/lib/firestore/courseEnrolments.ts`, and
`tests/course-hub-group-published-readers.test.mjs` holds every reader of
placements to it. Once Publish has told somebody their group, "I can't make
it" on the form is leaving the programme and takes them off the run
("Leaving the programme gives the place back"); until then a reply on the
form leaves a placement where it is, and nothing here takes anybody off a
run.

**Nothing of the application is read for any of it.** The route reads the
collections it read before application forms existed and none of the
application system's, for the member and for an admin viewing the site as
them alike.

**One corner, accepted.** Whether a member holds a place is read off their
own application (`holdsPlace()`). If a form is destroyed between a
hand-over and a placement, the application has gone, the answer becomes
no, and both pages tell those people they are on nothing until they are put
in a group. Their rows stay on the run and the board still places them.
The operations runbook says so, under destroying an admission round.

`tests/applications-handover-member-area.test.mjs` runs the route as each
person, through every status the run's own applications page can give a
row, and draws the card somebody in a group then reads.

## What deletes what

| When | What goes | What stays |
| --- | --- | --- |
| A form is destroyed | The form, its question sets, every application with the access-requirements row, the decision document and the assessment beside it, every review, every decision document, and the log lines about the form's decisions | Each applicant's member record, the delivery log, the download log, the course runs, and on those runs the rows a hand-over wrote |
| An account is deleted | Each of its applications with the access-requirements row, the decision document and the assessment beside it, the reviews about it, the reviews it wrote, and its name wherever a round carries it: the reviewer list, the final decider, and the lead and reviewers of each programme | Its member record, the log lines |
| A course run is destroyed | Nothing on a form. The run's own rows go with it, the ones a hand-over wrote included | The form, with any programme whose `runId` named that run |
| A course is destroyed | Nothing on a form | The form, with any programme whose `courseId` named that course |

- **A form is destroyed through the round destroy**
  (`src/lib/admissions/destroy.ts`), the one older action a form shares. It
  writes the member record for every applicant before it deletes anything, and
  refuses outright if one cannot be written.
- **Whatever deletes an application deletes the decision at its id in the same
  batch.** A decision is a judgement about a named applicant, and it never
  outlives the application it is about.
  `tests/application-decision-lifetime.test.mjs` lists every file that could
  delete an application and holds each to it. An applicant never deletes their
  own application: withdrawing is a status.
- **The destroy finds decisions two ways**: by the round they name, and at each
  application's id in that application's batch. A decision document still
  carries `roundId` and `uid`, because the staff screens list by them.
- **A log line about a decision carries `roundId`**, the form's id, and
  `runId: ""`. The destroy finds the lines by `roundId`, and one written
  without it is never found again.
- **Deleting an account takes its name off every programme that names it**, and
  out of the round's `reviewerUids` in the same update, so the two lists never
  disagree about somebody who has gone.
- **A programme's `runId` can name a run that has since been destroyed.** The
  run destroy writes no round. Whatever reads a programme's `runId` treats a
  run that is not there as no run.
- **A row a hand-over wrote belongs to the run, not to the form.** It is
  deleted with the run, or with its person's account, by the course
  system's own cascades, which delete a run's rows and an account's rows
  wherever they came from. Destroying a form removes no row and takes
  nobody off a run. What a row holds then is a name, that its person has a
  place, and the two ids in `fromForm`, which lead nowhere once the form
  has gone. Nothing a person wrote on the form was ever on it.
- **A programme's `courseId` can name a course that has since been
  destroyed**, for the same reason: the course destroy writes no round. The
  Settings tab shows such a tie as a course that is no longer on the site,
  and no public page can be offered the form through it, because there is no
  page.
- **An application's earlier versions go with the application.** They are
  fields of its own document, so every delete above takes them in the same
  write, and nothing else holds a copy.
- **So does the assessment at its id** (`admissionAssessments`), in the same
  batch, for the same reason as the decision: it is a reading of the
  application and of the reviews about it, and worth nothing without them.
- **So does a freed place offered on it** (`freedPlace` and its
  `invitation`), and the record of a freed-place test goes with the form
  (`freedPlaceTests`). Neither has a collection of its own.

## Claude and Pangram

An admin can ask two outside services about an application, as a second
reader beside the decision: Claude (Anthropic's API) writes a read of it, and
Pangram, an AI-writing detector, checks its longer answers. Both are named in
the privacy policy as processors. Neither decides anything, and nothing either
says reaches the applicant.

- **An admin's alone.** The routes refuse everybody else before anything is
  read (`src/lib/applications/assessment/run.ts`). A lead scores blind first
  and the read draws every reviewer together, so it is never shown to one.
- **Asked for, never automatic.** Opening an application reads what is already
  stored and sends nothing. The review screen's button, "Assess the rest" on a
  programme's list, or "Read everyone" on Plan the intake, sends.
- **One read per application, in two passes**
  (`assessment/claudeRead.ts`). Claude reads the application blind first,
  with nothing the committee scored or wrote, then again with its own first
  view and the committee's scores and comments. The read is of the whole
  application, with a lean and a fit for every programme the person ranked,
  so it is made once and every programme's screens read their part of it
  through `assessment/stored.ts`. The blind view is kept beside it.
- **What is sent is built from the admin's own review payload**
  (`assessment/input.ts`), so the fences above hold by construction: the
  access-requirements answer and the SU membership answer are in no review
  payload. On top of that it takes out the applicant's name, addresses and
  account id, letters the reviewers ("Reviewer A") instead of naming them,
  and leaves out availability. Words an applicant typed are sent as typed.
- **Pangram sees only answers of 50 words or more** (`PANGRAM_MIN_WORDS`),
  joined into one text and sent once per application, because Pangram
  charges by the request as well as by the word. Each answer's reading is
  made from the stretches (`windows`) of that check that cover it
  (`readingsForParts` in `src/lib/ai/pangram.ts`). On a sentence or two a detector's verdict is close
  to a guess, and a wrong flag on a student is an accusation. A flag reads
  "worth a look", never a verdict. Claude is told not to judge whether
  anything was written with AI, and not to mark anybody down for their
  English.
- **What is kept.** `admissionAssessments` holds Claude's read (`read`) and
  Pangram's check, with the letters and the ACCOUNTS they stood for, never
  a reviewer's name: the names are put back on the way to the screen. A read
  carries a hash of what was sent, and is shown as out of date once the
  answers or the reviews change. It goes with its application (see What
  deletes what) and is never copied to a member record.
- **Across a programme.** On a programme's list an admin can ask Claude to
  compare the applications it has read (a shortlist up to the places, the
  borderline, the clear no's, who is worth a second look, who would suit
  another programme) or ask one question about them
  (`assessment/programmeInput.ts`, `assessment/overview.ts`). It is made from
  the stored reads, never the applications, with applicants numbered in
  account-id order and reviewers lettered once across the programme. A name
  an admin types into a question is swapped for its label before it is
  sent. Neither answer is stored.
- **Arranging groups.** On a programme's Times view an admin can ask for a
  proposed arrangement of the people holding a place into groups
  (`src/lib/applications/arrange/`). The site works out a first split from when each person said
  they are free (`arrange/plan.ts`: nobody already told their group moves, the
  run's groups first, more only when needed, the most constrained seated
  first, then the groups evened out). Claude is then told the groups and
  people by number, which other groups each person can make (never their
  week), and its own reads, and suggests a facilitator per group and moves.
  `arrange/advice.ts` keeps a suggestion only when it fits: a facilitator
  must have offered and be able to make the group, and sits in it; a move
  must be to a group the person can make, with room, and never of somebody
  told. Nothing is written or stored. Apply on the page places people
  through the site's own routes for groups, places and facilitators, in
  that order, and stops at the first refusal; nobody is emailed until
  Publish.
- **The whole term at once.** Plan the intake
  (`/admin/admissions/forms/[roundId]/intake`, admin only, before decision
  day) drafts who goes where across every programme: applicant-proposing
  deferred acceptance (`intake/match.ts`), each programme preferring its
  lead's acceptances, then Claude's leans, then the committee's scores, never
  past its places and never overruling a lead's Decline. Claude is then told
  the term by number (`intake/advice.ts`) and suggests changes, a facilitator
  shortlist from those who offered, and people who did NOT offer but should
  be asked; only what fits the rankings, the declines and the places is kept.
  Nothing is written. Apply makes each person's decisions through the
  decision route (`decisionsFor`: pool everything ranked above the plan's
  programme as a better fit, then accept it), and nobody is emailed until
  decision day. Clear all reads deletes every `admissionAssessments` document
  on the form (`assessment/clear.ts`).
- **Inside one request.** The backend stops a request at 300 seconds (it was
  60 until the comparison needed more). A read is given 150 seconds, a
  comparison 240, and no call is retried. The two parts of a read are
  separate requests, and a programme's worth of reads is walked by the
  browser two at a time.
- **The keys** are `ANTHROPIC_API_KEY` and `PANGRAM_API_KEY`, secrets in each
  project's own Secret Manager, `RUNTIME` only in `apphosting.yaml`. A site
  with no key says so and sends nothing. Each project's key lives in its own
  workspace on the Claude Platform, with its own monthly spend limit.

`tests/applications-assessment.test.mjs` runs the routes: who is refused,
that no name is sent or stored, that a changed review puts a read out of date,
that Pangram is sent only the long answers, in one request, and that a
comparison or a question sends labels, never names, and stores nothing.
`tests/applications-intake-plan.test.mjs` runs Plan the intake and Clear all
reads, and `tests/applications-intake-match.test.mjs` the draft.

## The modules

All in `src/lib/applications/`.

| Module | What it is | Runs |
| --- | --- | --- |
| `model.ts` | Types, limits, `questionKey()`, `applicationId()` | anywhere |
| `keys.ts` | What an id is, and `own()`, the one way a map is read by one | anywhere |
| `normalise.ts` | Reads stored documents into the model's shapes. Never throws. | anywhere |
| `sections.ts` | Which steps and question sets one person sees, and in what order | anywhere |
| `validate.ts` | What stops a send; what a good answer to each type of question is; what is copied into `sent`; word counts | anywhere |
| `versions/kept.ts` | What a send keeps of the application it replaces: what counts as a change, the cap, how the versions are read | anywhere |
| `scoring.ts` | Scored questions, section scores, first-review blindness | anywhere |
| `decisions.ts` | Placement, outcomes, who is in the term, who holds a place, tallies, readiness, recommendations | anywhere |
| `words.ts` | Labels, ordinals, how a set its author named is called, the words applicants never see | anywhere |
| `linkedText.ts` | Which parts of an author's line are links: `linkedParts()`, and the sentence the editor shows about it | anywhere |
| `access.ts` | Staff predicates | server |
| `roles.ts` | `setProgrammeRoles`, the one writer of leads and reviewers | server |
| `repo.ts` | The form, its sets, the caller's own application | server, applicant-safe |
| `staffRepo.ts` | Everybody's applications, reviews, decisions | server, staff only |
| `status/standing.ts`, `status/replies.ts`, `status/reasons.ts`, `status/view.ts`, `status/words.ts`, `status/runWords.ts` | Where one person stands after sending, what each reply does, why somebody gave a place back and how the committee reads it, what their page says, the chip and title of an outcome, what the page says once the place is a group and once they have left it | anywhere |
| `status/load.ts`, `status/record.ts` | The page's read, the one transaction a reply writes, and the same writes made inside the transaction that takes somebody off a run when they leave it | server, applicant-safe |
| `accounts/approve.ts`, `accounts/afterReply.ts` | Approving a waiting account on an acceptance, and the call an accepted invitation makes | server, applicant-safe |
| `lifecycle/openForm.ts` | Which form is open, which form speaks for each course, and whether a form places people on a course run, for a page that offers Apply | server, safe for a page any visitor can load |
| `lifecycle/publicTerm.ts` | Where the term is (`none`, `before`, `open`, `closed`, `running`) and what is on it, for a page that draws the term | server, safe for a page any visitor can load |
| `editor/courses.ts` | The courses a programme can be tied to, and the one rule the box and the route share | server, staff |
| `handover/run.ts` | The course run a programme names: which run it can name, and `setProgrammeRun`, the one writer | server, staff |
| `handover/holders.ts` | Who holds a place on a programme and has been told, and how that compares with a run's own list | anywhere |
| `handover/handOver.ts` | `handOverProgramme`, the one writer of a place holder's row on a course run, and what stops a press | server, staff |
| `handover/load.ts`, `handover/views.ts` | The read behind naming a run and handing people over, for an admin | server, staff; the shapes anywhere |
| `handover/board.ts` | What the allocation board is told about somebody the form placed: which groups they can make, and whether they still hold the place | server, staff |
| `freedPlaces/rules.ts`, `freedPlaces/words.ts`, `freedPlaces/views.ts` | Offering a place given back: who may, the window, who can be offered one, seats, what a request may carry; the email and the page's words; what the page is sent | anywhere |
| `freedPlaces/tested.ts` | The fingerprint a freed-place test is recorded with and a send compares | server |
| `freedPlaces/groups.ts`, `freedPlaces/load.ts`, `freedPlaces/offer.ts` | The run's calendar and groups; the page's read; the one writer of an offer, its emails and its test | server, staff |

## Rules for anything built on this

- **A route that serves an applicant** is gated by `requireApplicant()` and
  imports `repo.ts`, never `staffRepo.ts`. It returns a projection listed field
  by field, never a spread of a stored document.
- **Anything that reads the caller's own application asks first whether the
  session is a view-as session**, and reads nothing if it is: a route refuses
  with `assertNotImpersonating()` as its first statement, reads included, and
  a screen draws the notice. A new one is added to the list in
  `tests/applications-view-as-own-application.test.mjs`.
- **A route that serves staff** takes its answer from `access.ts`, after
  `getCurrentUser()` and before any read. A mutating route calls
  `assertNotImpersonating()` first.
- **A writer asks who may inside the transaction that writes.** A role on a
  form, a right to read an application and somebody's standing are all read
  off stored documents, which can change between a read and a write. So a
  function that writes in a transaction asks them of the documents that
  transaction read, as `editor/write.ts`, `roles.ts` and `review/decide.ts`
  do. `tests/applications-roles-in-transaction.test.mjs` walks every function
  in the library that reaches a transaction and fails one that asks on the
  way there and not inside. `canRunTerm` is asked of the session alone, so
  it is not one of them.
- **A function that is handed an applicant's id asks who may read the
  application before it answers about it.** A right to act on a programme is
  not a right to be told about a person. A new function under `review/` or
  `decisionDay/` that takes the database is added to the list in
  `tests/applications-readable-before-answering.test.mjs` with what it is
  handed: it asks `canReadApplication()`, or it is for an admin alone, or
  nothing outside this library can call it.
- **A committee screen is built for somebody.** A function that reads
  everybody's applications, decisions or reviews takes the viewer and leaves
  their own application out through `termPictureFor()` or `termsFor()`, or
  it is on the list in `tests/applications-own-application.test.mjs` with
  why it reads everybody. A term is never planned from a raw list anywhere
  else. A writer that is handed an applicant's id refuses the caller's own
  before it reads.
- **The SU membership answer is read in one place.** A new file outside the
  applicant's own form that names it is a new reader of something applicants
  are told does not affect their application, and that the privacy page says
  admins alone are shown. It is added to the list in
  `tests/applications-su-membership-answer.test.mjs` only once both of those
  still hold, and the privacy page's own list
  (`tests/privacy-policy.test.mjs`) with it.
- **Stored text becomes an address in one place.** A line an author wrote is
  drawn with its links through `LinkedText`, and nothing else under the
  form's folders makes an `href` out of text an author or an applicant
  typed. A new `href` that is not written out in full is added to the list
  in `tests/applications-linked-text.test.mjs` with what it is built from.
  Nothing there is set as HTML.
- **A set's note for admins is not an applicant's to read.** A set has two
  lines, `applicantLine` and `intro`, and only the first is sent to an
  applicant. Nothing that builds what an applicant is sent, and nothing the
  form draws, reads `intro` or falls back on it. A new line or label for
  applicants gets a field of its own.
- **A row the form puts on a course run is an admin's and its programme's
  lead's.** A staff route that reads or acts on `courseApplications` asks
  `rowIsServedTo()`, with the caller's standing from `runStaffingOf`, before
  it lists, places, publishes, decides or annotates a row, so that a row
  with `fromForm` goes to an admin and to the lead of the programme that
  wrote it, and to nobody else a run names. A new reader of the collection
  is added to the list in `tests/applications-handover-row-readers.test.mjs`
  with what it does about such a row.
- **Nothing of an application is stored on the course side.** A hand-over
  writes who somebody is and where their place came from. Whatever the
  course side needs to know about what they wrote, it asks for when it is
  drawn and is handed the answer, as the board is handed which groups a
  person can make and never the week they painted.
- **An outcome changes after the send in one way, through one writer.**
  "No offer this time" to an invitation for a place given back, by
  `offerFreedPlaces` (`freedPlaces/offer.ts`), on the terms in "A place given
  back after decision day". Nothing else writes `invitation` after the send,
  and nothing at all rewrites `result`. A new writer of either is the rule
  changing again, and needs saying so.
- **The hand-over only creates.** It never changes a row that is there and
  never takes anybody off a run, so pressing it again is always safe. A
  person is handed over only once decision day has reached them.
- **Who is handed over is `holdingOf()`.** Like every other count of
  places. A second test for "holds a place" is how the board and the
  programme's own screens would come to disagree.
- **A row a hand-over wrote is announced as nothing.** It is the course
  side's list to place people from. Anything that draws a person's own
  `courseApplications` row for them passes a row with `fromForm` over
  before it reads its status, and reads nothing of the application for it.
  What became of an application is said in the two places "One set of
  words for an outcome" names, and the first thing the course system shows
  somebody the form placed is their group, once Publish has emailed it to
  them.
- **Leaving a programme is one act with two doors.** A seat is left only
  through `leaveRun` (`src/lib/courses/leaveRun.ts`), which "Leave the
  programme" and a reply of "I can't make it" from somebody in a group both
  take, and whether somebody is in a group Publish has told them about, for
  the reply and for what they read about their application, is
  `readPlaceOnRun` and nothing else. A new way out calls the one, and a new
  page that says where somebody stands on the run asks the other.
  `tests/course-hub-cant-make-it-after-placement.test.mjs` lists the
  callers of both, and fails a second writer of a seat that has left.
- **No query that sorts or ranges on the server.** Every read here is one or
  two equalities, which need no composite index. A term is a few hundred
  documents: filter and sort in memory.
- **Ids are letters, digits, hyphen and underscore.** No dot: ids are keys in
  Firestore field paths and in `questionKey()`. And never a name every object
  carries (`constructor`, `toString`, `__proto__` and the rest): `isId` refuses
  those, so one can never be the id of a programme, a question set or a
  question.
- **A map is read by an id through `own()`, never as `map[id]`.** The id
  usually came from somewhere else: a ranking an applicant typed, a programme
  id in an address. A plain object answers to names it does not own, and
  `programmes["constructor"]` is a function, not a missing programme. `own()`
  (`keys.ts`) answers from the map's own keys only. This covers `programmes`,
  `answers`, `scores` and a decision's `programmes`, the tallies worked out
  from them, and every other map from a string that a file here declares.
  `tests/applications-own-key-reads.test.mjs` walks every file under `src`
  for a read written any other way, and no tree is let off: other features
  keep maps under the same names (an event's sign-up answers, a worksheet
  response's, the older apply flow's), the same is true of them, and they
  are read the same way. The guard lists where these maps are read by a key
  and what each place reads. It also holds that there is one accessor: a
  folder may hand `own` on under its own import path, and may not write a
  second. Validate an id from a request with `isId()` as well: the two rules
  fail differently, so both are kept.
- **Counters move with the status.** A route that changes an application's
  `status` moves the round's `applicationCounts` in the same transaction.
- **Count the people in the term.** Filter by `isInTerm()` before
  `tallyTerm()`, and before any other count of places, decisions owed or
  people to be told. Listing somebody who has left is fine; counting them is
  how two screens come to disagree about a place.
- **A place is counted one way.** Hand `tallyTerm()` each applicant with its
  application, and read places from its `placed`, `joined` and `invited`, or
  from `freePlaces()`. Never count a place from the decisions on their own:
  after decision day they do not know who accepted an invitation.
- **Questions lock once somebody has sent an application.** Editing a question
  set after that would change what an answer already given was an answer to.
- **An earlier version is for the people reviewing the application.** A new
  reader of `sentHistory` is added to the list in
  `tests/applications-versions.test.mjs` with what it does with it, and
  nothing that builds an applicant's page belongs on that list. On a review
  screen, compare versions a part at a time through `review/earlier.ts`, so
  that what is shown before is held to the same rules as what is shown now.
- **Email** goes through `sendEmail()` with reply-to set to the society's
  contact address, and nowhere else. See "Who a copy of the site may email" in
  `docs/notifications.md` for what staging does with it.
