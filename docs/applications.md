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
  page that reads one application back returns a notice. The appointment
  queue answers as it does for a round that is not there.
- **It leaves the form alone.** The two scheduler jobs that walk open rounds
  skip a form and count it, so nothing older emails an applicant on one. The
  lookup behind the course pages drops a form, so one is never offered as a
  single course's own intake.
- **It serves both**, on purpose: destroying a round, deleting an account, the
  member record, the list of one person's applications, and the apply page.
  That page shows a form on the form's own screen, which it asks for first.
  Everything after that is the older apply flow, whose loader reads a form as
  a round that is not there, so the older flow is never drawn for one. The
  page's title keeps the same order, so a form that is still a draft has no
  title of its own, as it has no page.

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

**2. There are two copies of what the applicant wrote.** `draft` is what the
form is showing and is saved as they type. `sent` is the application of record
and is replaced whole each time they press Send. Reviewers read `sent` and
nothing else. An applicant can change their answers until the close, and a
half-made change never unseats the application they already sent.

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
| Lead of a programme | those that ranked it | that programme | that programme | that programme | no |
| Reviewer of a programme | those that ranked it | that programme | no | no | no |

"Runs the term" is the form itself, the outcome each pooled applicant hears,
revoking an acceptance, an exception, and the decision-day send.

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

## The modules

All in `src/lib/applications/`.

| Module | What it is | Runs |
| --- | --- | --- |
| `model.ts` | Types, limits, `questionKey()`, `applicationId()` | anywhere |
| `keys.ts` | What an id is, and `own()`, the one way a map is read by one | anywhere |
| `normalise.ts` | Reads stored documents into the model's shapes. Never throws. | anywhere |
| `sections.ts` | Which steps and question sets one person sees | anywhere |
| `validate.ts` | What stops a send; what is copied into `sent`; word counts | anywhere |
| `scoring.ts` | Scored questions, section scores, first-review blindness | anywhere |
| `decisions.ts` | Placement, outcomes, tallies, readiness, recommendations | anywhere |
| `words.ts` | Labels, ordinals, the words applicants never see | anywhere |
| `access.ts` | Staff predicates | server |
| `roles.ts` | `setProgrammeRoles`, the one writer of leads and reviewers | server |
| `repo.ts` | The form, its sets, the caller's own application | server, applicant-safe |
| `staffRepo.ts` | Everybody's applications, reviews, decisions | server, staff only |

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
  `answers`, `scores` and a decision's `programmes`. Validate an id from a
  request with `isId()` as well: the two rules fail differently, so both are
  kept.
- **Counters move with the status.** A route that changes an application's
  `status` moves the round's `applicationCounts` in the same transaction.
- **Questions lock once somebody has sent an application.** Editing a question
  set after that would change what an answer already given was an answer to.
- **Email** goes through `sendEmail()` with reply-to set to the society's
  contact address, and nowhere else. See "Who a copy of the site may email" in
  `docs/notifications.md` for what staging does with it.
