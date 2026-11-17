# The AI at Nottingham survey

`/ai-survey`: "AI at Nottingham: what should students ask for?" An anonymous
survey of Nottingham students, about ten minutes, one answer per student, with
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
| A shared document's update time does not date a save | New people are spread over 2 documents, growing to 16 as the survey grows. While it is small every save rewrites the documents in use together; once busy they are rewritten together at most 20 seconds apart, and by the job when people stop | `tests/ai-survey-flow.test.mjs` |
| The used-email list is hashes and nothing else | HMAC-SHA-256 under a secret used for nothing else, as fields in 16 shared documents, with no time | both |
| "Already answered" is said only after the right code | Asking for a code never reads the list | `tests/ai-survey-flow.test.mjs` |
| The server keeps no session | The browser holds a signed pass, replaced on every save, good for 24 hours after the last one | `tests/ai-survey.test.mjs` |
| Nothing is read back | Coming back says which pages are saved, never an answer | `tests/ai-survey-no-trace.test.mjs` |
| The code email leaves no row in the send log | It goes through `sendUnloggedText` in `src/lib/email/send.ts`: plain text, no link, the suppression list and the audience still asked first | `tests/ai-survey-no-trace.test.mjs` |
| Nobody is asked who they are | The public routes read no session, cookie, header or IP address, and the page calls them with no credentials and no referrer | `tests/ai-survey-no-trace.test.mjs` |
| No limit by IP address | One code a minute and five a day for an address, and a ceiling an hour across the survey, kept in the datastore | `tests/public-write-gating.test.mjs` |

## Where things are

| | |
|---|---|
| The words | `src/content/aiSurvey/definition.ts`. Data, not code. Locked once the survey is open: a typo fix raises `version`, which is kept on each answer set |
| Reading the definition, the checks, the export | `src/lib/aiSurvey/{definition,answers,exportCsv,address}.ts`, all pure |
| Storage | `src/lib/aiSurvey/store.ts` |
| The email check | `src/lib/aiSurvey/emailCheck.ts` |
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
| `aiSurveyState` | `main`: the stage, the storage generation, the key that signs passes, the allowlist. `codes`: codes sent a minute, for two hours. `downloads`: who downloaded the answers, when, how many rows |
| `aiSurveyAnswers` | Answer sets, as fields inside shared documents named `{generation}-{number}` |
| `aiSurveyUsedEmails` | Keyed hashes of the addresses that have answered, in 16 shared documents |
| `aiSurveyCodes` | Pending codes: a hash of the code, when it runs out, wrong tries |
| `aiSurveyCodeLimits` | For a hashed address: today's count of codes and when the last was sent |

No index is needed: every read is by document id or a range on one field.

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

## The export

One row for each answer set, rows in a random order, no ids and no times.
A page never reached is `not_seen` in each of its columns, a skipped question
an empty cell, a multi-choice question one column an option holding 1 or 0,
and "Don't know" its own value, `dk`, never a sixth point of a scale.
`tests/ai-survey.test.mjs` holds the 87 columns by name and in order.

## The job

`ai-survey-tidy`, on every tick, on by default because it emails nobody:
deletes codes that ran out, rewrites the shared documents together, and, a
set number of days after the survey closes, deletes the used-email list.
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
loads is the bot check, on the email step and nowhere else.
