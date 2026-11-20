# The AI at Nottingham survey

`/ai-survey`: "AI at Nottingham: what should students ask for?" An anonymous
survey of Nottingham students, about fifteen minutes, one answer per student, with
a University-email check in front of it. Built beside the Surveys feature
(docs/surveys.md) and sharing nothing with it: no record, no route, no type.

This page is the contract. The code says how; this says what must stay true.

## The promise

The start screen tells every student: "we can't tell which answers are yours".
Everything below exists to keep that sentence true.

| The rule | How it is kept | Held by |
|---|---|---|
| An address never meets an answer | The step that checks a code writes the address's keyed hash to the used-email list and writes nothing to the answers. An answer set first exists when its first page is saved, from the browser's pass alone | `tests/ai-survey-no-trace.test.mjs`, `tests/ai-survey-flow.test.mjs` |
| An answer set carries no date or time | It holds the survey's version, the order of the proposal pages, its pages, and that it is finished. Firestore stamps a time on every document, so an answer set is a field inside a shared document, never a document | both |
| A shared document's update time does not date a save | With few people saving, every save rewrites every shared document in the same commit, so they carry one time between them. In a room (more than 8 saves on one server inside 20 seconds) a save writes its one document, one save in each 20 seconds rewrites them all, and no one save stands out among the rest. The job rewrites them when people stop | `tests/ai-survey-flow.test.mjs` |
| Which document an answer set is in says nothing about when | People are spread at random over all 16 documents from the first person on. Fewer documents while there were fewer people was tried, and it made the document's number a clock | `tests/ai-survey.test.mjs`, `tests/ai-survey-flow.test.mjs` |
| The used-email list is hashes and nothing else | HMAC-SHA-256 under a secret used for nothing else, as fields in 16 shared documents, with no time | both |
| "Already answered" is said only after the right code | Asking for a code never reads the list | `tests/ai-survey-flow.test.mjs` |
| A wrong code says one thing | "That code doesn't match", whether a code is waiting, was used a moment ago or was never asked for | `tests/ai-survey-flow.test.mjs` |
| The server keeps no session | The browser holds a signed pass, replaced on every save, good for 24 hours after the last one | `tests/ai-survey.test.mjs` |
| Reading the datastore is not enough to write a pass | The key that signs passes is made from the secret and is never stored. The record holds only a value that names this generation's passes | `tests/ai-survey.test.mjs`, `tests/ai-survey-flow.test.mjs` |
| A reply lost on the way does not shut a student out | Before it checks its code the browser makes 32 random bytes of its own, kept in memory only, and the pass is made from them. A used code is kept until it runs out, marked done, with a hash of those bytes; the same browser asking again is given the same pass, and anybody else is told the code doesn't match | `tests/ai-survey-flow.test.mjs` |
| Finish pressed twice is one finish | A Finish that arrives again for a finished set is told it is finished, and nothing is written | `tests/ai-survey-flow.test.mjs` |
| Nothing is read back | Coming back says which pages are saved, never an answer | `tests/ai-survey-no-trace.test.mjs` |
| The code email leaves no row in the send log | It goes through `sendUnloggedText` in `src/lib/email/send.ts`: plain text, no link, the suppression list and the audience still asked first | `tests/ai-survey-no-trace.test.mjs` |
| Nobody is asked who they are | The public routes read no session, cookie, header or IP address, and the page calls them with no credentials and no referrer | `tests/ai-survey-no-trace.test.mjs` |
| The consent answer goes nowhere | It is asked on the start screen, held in the page for that screen only, never sent and never stored. "No" leads to a closing screen and never to the email step | `tests/ai-survey-no-trace.test.mjs` |
| A link out says nothing about where the person came from | The support links and the newsletter link open in a new tab with no referrer, and are plain addresses with no query | `tests/ai-survey-no-trace.test.mjs` |
| No limit by IP address | One code a minute and ten a day for an address, and a ceiling an hour across the survey, kept in the datastore | `tests/public-write-gating.test.mjs` |

## Where things are

| | |
|---|---|
| The words | `src/content/aiSurvey/definition.ts`. Data, not code. The questions are locked once the survey is open: a change to one raises `version`, which is kept on each answer set. The words around them (the start screen, the end screen, the notice) can change without it, and [ai-survey-changes.md](ai-survey-changes.md) records each change |
| Reading the definition, the checks, the export | `src/lib/aiSurvey/{definition,answers,exportCsv,address}.ts`, all pure |
| Storage | `src/lib/aiSurvey/store.ts` |
| The email check | `src/lib/aiSurvey/emailCheck.ts`, and its steps on the page in `src/features/aiSurvey/emailSteps.ts` |
| Saving and coming back | `src/lib/aiSurvey/saving.ts`, `pass.ts` |
| The admin side | `src/lib/aiSurvey/adminStore.ts` |
| Pages | `src/app/ai-survey` (the survey, `/privacy`, `/results`, `/admin`) and `src/features/aiSurvey` |
| Routes | `src/app/api/ai-survey` |
| The job | `src/lib/scheduler/jobs/aiSurveyTidy.ts` |

## Records

Five collections, written by the server alone and locked to every browser,
admins included (`firestore.rules`, and `scripts/rules-tests/tests/ai-survey.test.mjs`).

| Collection | Holds |
|---|---|
| `aiSurveyState` | `main`: the stage, the storage generation, a value that names this generation's passes (the key that signs them is that value under the secret), the allowlist, and the ceiling when it has been changed. `codes`: codes sent a minute, for two hours. `downloads`: who downloaded the answers, when, how many rows |
| `aiSurveyAnswers` | Answer sets, as fields inside shared documents named `{generation}-{number}` |
| `aiSurveyUsedEmails` | Keyed hashes of the addresses that have answered, in 16 shared documents |
| `aiSurveyCodes` | Pending codes: a hash of the code, when it runs out, wrong tries. A used one stays until it runs out, marked done, with a hash of the value its browser made |
| `aiSurveyCodeLimits` | For a hashed address: today's count of codes and when the last was sent |

No index is needed: every read is by document id or a range on one field.
`firestore.ai-survey.indexes.json` goes further and tells the survey's own
database not to index the two shared maps at all (the answer sets and the
used-email hashes), because a field nobody queries by is only a cost and a
limit. It deploys with the rules, by the command below.

### How many people one answers document holds

An answer set is a field inside a shared document, so two of Firestore's
limits on one document apply to the sum of the sets in it: 40,000 index
entries (where the exemption above is not deployed: two for every answer, two
for every group of answers and two for every item of a list, as measured) and
1 MiB. `PEOPLE_PER_DOCUMENT` in `store.ts` is 80, which leaves room under
both with every question answered and a long comment from everybody.
`tests/ai-survey.test.mjs` works both sums out from the survey as it stands,
so a longer survey that would not fit fails there and not on the day.

They can live in a database of their own. `AI_SURVEY_DATABASE` names it; with
the setting empty they live in the site's. A database of its own is kept with
no point-in-time recovery and no backups, because a copy of an earlier state is
a record of when each answer arrived. Its rules are one refusal
(`firestore.ai-survey.rules`), deployed with its own config so the site's
rules and their deploy are untouched:

```sh
npx firebase deploy --only firestore --config firebase.ai-survey.json --project <default|dev>
```

## Stages

- **Pilot.** Reachable by its address. Works without the real key, on a
  stand-in kept with the state. "Clear pilot data" throws the answers and the
  used-email list away and works only here.
- **Open.** Needs every value in the definition's `mustBeSetBeforeOpening`,
  the real key (`AI_SURVEY_EMAIL_KEY`) and a database of its own. Opening
  clears pilot data first, and every pilot pass stops working.
- **Closed.** At the definition's `closesAt`, by itself, or earlier by hand.
  Nobody new can start; somebody under way has thirty minutes to save.

## The admin side

`/ai-survey/admin`. Not under `/admin`, and not gated by role: it answers to a
list of accounts on `aiSurveyState/main` (`adminUids`), because the survey
tells students that one person opens individual answers. **Nothing on the site
can add an account to that list.** It is changed by hand in the datastore.

It shows totals, the stage, what is missing before opening, the download and
the short links with their scans. It never shows anything about one person.

`/ai-survey/admin/totals`, behind the same list, has the count on each answer
of every question and line (`src/lib/aiSurvey/totals.ts`). Two rules decide
every number on it, and `tests/ai-survey-totals.test.mjs` holds both: a count
is out of the answer sets that saved the question's page, and a share on an
agree or support scale is out of the people who gave a view on that line, so
"Don't know" and blanks are left out of every share. It shows numbers only:
comments are read in the download. No floor is applied there; a floor belongs
on a page that is published.

The download is a POST, because each one is recorded before the file is handed
over. It is recorded in the survey's own record and not in `dataExports`: the
privacy policy names each kind of download kept there.

## The ceiling

The survey sends at most 600 codes an hour across everybody
(`CODE_CEILING_PER_HOUR`). Past that it tells people it is busy and sends
nothing, and it emails the accounts on its own list, at most once an hour
(`src/lib/aiSurvey/adminAlert.ts`). That email is ordinary mail to an account
that runs the survey, so it goes through `sendEmail` and leaves its row in the
send log. It is the survey's only logged email, it says a count, and it is
handed nothing of anybody who asked for a code.

For a room bigger than that, `codeCeiling` on `aiSurveyState/main` replaces
the 600. It is set by hand, like the list, and a restart of storage keeps it.

## The questions

Seven kinds, all data in the words file: one answer, tick all that apply, a
drop-down, lines answered on a scale, a ranking, a text box and a tick.

- **A scale** is named in `scales`. An answer marked `outsideScale` ("Don't
  know", "Not covered") is stored as itself and left out of every share.
- **A ranking** ("Rank your top three") offers the lines of a lines question
  on its own page, in the order just shown. It is stored as the lines in
  order, because the order is the answer, or as "None of these" alone.
- **A text box** takes 5,000 characters. One with `showIf` is shown, and
  stored, only while another question on its page holds one answer: the page
  empties it when that answer changes and the server refuses it otherwise.
- **Emphasis**: question text may mark a word `**like this**`. The page draws
  it bold; the totals and everything else read it plain (`plainText`).

## The start screen

Two ticks (a current student, 18 or over), a consent question, and a list of
where to find support that stays closed until it is opened. All of it works
before the page's script arrives. Start needs both ticks and "Yes"; "No"
turns the button into Finish, which leads to a closing screen. None of these
answers is sent anywhere.

## Coming back to the code step

Somebody on a phone types their University email, reaches the code box and
switches to their mail app to read the code, and the phone may reload the
survey's tab meanwhile. Where somebody is in the email check is held in the
page's memory alone, so while the code step is shown the page's address ends
`#code`, set without a new history entry. The fragment is that one word: never
the address, the code or anything about the person, and a fragment is never
sent to a server.

A page that loads with it, with no pass kept in the browser and the survey
taking new people, opens at the start screen as always, and its button has to
be pressed again in that page load, with both boxes ticked and the consent
answer given on that screen. Some browsers put back what was ticked before a
reload; the page never stores it. The button then opens the code step with the address box beside the code box, under "This page
reloaded, so type your University email again, then the code we sent you."
The server allows it: the browser's own value is given when the code is
checked, never when it is asked for, so a page that made its value after the
reload can use a code asked for before it. A kept pass always wins over the
fragment, and leaving the code step for any other step takes it off. It sits
beside the page's other fragment, `#in`, which marks the one reload after the
right code.

Two more ways to the code box, neither of which asks the server for anything
new: "Send my code" pressed again inside the minute leads there ("We sent you
a code less than a minute ago. Enter it below."), because a refusal inside the
minute leaves the code already sent working; and "I already have a code" on
the email step, with a University address typed. Which step the page opens at
and where each press leads are plain functions in `emailSteps.ts`, run by
`tests/ai-survey.test.mjs`; the server's side is in
`tests/ai-survey-flow.test.mjs`.

## Layout: no fieldset is a flex item

Safari on iOS 26 gives a fieldset that sits directly in a flex column the
height of its legend twice. With twelve lines on a page that left an empty
band some 770 pixels tall above Next. So every fieldset sits in a plain block
(`styles.block`), and the lines of a lines question are blocks spaced by a
margin. `tests/ai-survey-no-trace.test.mjs` holds it.

## The export

One row for each answer set, rows in a random order, no ids and no times.
A page never reached is `not_seen` in each of its columns, a skipped question
an empty cell, a multi-choice question one column an option holding 1 or 0,
and "Don't know" its own value, `dk`, never a sixth point of a scale. A
ranking is one column for each place (`M1_1`, `M1_2`, `M1_3`) holding that
place's line, with "None of these" alone in the first.
`tests/ai-survey.test.mjs` holds the 116 columns by name and in order.

## The job

`ai-survey-tidy`, on every tick, on by default because it emails nobody:
deletes codes that ran out (each only if it has not changed since it was
read, so a code somebody has just asked for again is left alone), rewrites
the shared documents together, and, a set number of days after the survey
closes, deletes the used-email list.
Destroying the key is done by a person: the site's own account cannot delete a
secret.

## Short links

Seven, in `src/lib/campaign/printedLinks.ts`, one for each place the survey is
handed out, all landing on `/ai-survey`. They differ so that scans can be
counted per place. The link somebody arrived by is never kept with their
answers, and the survey never reads it.

## What it inherits from the site

Every page loads the site's sign-in code and its notice banner, which talk to
Firebase. There is no analytics on the site. The one outside script the survey
loads is the bot check, on the email step and nowhere else: after the right
code the page keeps its pass and loads itself again, once, so the questions
are answered on a page that never loaded that script.

## When something fails

- **A save that does not land** keeps the page's answers and offers "Try
  again". The routes answer 503 with `failed` and never a bare error page.
- **A code check with no answer** is asked again by the page, up to three
  times, with the same code and the same value of its own.
- **Opening, or clearing pilot data, pressed twice** restarts storage once:
  the second press finds the generation already replaced and is refused.
- **A request body** is read up to a fixed size and dropped past it.
