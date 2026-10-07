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
