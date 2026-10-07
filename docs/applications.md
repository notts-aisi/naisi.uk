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
| question set | A group of questions shown to the people it applies to. |
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

Every one of these is `allow read, write: if false`. Nothing is read or written
from a browser. The routes run on the Admin SDK and are the boundary.

A round with `formVersion: 2` is an application form and is edited only by the
application form's own routes. The older round editor and its routes belong to
rounds without it.

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
  single course's own intake.
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
somebody who may not see a round is not told it is a form.

`tests/admissions-form-fence.test.mjs` walks the tree for every route, page and
layout with a round id in its address, and for every other file that can
address a round. Each is listed with what it does about a form, and what its
entry says is read out of the source and then executed. A new one fails until
somebody decides what it does.

The routes under `/api/admissions/forms` are the form's own, and the routes
under `/api/admissions/rounds` are the older ones. A form's own route reaches a
round only through `src/lib/applications/`, whose loader answers null for a
round that is not a form, so the fence holds in the other direction too.

## The four rules everything else follows from

**1. An applicant's own document changes only when the applicant acts, or when
decision day publishes.** Scores and comments are in `admissionReviews`. Each
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
revoking an acceptance, an exception, and the decision-day send.

**Somebody who joins by invitation is read from the moment they accept, and
not before.** An invitation is to a programme the person did not pick, so
while it is only picked, or sent and not yet answered, that programme's lead
and reviewers are shown a number of places kept for invitations and never
the person. Once the person accepts (`joinedByInvitation()` in
`decisions.ts`), the programme's lead and reviewers read the application as
if it had ranked the programme (`canReadApplication()` takes the joined
programme beside the ranking), and it has a row in the programme's list,
marked `byInvitation`, standing as accepted, with no decision to make and
nothing of that programme's to score. The invitation card tells the person
so before they press Accept. If they later cannot make it, the row stays,
marked withdrawn, like anybody else's who left after applying. Somebody who
says no thanks is never read by the programme they turned down.
`tests/applications-wave-h-joined.test.mjs` runs every kind of account
against every way an invitation can stand.

A lead or a reviewer has to be an admin or SU-recognised committee, because
applications are personal. That is checked against their live user document
when they are named (`setProgrammeRoles` in `roles.ts`, the one writer) and
again every time the role is used (`isNamedWithStanding`), because nothing
takes a name off a form when its owner's standing changes. Only an admin
changes a lead. A lead can add and remove their own programme's reviewers.

The round's `reviewerUids` is kept as the union of every lead and reviewer on
the form, with the `users.admissionsReviewer` flag that draws the sidebar
entry, so every existing gate keeps working without knowing about programmes.

## Scores

Scoring is per answer, 1 to 5, and optional per programme (`useScores`). Only a
stream set's questions can carry `scored`; the flag is cleared on read anywhere
else.

- A reviewer's score for a programme is the mean of what they gave its answers.
- The section score is the mean of the reviewers' scores, one voice each.
- **A first review is blind to other reviewers.** Until you have scored every
  answer there is to score for a programme, you are not shown what anybody else
  gave or wrote for it (`reviewsVisibleTo`). An admin can switch that off for
  the form (`revealOtherReviews`).
- **Names are shown.** Reviewers see who they are reading, and the form has to
  tell applicants so.

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
send and no reply changes them. A reply does take its owner out of the term.
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
"Replies").

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
actually run it (`decisionDay/armed.ts`).

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

## What deletes what

| When | What goes | What stays |
| --- | --- | --- |
| A form is destroyed | The form, its question sets, every application with the access-requirements row beside it, every review, every decision document, and the log lines about the form's decisions | Each applicant's member record, the delivery log, the download log, the course runs |
| An account is deleted | Each of its applications with the access-requirements row and the decision document beside it, the reviews about it, the reviews it wrote, and its name wherever a round carries it: the reviewer list, the final decider, and the lead and reviewers of each programme | Its member record, the log lines |
| A course run is destroyed | Nothing on a form | The form, with any programme whose `runId` named that run |

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
- **An application's earlier versions go with the application.** They are
  fields of its own document, so every delete above takes them in the same
  write, and nothing else holds a copy.

## The modules

All in `src/lib/applications/`.

| Module | What it is | Runs |
| --- | --- | --- |
| `model.ts` | Types, limits, `questionKey()`, `applicationId()` | anywhere |
| `keys.ts` | What an id is, and `own()`, the one way a map is read by one | anywhere |
| `normalise.ts` | Reads stored documents into the model's shapes. Never throws. | anywhere |
| `sections.ts` | Which steps and question sets one person sees | anywhere |
| `validate.ts` | What stops a send; what is copied into `sent`; word counts | anywhere |
| `versions/kept.ts` | What a send keeps of the application it replaces: what counts as a change, the cap, how the versions are read | anywhere |
| `scoring.ts` | Scored questions, section scores, first-review blindness | anywhere |
| `decisions.ts` | Placement, outcomes, who is in the term, who holds a place, tallies, readiness, recommendations | anywhere |
| `words.ts` | Labels, ordinals, the words applicants never see | anywhere |
| `access.ts` | Staff predicates | server |
| `roles.ts` | `setProgrammeRoles`, the one writer of leads and reviewers | server |
| `repo.ts` | The form, its sets, the caller's own application | server, applicant-safe |
| `staffRepo.ts` | Everybody's applications, reviews, decisions | server, staff only |
| `status/standing.ts`, `status/replies.ts`, `status/view.ts`, `status/words.ts` | Where one person stands after sending, what each reply does, what their page says, the chip and title of an outcome | anywhere |
| `status/load.ts`, `status/record.ts` | The page's read, and the one transaction a reply writes | server, applicant-safe |
| `accounts/approve.ts`, `accounts/afterReply.ts` | Approving a waiting account on an acceptance, and the call an accepted invitation makes | server, applicant-safe |

## Rules for anything built on this

- **A route that serves an applicant** is gated by `requireApplicant()` and
  imports `repo.ts`, never `staffRepo.ts`. It returns a projection listed field
  by field, never a spread of a stored document.
- **A route that serves staff** takes its answer from `access.ts`, after
  `getCurrentUser()` and before any read. A mutating route calls
  `assertNotImpersonating()` first.
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
