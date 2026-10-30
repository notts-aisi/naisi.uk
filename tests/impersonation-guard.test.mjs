/**
 * View-as write guard (run via `npm test`, Node's built-in test runner). Two
 * halves: a source scan over the guarded route trees, and, at the foot of the
 * file, live calls into `assertNotImpersonating()` itself through a transpiled
 * copy of the module with its request-only imports stubbed.
 *
 * Admin "view as" is a FULL impersonation: the `__session` cookie is swapped
 * for the target's, so `getCurrentUser()` returns the target and Firestore
 * records every write as the target performing it. For a debug tool that
 * exists to answer "what does this member see", that is fine on reads and
 * unacceptable on anything that decides, allocates, publishes, removes, marks
 * attendance, reviews work, sends email, changes status or destroys.
 *
 * So every mutating route under the trees below calls
 * `assertNotImpersonating()` before it does anything else. This test is what
 * keeps that true as the trees grow: a new route added to one of
 * those trees fails here until it either calls the guard or is added to
 * ALLOWLIST with a reason a reader can weigh.
 *
 * The route list is written out in full rather than derived, so the guard is
 * legible as a list of decisions and a deletion shows up as a diff.
 *
 * SCOPE, restated from `assertNotImpersonating()`: this covers mutating route
 * handlers in the listed trees, and `(app)/admin/layout.tsx` separately closes
 * the whole admin page tree during a view-as session because the course
 * editors there write client-direct, where no route guard can reach. A new
 * surface that writes client-direct needs its page tree closed the same way,
 * or its writes routed through a guarded handler. The marker is an httpOnly
 * cookie, which no page script can remove.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Route trees whose mutating handlers must all be guarded. A tree that does
 * not exist cannot be scanned, so a new tree of mutating routes is added here
 * in the change that creates it.
 */
const GUARDED_TREES = [
  "src/app/api/courses",
  "src/app/api/admissions",
  // The member-record tree. It holds one route today, the conduct flag, and a
  // single MUST_GUARD entry would cover that one route; the tree is registered
  // so the NEXT route added beside it (a note, a ban, a merge) is caught by
  // the sweep instead of relying on whoever adds it remembering this file.
  "src/app/api/admin/members",

  // Membership: periods, the CURRENT pointer and tier grants. A grant moves
  // the membership row, the `paidMembershipYears` cache every badge reads and
  // the period's totals in one write, all recorded as whoever the session says
  // is acting, so a view-as session must not reach any of it.
  "src/app/api/admin/membership",

  // Worksheets. EVERY write in this tree is recorded as the member: a
  // circulation sent under their name, a task minted on somebody else's board
  // in it, an answer submitted as their own word, an image filed in their
  // folder. A submitted response is frozen against its own author, so an
  // accident here is one only an admin can undo.
  "src/app/api/worksheets",

  // Surveys. Every write in this tree is recorded as the session's person: a
  // survey made or sent in an admin's name, an answer kept as somebody's own.
  "src/app/api/surveys",

  // The account / registration lane. These routes act on the SESSION account's
  // own persistent state: its Firebase Auth password, its registration-tracker
  // rows, its consent stamp, its very existence. During view-as the session is
  // the target's, so an unguarded write here happens TO the target member,
  // recorded as them. The two trees are registered so the NEXT
  // account-mutating route added beside them is caught by the sweep rather than
  // by whoever adds it remembering this file. The public, unauthenticated
  // routes in the register tree (the register POST and its resend) never read
  // or write the session account, so they are on ALLOWLIST with that reason.
  "src/app/api/register",
  "src/app/api/account",
];

/**
 * Every mutating route in those trees, with the reason it is high-trust.
 * Paths are repo-relative and use forward slashes.
 */
const MUST_GUARD = [
  ["src/app/api/courses/[courseId]/crest/route.ts", "sets the programme crest a course shows on every page that names it"],
  ["src/app/api/courses/[courseId]/destroy/route.ts", "destroys a course and everything under it"],
  ["src/app/api/courses/[courseId]/facilitator-guide/[slot]/route.ts", "loads a document into a course's facilitator guide, replacing what its facilitators read"],
  ["src/app/api/courses/[courseId]/page/route.ts", "rewrites the public marketing page a logged-out visitor reads"],
  ["src/app/api/courses/[courseId]/page/generate-themes/route.ts", "regenerates the public weekly themes and their provenance"],
  ["src/app/api/courses/[courseId]/publish/route.ts", "publishes a course to the public catalogue"],
  ["src/app/api/courses/[courseId]/routes/route.ts", "replaces a course's routes and deadlines, which every run of the course shows on the week that lists them"],
  ["src/app/api/courses/[courseId]/predictions/route.ts", "replaces a course's predictions card, which every run of the course asks in the two weeks it names"],
  ["src/app/api/courses/[courseId]/rubric/route.ts", "reads and saves a course's rubric, which every run of the course gives feedback on"],
  ["src/app/api/courses/[courseId]/templates/route.ts", "writes a reusable curriculum template"],
  ["src/app/api/courses/calendar/route.ts", "makes or replaces the caller's own calendar link, a secret kept in their name"],
  ["src/app/api/courses/exercise-responses/[responseId]/review/route.ts", "reviews a learner's submitted work and releases the comment"],
  ["src/app/api/courses/groups/[groupId]/attendance/route.ts", "marks a session register, and lets an admin correct a locked one"],
  ["src/app/api/courses/groups/[groupId]/attendance/push/route.ts", "locks a register, rewrites every member's attendance record and mails the group"],
  ["src/app/api/courses/groups/[groupId]/participant-notes/route.ts", "writes a private note about a named student"],
  ["src/app/api/courses/groups/[groupId]/email/route.ts", "sends email to a group"],
  ["src/app/api/courses/groups/[groupId]/facilitators/route.ts", "appoints and removes facilitators"],
  ["src/app/api/courses/groups/[groupId]/notice/route.ts", "publishes a notice to a whole group"],
  ["src/app/api/courses/groups/[groupId]/notes/route.ts", "writes a note a group's facilitators share, in the writer's name"],
  ["src/app/api/courses/groups/[groupId]/draw/route.ts", "gives a group's people their packs and cases from the draw, in the typist's name"],
  ["src/app/api/courses/groups/[groupId]/pairs/route.ts", "puts a group's people in pairs for a session and says who brings a laptop, in the typist's name"],
  ["src/app/api/courses/groups/[groupId]/shared-notes/route.ts", "adds a note shared with a group, in the writer's name"],
  ["src/app/api/courses/groups/[groupId]/ratings/route.ts", "rates a fellow at a programme's end, in the rater's name"],
  ["src/app/api/courses/groups/[groupId]/shared-notes/[noteId]/route.ts", "deletes a note shared with a group, for the person who wrote it"],
  ["src/app/api/courses/groups/[groupId]/pace/route.ts", "changes a group's pacing, moving every learner's dates"],
  ["src/app/api/courses/groups/[groupId]/session/route.ts", "changes a group's meeting details"],
  ["src/app/api/courses/groups/[groupId]/session/change/route.ts", "changes or cancels one week's session of a group, in the presser's name"],
  ["src/app/api/courses/groups/[groupId]/weeks/[weekId]/blocks/route.ts", "makes or replaces a group's own copy of a week from pasted Markdown, and can take out items its people have answered"],
  ["src/app/api/courses/groups/[groupId]/weeks/[weekId]/fork/route.ts", "forks a week's content for a group"],
  ["src/app/api/courses/groups/[groupId]/weeks/[weekId]/route.ts", "edits a group's week content"],
  ["src/app/api/courses/progress/[progressId]/moderate/route.ts", "moderates a learner's recorded progress"],
  ["src/app/api/courses/runs/[runId]/allocate/route.ts", "allocates applicants to groups"],
  ["src/app/api/courses/runs/[runId]/allocation/publish/route.ts", "publishes an allocation, which tells applicants their place"],
  ["src/app/api/courses/runs/[runId]/allocation/publish/notes/route.ts", "saves a note, or none, for somebody placed outside the times they gave, and asks Claude to draft one"],
  ["src/app/api/courses/runs/[runId]/allocation/publish/test/route.ts", "sends Publish's first emails to the presser as a test, and records the test Publish waits for"],
  ["src/app/api/courses/runs/[runId]/applications/[uid]/decide/route.ts", "accepts, waitlists or rejects an application"],
  ["src/app/api/courses/runs/[runId]/applications/[uid]/notes/route.ts", "writes reviewer notes on an applicant"],
  ["src/app/api/courses/runs/[runId]/apply/route.ts", "creates, edits and withdraws an application in the applicant's own name"],
  ["src/app/api/courses/runs/[runId]/apply-template/route.ts", "overwrites a run's curriculum from a template"],
  ["src/app/api/courses/runs/[runId]/archive/route.ts", "archives a run"],
  ["src/app/api/courses/runs/[runId]/clone-weeks/route.ts", "copies a whole week plan onto a run"],
  ["src/app/api/courses/runs/[runId]/destroy/route.ts", "destroys a run and every row under it"],
  ["src/app/api/courses/runs/[runId]/email/route.ts", "sends email to a cohort"],
  ["src/app/api/courses/runs/[runId]/enrol/route.ts", "takes, moves and gives up a seat on an open-enrolment run in the member's own name"],
  ["src/app/api/courses/runs/[runId]/enrolments/[uid]/remove/route.ts", "removes a learner from a run"],
  ["src/app/api/courses/runs/[runId]/enrolments/[uid]/reinstate/route.ts", "puts a member who left back on a run, taking a seat back off the group"],
  ["src/app/api/courses/runs/[runId]/enrol-mode/route.ts", "flips a run between admissions and open enrolment, which changes what the enrol route accepts"],
  ["src/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route.ts", "submits a learner's answer in their own name"],
  ["src/app/api/courses/runs/[runId]/guide/[doc]/route.ts", "replaces a programme's Start here or Glossary, which everybody on the run reads"],
  ["src/app/api/courses/runs/[runId]/packs-and-cases/[blockId]/route.ts", "picks a pack and marks a talk ready in the person's own name"],
  ["src/app/api/courses/runs/[runId]/reflections/[promptId]/route.ts", "saves a reflection in its writer's own name: a member's own box, or a group facilitator's own"],
  ["src/app/api/courses/runs/[runId]/fill-in-boxes/[boxId]/route.ts", "saves a fill-in box in its writer's own name: a member's own box, or a group facilitator's own"],
  ["src/app/api/courses/runs/[runId]/predictions/route.ts", "saves, seals and opens a person's own predictions card in their own name: a member's own, or a group facilitator's own"],
  ["src/app/api/courses/runs/[runId]/predictions/people/[uid]/route.ts", "an admin opens one person's predictions card, the opening recorded before the card is read"],
  ["src/app/api/courses/runs/[runId]/material-notes/route.ts", "records feedback attributed to the reader"],
  ["src/app/api/courses/runs/[runId]/normalise-weeks/route.ts", "rewrites every week id on a run"],
  ["src/app/api/courses/runs/[runId]/nudge/route.ts", "sends the weekly nudge email"],
  ["src/app/api/courses/runs/[runId]/pitching/picks/route.ts", "records which pitches a member would join, which their lead makes teams from"],
  ["src/app/api/courses/runs/[runId]/pitching/pitch/route.ts", "saves a pitch in the member's own name and chooses who pitches it with them"],
  ["src/app/api/courses/runs/[runId]/team/check-in/route.ts", "saves a team's check-in for the week, recorded as whoever the session says saved it"],
  ["src/app/api/courses/runs/[runId]/team/hand-in/route.ts", "hands in for a whole team, recorded as whoever the session says pressed it"],
  ["src/app/api/courses/runs/[runId]/team/links/route.ts", "adds a link to a team's page, recorded as whoever the session says added it"],
  ["src/app/api/courses/runs/[runId]/team/links/[linkId]/route.ts", "removes a link from a team's page, for everybody in the team"],
  ["src/app/api/courses/runs/[runId]/roles/route.ts", "grants and revokes staff roles on a run"],
  ["src/app/api/courses/runs/[runId]/status/route.ts", "moves a run along its lifecycle, opening or closing applications"],
  ["src/app/api/courses/runs/[runId]/updates/route.ts", "posts an update to a run's people and emails it, in the poster's name"],
  ["src/app/api/courses/runs/[runId]/weeks/[weekId]/blocks/route.ts", "replaces a week's blocks, and can take out items people have answered"],
  ["src/app/api/courses/runs/[runId]/weeks/[weekId]/ready/route.ts", "stores a week's Ready, which opens week 1 to everybody holding a place"],
  ["src/app/api/courses/runs/[runId]/weeks/[weekId]/owner/route.ts", "chooses who owns a week of a run on its programme's Weeks tab"],
  ["src/app/api/courses/runs/[runId]/weeks/[weekId]/mode/route.ts", "holds a whole week's sessions online, or puts them back in person, for every group of a run"],
  ["src/app/api/courses/runs/[runId]/week-one/ticks/[itemId]/route.ts", "ticks week 1 off in its caller's own name, for somebody holding a place before groups go out"],
  ["src/app/api/courses/runs/[runId]/written-answers/[answerId]/route.ts", "saves and sends a written answer in its writer's own name: a member's own, or a group facilitator's own"],
  ["src/app/api/courses/runs/[runId]/written-answers/[answerId]/review/route.ts", "opens, reopens and gives feedback on somebody's written answer, and emails them that it is waiting"],
  ["src/app/api/courses/runs/[runId]/sync-tasks/route.ts", "creates committee tasks on the board"],
  ["src/app/api/courses/templates/[templateId]/route.ts", "deletes a curriculum template"],
  // Admissions: the round authoring console. A round is the object an intake
  // hangs off, so every write here changes what applicants are asked, when the
  // window is, who reads their answers, or who decides.
  ["src/app/api/admissions/rounds/route.ts", "creates an admission round"],
  ["src/app/api/admissions/rounds/[roundId]/route.ts", "edits a round's dates, questions framework and criteria"],
  ["src/app/api/admissions/rounds/[roundId]/status/route.ts", "opens, closes, settles or cancels a round"],
  ["src/app/api/admissions/rounds/[roundId]/stages/[stageId]/route.ts", "writes and deletes the questions a stage asks"],
  ["src/app/api/admissions/rounds/[roundId]/stages/[stageId]/release/route.ts", "releases a stage's questions to applicants, which cannot be undone"],
  ["src/app/api/admissions/rounds/[roundId]/roles/route.ts", "appoints reviewers and the final decider, which grants access to applications"],
  ["src/app/api/admissions/rounds/[roundId]/reminders/send-now/route.ts", "emails every applicant holding a draft on the round, which cannot be recalled"],
  ["src/app/api/admissions/rounds/[roundId]/decide/route.ts", "decides somebody's application, writes them onto a run's facilitator list and emails them the answer"],
  ["src/app/api/admissions/forms/route.ts", "makes an application form, the thing a whole term applies to"],
  ["src/app/api/admissions/forms/[roundId]/route.ts", "changes a form's dates and order and adds a programme to it"],
  ["src/app/api/admissions/forms/[roundId]/sets/route.ts", "adds a question set to the form applicants answer"],
  ["src/app/api/admissions/forms/[roundId]/sets/[setId]/route.ts", "writes and deletes the questions applicants are asked"],
  ["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/route.ts", "changes what applicants are shown about a programme, the wording of its emails, and closes it"],
  ["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/roles/route.ts", "names a programme's lead and reviewers, which grants access to applications"],
  // Where a programme's accepted people go, and the press that puts them
  // there. Both are an admin's alone, and the second writes a row about each
  // person and a log line in the caller's name.
  ["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/run/route.ts", "names the course run a programme places its accepted people on"],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over/route.ts",
    "puts everybody who holds a place on a programme onto its course run's allocation list, and logs who pressed it",
  ],
  // Offering a place given back after decision day changes what a person
  // was told and emails them, in the caller's name; its test writes a record
  // on the form and emails the address on the session.
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places/route.ts",
    "offers freed places after decision day, which changes outcomes and emails the people offered one",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/freed-places/test/route.ts",
    "sends a test of the freed-place email to the address on the session, and records it on the form",
  ],
  // An incubator's teams, made and changed by its lead or an admin, and the
  // email that tells each person theirs: writes in the caller's name, and the
  // test emails the address on the session.
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/route.ts",
    "makes an incubator's teams and moves people between them, recorded as whoever the session says is acting",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/tell/route.ts",
    "emails everyone in an incubator's teams their team in the caller's name, which cannot be unsent",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/tell/test/route.ts",
    "sends a test of the team email to the address on the session, which during view-as is the member's, and records that it reached them",
  ],
  // An incubator's hand-in dates, set by its lead or an admin on the Teams tab.
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/hand-in/route.ts",
    "sets the day an incubator's hand-ins are due and the week of its showcase, which every team's page reads",
  ],
  // Certificates: their owner's switch, and the send that makes and emails
  // them, with its test.
  [
    "src/app/api/courses/certificates/[code]/route.ts",
    "turns a certificate's link on or off, which decides whether a member's name is public, as whoever the session says owns it",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/certificates/route.ts",
    "makes a programme's certificates and emails each person theirs in the caller's name, which cannot be unsent",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/certificates/test/route.ts",
    "sends a test of the certificate email to the address on the session, which during view-as is the member's, and records that it reached them",
  ],
  // Who finished: the run's rule, and the lead's decision about one person,
  // each recorded as whoever the session says is acting.
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/finishing/route.ts",
    "records whether one person finished a programme, stored with whoever the session says pressed the switch",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/finishing/rule/route.ts",
    "sets the rule that decides who finished a programme, which changes what its members are told once it is over",
  ],
  // Asking people to facilitate: an ask and a reminder email one person in
  // the caller's name, a test emails the session's own address and is
  // recorded on the run, the training is a setting of the run, and an answer
  // is the person's own and puts them on a group.
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/ask/route.ts",
    "asks one person to facilitate a group, which writes the ask and emails them in the caller's name",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/ask/test/route.ts",
    "sends a test of the ask's email to the address on the session, and records it on the run",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/case/draft/route.ts",
    "sends one person's application to Claude to draft the sentence that makes the case to them, in the caller's name",
  ],
  // Claude and Pangram on coursework (privacy v13): each sends somebody's
  // writing to an outside service and keeps what came back, in the caller's
  // name.
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/best-answers/route.ts",
    "sends a week's answers to Claude and keeps its pick of the strongest with the run, in the caller's name",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]/pangram/route.ts",
    "sends one person's answers to Pangram and keeps its readings with the run, in the caller's name",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/remind/route.ts",
    "reminds one person of their ask by email, in the caller's name, and counts the reminder",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/facilitators/training/route.ts",
    "sets the run's facilitators' training, which every later ask's email and page name",
  ],
  [
    "src/app/api/courses/facilitator-asks/[askId]/answer/route.ts",
    "records the person's own yes or no to an ask, and a yes puts them on a group as its facilitator",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/groups-go-out/route.ts",
    "sets the day groups go out on a programme's run, which every holder of a place is told on Home, week 1 and their application",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/route.ts",
    "adds a group to the run a programme names, from the Times view",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/room/route.ts",
    "sets the room a group meets in every week on the run a programme names, from the Groups tab",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/campus/route.ts",
    "sets a group's campus on the run a programme names, from the Groups tab's Sessions view",
  ],
  [
    "src/app/api/courses/runs/[runId]/time-answer/route.ts",
    "records the person's own answer to can you make this time on their own seat, which the programme's lead and admins read",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/time/route.ts",
    "changes a group's day and start on the run a programme names, from the Times view",
  ],
  // A programme's run as its lead reads and chases it. The attendance CSV
  // takes every register of the run off the platform and writes the
  // dataExports row that is the only record it happened; Remind emails a
  // group's facilitators in the caller's name.
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export/route.ts",
    "takes every register of a programme's run off the platform as a file of named people, and writes the dataExports row that is the only record it happened",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/registers/remind/route.ts",
    "emails a group's facilitators a reminder about an unfinished register in the caller's name, and claims the reminder job's own marker for each so that the job sends them none",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/when-free/remind/route.ts",
    "emails the people holding a place who have not said when they are free in the caller's name, and claims a marker for each for the day",
  ],
  // The application form's lifecycle. Opening a form lets real applicants
  // reach it, and settling writes every applicant's member record in the
  // caller's name. An admin viewing as somebody else must not do either.
  [
    "src/app/api/admissions/forms/[roundId]/status/route.ts",
    "opens, closes, reopens or settles an application form, and on settling writes each applicant's member record under the caller's name",
  ],
  // Admissions: the applicant's own lane. Every write here is recorded by
  // Firestore as the MEMBER performing it, and each one is a fact about their
  // intake: an application starting, an answer changing, a submission going in
  // or a withdrawal coming out. An admin viewing as somebody must not be able
  // to type into their application, submit it, or take it out of the queue.
  ["src/app/api/admissions/rounds/[roundId]/apply/route.ts", "starts, saves and withdraws an application in the applicant's own name"],
  ["src/app/api/admissions/rounds/[roundId]/apply/submit/route.ts", "submits an application, which puts somebody's work in a reviewer's queue"],
  ["src/app/api/admissions/rounds/[roundId]/apply/stage/[stageId]/route.ts", "submits one later-released stage of an application, which cannot be undone"],
  ["src/app/api/admissions/forms/[roundId]/application/route.ts", "saves the draft of an application in the applicant's own name, and creates the application on the first save"],
  ["src/app/api/admissions/forms/[roundId]/application/send/route.ts", "sends an application, which puts somebody's answers in front of each programme's lead and reviewers"],
  ["src/app/api/admissions/forms/[roundId]/application/access-requirements/route.ts", "reads and saves an applicant's own access-requirements answer; during a view-as session the session is the member's, so even the read would hand an admin that answer with nothing recording it"],
  ["src/app/api/admissions/forms/[roundId]/application/availability/route.ts", "changes the week a place painted, in its owner's own application, until groups go out"],
  ["src/app/api/admissions/forms/[roundId]/application/reply/route.ts", "records an applicant's reply to their offer or invitation in their own name, which can give their place back, and accepting an invitation approves their own account if it was still waiting"],
  // The application form's review screens. Every write here is recorded under
  // the caller's own name: a score, an internal comment, a programme's
  // decision. An admin viewing as a lead must not be able to make one.
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/applications/route.ts",
    "accepts or pools several applications at once, each logged as the caller's decision",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/applications/[uid]/review/route.ts",
    "writes scores and internal comments about an applicant on the caller's own review row",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/applications/[uid]/access-requirements/route.ts",
    "opens an applicant's access-requirements answer and logs the read under the caller's name",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/applications/[uid]/placement/route.ts",
    "places one person by writing their per-programme decisions as the admin",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/intake/fill/route.ts",
    "places everybody nobody has placed yet, writing their decisions as the admin",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/intake/route.ts",
    "sends the whole term's numbered people and their reads to Claude for a plan of who goes where",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/intake/clear/route.ts",
    "deletes every stored Claude read and Pangram check on the form",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/arrangement/route.ts",
    "sends a programme's numbered people and their reads to Claude for an arrangement into groups",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/assessments/route.ts",
    "sends Claude's reads of a programme's applications to Claude for a comparison or a question",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/applications/[uid]/assessment/route.ts",
    "sends an application and its reviews to Claude or Pangram and keeps what came back",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/applications/[uid]/decision/route.ts",
    "records a programme's decision on somebody's application, or revokes an acceptance, and logs it under the caller's name",
  ],
  [
    "src/app/api/admissions/forms/[roundId]/review-settings/route.ts",
    "switches what every reviewer on the form is shown on a first review",
  ],
  ["src/app/api/admissions/forms/[roundId]/pool/route.ts", "picks what a pooled applicant will hear on decision day, recorded under whoever the session says is acting"],
  ["src/app/api/admissions/forms/[roundId]/pool/note/route.ts", "saves the personal note in a pooled applicant's invitation as the session's own words, or asks Claude to draft one"],
  ["src/app/api/admissions/forms/[roundId]/send/route.ts", "publishes every applicant's outcome and emails them, which cannot be unsent"],
  ["src/app/api/admissions/forms/[roundId]/send/test/route.ts", "sends a decision-day email to the address on the session, which during view-as is the member's, and records on the form who tested and when"],
  ["src/app/api/admissions/forms/[roundId]/programmes/[programmeId]/test-email/route.ts", "sends one of a programme's decision emails to the address on the session, which during view-as is the member's"],
  // Outside the scanned trees above (it lives under /api/admin), so it is
  // named here or it is checked by nothing: it writes `config/courses`, whose
  // knobs reach every course surface at once.
  ["src/app/api/admin/courses-config/route.ts", "changes site-wide course settings"],
  // Also outside the scanned trees. It writes a conduct record about a named
  // member, which reviewers act on, and it is the only writer of a collection
  // no client can read back to check what happened.
  [
    "src/app/api/admin/members/[uid]/conduct-flag/route.ts",
    "sets and clears a member's conduct flag",
  ],
  // The notes admins keep about a person (privacy v13): a record about a
  // named member that only admins read, written as the caller, which no
  // client can read back to check what happened.
  ["src/app/api/admin/members/[uid]/notes/route.ts", "keeps a note about a person in the caller's name"],
  ["src/app/api/admin/members/[uid]/notes/[noteId]/route.ts", "changes or deletes a note about a person, as the caller"],
  [
    "src/app/api/admin/members/[uid]/notes/draft/route.ts",
    "sends a person's coursework to Claude to draft a note about them, in the caller's name",
  ],

  // Membership. Money and provenance: who paid, in which year, recorded by
  // whom. The grant route also owns `users.paidMembershipYears`, so a write
  // here changes a badge on somebody else's account.
  ["src/app/api/admin/membership/periods/route.ts", "creates the membership period every badge is about"],
  ["src/app/api/admin/membership/periods/[periodId]/route.ts", "edits a membership period's dates and internal note"],
  [
    "src/app/api/admin/membership/periods/[periodId]/recount/route.ts",
    "rewrites the cached headcount the whole console reports",
  ],
  ["src/app/api/admin/membership/current/route.ts", "moves the CURRENT period pointer, which re-badges the whole site"],
  ["src/app/api/admin/membership/grant/route.ts", "grants and revokes a member's tier, and writes the badge cache"],
  // The SU list. The import writes a batch of named people; the commit turns
  // that batch into memberships and badges on other people's accounts; the
  // export takes a list of named people off the platform and writes the
  // `dataExports` row that is the only record it happened. The list route is
  // a GET and is deliberately absent: reading what somebody sees is what
  // view-as is for.
  ["src/app/api/admin/membership/import/route.ts", "uploads and matches the SU membership list"],
  [
    "src/app/api/admin/membership/import/[batchId]/commit/route.ts",
    "writes a batch of memberships and badge-cache entries onto other people's accounts",
  ],
  [
    "src/app/api/admin/membership/import/[batchId]/abandon/route.ts",
    "closes an import, which is a judgement about a file recorded under a name",
  ],
  ["src/app/api/admin/membership/export/route.ts", "takes a list of named people off the platform"],

  // Worksheets. One entry per mutating handler in the tree above; the
  // recipients GET is deliberately absent, because reading the picker roster
  // is exactly the kind of thing view-as exists to reproduce.
  [
    "src/app/api/worksheets/circulations/route.ts",
    "sends a worksheet under the member's name, mints a task on every recipient's board and emails them",
  ],
  [
    "src/app/api/worksheets/circulations/[circulationId]/recipients/route.ts",
    "puts more people on a live circulation, each with a task and an email they cannot decline",
  ],
  [
    "src/app/api/worksheets/circulations/[circulationId]/submit/route.ts",
    "submits somebody's answers as their own word and freezes them against further edits",
  ],
  [
    "src/app/api/worksheets/circulations/[circulationId]/upload/route.ts",
    "files an image in a member's own answer folder, where their name is the only attribution",
  ],
  [
    "src/app/api/worksheets/circulations/[circulationId]/responses/[uid]/return/route.ts",
    "puts a judgement about somebody's work in front of them under the reviewer's name",
  ],
  [
    "src/app/api/worksheets/circulations/[circulationId]/responses/[uid]/unfreeze/route.ts",
    "takes back somebody's submission and clears the feedback they were sent",
  ],
  [
    "src/app/api/worksheets/circulations/[circulationId]/notify-copy-edited/route.ts",
    "emails every recipient who is part-way through, in the name of whoever pressed it",
  ],
  [
    "src/app/api/worksheets/circulations/[circulationId]/export/route.ts",
    "takes what named people wrote off the platform, and writes the dataExports row that is the only record it happened",
  ],
  [
    "src/app/api/worksheets/circulations/[circulationId]/close/route.ts",
    "stops a circulation taking any more answers and archives a task on every recipient's board",
  ],
  [
    "src/app/api/worksheets/[worksheetId]/route.ts",
    "deletes somebody's library worksheet and the question images that go with it",
  ],
  [
    "src/app/api/worksheets/circulations/[circulationId]/destroy/route.ts",
    "destroys a circulation: every recipient's answers, the uploads they made, the reviews written about them and the card on each of their boards",
  ],
  // The aggregate GET is deliberately absent, like the recipients GET above
  // it: it writes nothing, and reading what a member sees is what view-as is
  // for. The destroy-manifest GET beside the destroy is absent for the same
  // reason: it counts what a destroy would remove and changes nothing, and it
  // refuses anybody who is not an admin, which an admin viewing as a member is
  // not.

  // Surveys. Every handler in the tree writes, so every one is here; the
  // pages that read a survey are server pages, not routes.
  ["src/app/api/surveys/route.ts", "makes a programme's survey in the admin's name"],
  ["src/app/api/surveys/[surveyId]/questions/route.ts", "changes a survey's words and questions before it is sent"],
  ["src/app/api/surveys/[surveyId]/test/route.ts", "sends the presser a test and records the test the send waits for"],
  ["src/app/api/surveys/[surveyId]/send/route.ts", "emails a survey to everybody holding a place, in the presser's name"],
  ["src/app/api/surveys/[surveyId]/remind/route.ts", "emails a reminder to everybody who has not answered, in the presser's name"],
  ["src/app/api/surveys/[surveyId]/close/route.ts", "closes a survey to every further answer"],
  ["src/app/api/surveys/[surveyId]/open-at-event/route.ts", "opens a survey after an event for its QR code, fixing its words, in the admin's name"],
  ["src/app/api/surveys/[surveyId]/open/route.ts", "opens a leaving survey, fixing its words, in the admin's name"],
  ["src/app/api/surveys/[surveyId]/export/route.ts", "hands over everybody's answers with names, recorded as the presser's download"],
  ["src/app/api/surveys/[surveyId]/people/[who]/route.ts", "opens one person's answers, the opening recorded in the opener's name before anything of them is read"],
  ["src/app/api/surveys/[surveyId]/answer/route.ts", "keeps the session's person's answers, once, as their own"],
  ["src/app/api/surveys/answer/route.ts", "keeps a person's answers, once, through their link"],
  ["src/app/api/surveys/[surveyId]/consent/route.ts", "changes the session's person's own follow-ups consent"],
  ["src/app/api/surveys/consent/route.ts", "changes a person's own follow-ups consent through their link"],
  ["src/app/api/surveys/public-numbers/route.ts", "publishes a programme's numbers and ticked quotes on its public page, in the admin's name"],
  ["src/app/api/surveys/public-numbers/take-down/route.ts", "takes a programme's public numbers off its public page"],

  // ── The admission ROUND lane of the deletion work ────────────────────────
  // Destroying a round is the single most consequential write in the
  // admissions tree, and it is one an admin can only make under their own
  // name. The manifest route beside it is a GET and is deliberately absent
  // from this list: it reads live counts and writes nothing, and reading what
  // an action would do is exactly what view-as exists for.
  [
    "src/app/api/admissions/rounds/[roundId]/destroy/route.ts",
    "destroys an intake: every application on it, the access-requirements answer filed beside each one, the reviewers' written assessments, and the round itself",
  ],

  // ── The account / registration lane ──────────────────────────────────────
  [
    "src/app/api/register/password-set/route.ts",
    "sets a Firebase Auth password on the session account, which during view-as is the target member's account",
  ],
  [
    "src/app/api/register/profile-complete/route.ts",
    "flips the session account's registration-tracker row, which during view-as writes the target member's tracker as them",
  ],
  [
    "src/app/api/account/delete/route.ts",
    "tears down the session account; the unfinished-only scope blocks the reachable view-as case, but the guard states the intent beside its sibling",
  ],
  [
    "src/app/api/account/kairos/route.ts",
    "changes the session account's own Kairos choice, whether its name and programme record go to Kairos, which during view-as would be the target member's word",
  ],
  [
    "src/app/api/account/reconsent/route.ts",
    "stamps the session account's consent record (an audit fact whose whole value is that the member made it) or deletes the account",
  ],
  // ── The events lane: check-in ────────────────────────────────────────────
  ["src/app/api/events/[id]/check-in/route.ts", "checks a person in, in their name"],
  ["src/app/api/events/[id]/check-ins/route.ts", "checks people in and adds walk-ins at the door"],
  ["src/app/api/events/[id]/check-ins/[checkInId]/route.ts", "undoes a check-in at the door"],
  ["src/app/api/events/[id]/door-code/route.ts", "makes an event's permanent door code"],
];

/**
 * Deliberate exemptions. Each entry is a path plus the reason a mutating route
 * may run while an admin is viewing as someone else. The bar is high: the
 * write must be invisible in the audit trail (no attribution to reason about),
 * reversible by the member themselves, and pointless to perform on someone
 * else's behalf. Nothing under the course tree meets it today, which is why
 * this list is empty. Adding an entry is a decision, not a workaround for a
 * failing test.
 */
const ALLOWLIST = [
  [
    "src/app/api/register/route.ts",
    "Public, unauthenticated registration. It creates a Firebase Auth account for the email in the request body and never reads or writes the session user, so a view-as session cannot make it act as the impersonated member; the account it creates is a fresh one keyed on the body address.",
  ],
  [
    "src/app/api/register/resend/route.ts",
    "Public, unauthenticated resend keyed on the body email. It only ever re-sends to a pending registration for that address and never reads or writes the session user, so a view-as session cannot turn it against the impersonated member.",
  ],
];

const METHODS = "POST|PATCH|PUT|DELETE";

/**
 * Every shape Next accepts for a route handler export, because a scan that
 * only knows one of them is a scan a refactor walks straight through.
 *
 *  1. `export async function POST(` / `export function POST(`
 *  2. `export const POST = ` / `export const POST: RouteHandler = ` (the arrow
 *     and the typed-const forms)
 *  3. `export { handlePost as POST }` (a re-export; the body is elsewhere in
 *     the file, so the guard window is measured from the DECLARATION, resolved
 *     below, not from the export statement)
 *
 * Each returns the offset the guard window starts at, so the check is "this
 * handler calls the guard near its top", not "the file mentions the guard as
 * many times as it has handlers", which a file with one guarded handler and
 * one unguarded one could satisfy twice over.
 */
const DECLARED_HANDLER = new RegExp(
  `export\\s+(?:async\\s+)?function\\s+(${METHODS})\\s*\\(`,
  "g",
);
const CONST_HANDLER = new RegExp(`export\\s+const\\s+(${METHODS})\\s*[:=]`, "g");
const ALIASED_EXPORT = /export\s*\{([^}]*)\}/g;
const GUARD_CALL = /assertNotImpersonating\(\)/g;

/** Lines after a handler's opening within which the guard must appear. Wide
 *  enough for a multi-line signature and a RouteContext type, far too narrow
 *  for the guard to be sitting in some other handler further down. */
const GUARD_WINDOW_LINES = 12;

/** Where the local declaration of `name` starts, or -1. Used only to resolve
 *  the `export { x as POST }` form back to the function it re-exports. */
function declarationIndex(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const decl = new RegExp(
    `(?:async\\s+)?function\\s+${escaped}\\s*\\(|(?:const|let|var)\\s+${escaped}\\s*[:=]`,
  );
  return source.search(decl);
}

/**
 * Every mutating handler a route file exports: `{ method, at }`, where `at` is
 * the offset the guard window is measured from.
 */
function mutatingHandlers(source) {
  const found = [];
  for (const pattern of [DECLARED_HANDLER, CONST_HANDLER]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      found.push({ method: match[1], at: match.index });
    }
  }
  ALIASED_EXPORT.lastIndex = 0;
  for (const match of source.matchAll(ALIASED_EXPORT)) {
    for (const clause of match[1].split(",")) {
      const alias = /^\s*([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)\s*$/.exec(clause);
      if (!alias) continue;
      const [, local, exported] = alias;
      if (!new RegExp(`^(?:${METHODS})$`).test(exported)) continue;
      const at = declarationIndex(source, local);
      found.push({ method: exported, at: at === -1 ? match.index : at });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/** Does the guard appear inside this handler's window? */
function guardedAt(source, at) {
  const lines = source.slice(at).split("\n").slice(0, GUARD_WINDOW_LINES).join("\n");
  GUARD_CALL.lastIndex = 0;
  return GUARD_CALL.test(lines);
}

function routeFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(path));
    else if (entry.name === "route.ts") out.push(path);
  }
  return out;
}

function repoRelative(absolute) {
  return relative(REPO_ROOT, absolute).split(sep).join("/");
}

test("every listed high-trust course route calls assertNotImpersonating()", () => {
  for (const [path, why] of MUST_GUARD) {
    const absolute = join(REPO_ROOT, ...path.split("/"));
    assert.ok(
      existsSync(absolute),
      `${path} is on the view-as guard list but does not exist. If the route ` +
        "moved, move its entry too; if it was deleted, delete the entry.",
    );
    const source = readFileSync(absolute, "utf8");
    const handlers = mutatingHandlers(source);
    assert.ok(
      handlers.length > 0,
      `${path} is on the view-as guard list but exports no POST/PATCH/PUT/DELETE. ` +
        "Drop the entry if the route no longer mutates anything.",
    );
    for (const { method, at } of handlers) {
      assert.ok(
        guardedAt(source, at),
        `${path} (${why}) exports ${method} without calling ` +
          `assertNotImpersonating() in its first ${GUARD_WINDOW_LINES} lines. ` +
          "Every mutating handler must refuse during a view-as session, at the " +
          "TOP and before any other work, because Firestore would record the " +
          "write as the member, not as the admin who made it.",
      );
    }
    assert.match(
      source,
      /from "@\/lib\/firebase\/impersonation"/,
      `${path} must import assertNotImpersonating from @/lib/firebase/impersonation.`,
    );
  }
});

test("no mutating course route escapes the view-as guard", () => {
  const listed = new Set(MUST_GUARD.map(([path]) => path));
  const exempt = new Set(ALLOWLIST.map(([path]) => path));
  for (const tree of GUARDED_TREES) {
    const dir = join(REPO_ROOT, ...tree.split("/"));
    assert.ok(
      existsSync(dir),
      `${tree} is on the guarded-tree list but does not exist. Update the list.`,
    );
    const files = routeFiles(dir);
    assert.ok(files.length > 0, `no route.ts files found under ${tree}.`);
    for (const file of files) {
      const path = repoRelative(file);
      const source = readFileSync(file, "utf8");
      if (mutatingHandlers(source).length === 0) continue;
      assert.ok(
        listed.has(path) || exempt.has(path),
        `${path} exports a mutating handler but is on neither the view-as ` +
          "guard list nor the allowlist in tests/impersonation-guard.test.mjs. " +
          "Call assertNotImpersonating() at the top of each handler and add " +
          "the route to MUST_GUARD, or add it to ALLOWLIST with the reason it " +
          "is safe to run while an admin is viewing as someone else.",
      );
    }
  }
});

test("the scan catches handler forms nobody has written in this tree yet", (t) => {
  // A scratch route tree, written and removed here rather than committed: the
  // point is to prove the SCANNER catches an unguarded arrow-form handler, and
  // a fixture living under src/ would either be a real route or a file the
  // sweep above has to be taught to skip. Every course route today uses
  // `export async function`, so without this the arrow-form and aliased-export
  // patterns would be untested code claiming to be a guard.
  const dir = mkdtempSync(join(tmpdir(), "view-as-guard-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const unguarded = join(dir, "route.ts");
  writeFileSync(
    unguarded,
    [
      'import { NextResponse } from "next/server";',
      "",
      "export const POST = async () => {",
      "  return NextResponse.json({ ok: true });",
      "};",
      "",
      "const handleDelete = async () => NextResponse.json({ ok: true });",
      "export { handleDelete as DELETE };",
      "",
    ].join("\n"),
  );
  const source = readFileSync(unguarded, "utf8");
  const handlers = mutatingHandlers(source);
  assert.deepEqual(
    handlers.map((h) => h.method).sort(),
    ["DELETE", "POST"],
    "the arrow-const and aliased-export handler forms must both be detected: " +
      "a route written either way is exactly as capable of writing as the " +
      "member as `export async function POST` is.",
  );
  for (const { method, at } of handlers) {
    assert.equal(
      guardedAt(source, at),
      false,
      `${method} in the fixture calls no guard, so the scan must report it unguarded.`,
    );
  }

  // And the same forms WITH the guard pass, so the check is not just "arrow
  // handlers always fail".
  const guarded = [
    'import { assertNotImpersonating } from "@/lib/firebase/impersonation";',
    "",
    "export const PATCH = async () => {",
    "  const blocked = await assertNotImpersonating();",
    "  if (blocked) return blocked;",
    "  return new Response(null, { status: 204 });",
    "};",
    "",
  ].join("\n");
  const [patch] = mutatingHandlers(guarded);
  assert.equal(patch.method, "PATCH");
  assert.equal(guardedAt(guarded, patch.at), true);

  // A guard call far below the handler is NOT that handler's guard.
  const distant = [
    "export const PUT = async () => {",
    ...Array.from({ length: GUARD_WINDOW_LINES + 4 }, () => "  // filler"),
    "  const blocked = await assertNotImpersonating();",
    "  if (blocked) return blocked;",
    "};",
    "",
  ].join("\n");
  const [put] = mutatingHandlers(distant);
  assert.equal(
    guardedAt(distant, put.at),
    false,
    "the guard has to run BEFORE the handler's other work; a call buried " +
      "further down may sit behind a branch that already wrote something.",
  );
});

test("every allowlisted route still exists and carries a reason", () => {
  for (const entry of ALLOWLIST) {
    assert.equal(
      entry.length,
      2,
      "each ALLOWLIST entry is [path, reason]; an exemption without a stated " +
        "reason is not reviewable.",
    );
    const [path, reason] = entry;
    assert.ok(
      existsSync(join(REPO_ROOT, ...path.split("/"))),
      `${path} is allowlisted but does not exist. Remove the stale entry.`,
    );
    assert.ok(
      typeof reason === "string" && reason.trim().length > 20,
      `${path} needs a real reason, not a placeholder.`,
    );
  }
});

/**
 * A separate view-as hazard from the write guard above: a route that REVOKES
 * refresh tokens (`revokeAndClearSession`, which calls
 * auth.revokeRefreshTokens(uid)) must not do so blindly during a view-as
 * session, because the `__session` cookie holds the TARGET's session — the
 * revoke would sign the real member out of every device they own, from the
 * admin's browser. `assertNotImpersonating()` is the wrong tool here (a 403
 * would strand the admin mid-view-as); the route must instead branch on a LIVE
 * marker and clear the borrowed cookie without revoking, the way the exit and
 * `clear` routes do. So every caller of `revokeAndClearSession` must also
 * consult the impersonation marker. Both directions.
 */
const REVOKE_CALLERS = {
  "src/app/api/auth/session/route.ts":
    "DELETE is the sign-out route; during a live view-as it clears the borrowed cookie without revoking the target, and only revokes outside view-as",
};
const MARKER_READERS = /getLiveImpersonator\(|getImpersonator\(|markerIsLive\(/;

test("every route that revokes refresh tokens consults the view-as marker first", () => {
  const callers = [];
  for (const file of routeFiles(join(REPO_ROOT, "src", "app", "api"))) {
    const source = codeOf(file);
    if (/\brevokeAndClearSession\(/.test(source)) callers.push(repoRelative(file));
  }
  const unregistered = callers.filter((p) => !(p in REVOKE_CALLERS));
  assert.deepEqual(
    unregistered,
    [],
    "These routes call revokeAndClearSession(). During a view-as session that " +
      "revokes the impersonated member's tokens on every device. Branch on a live " +
      "marker (clear the cookie without revoking, like the exit route), and " +
      "register the route in REVOKE_CALLERS with the reason.",
  );
  const stale = Object.keys(REVOKE_CALLERS).filter((p) => !callers.includes(p));
  assert.deepEqual(stale, [], "These registered revoke callers no longer call it: remove them.");
  for (const [path, reason] of Object.entries(REVOKE_CALLERS)) {
    const source = codeOf(join(REPO_ROOT, ...path.split("/")));
    assert.match(
      source,
      MARKER_READERS,
      `${path} revokes refresh tokens but never reads the view-as marker, so a ` +
        "sign-out during impersonation would revoke the target member everywhere.",
    );
    assert.ok(reason.trim().length > 20, `${path} needs a real reason in REVOKE_CALLERS.`);
  }
});

/** codeOf for this suite: strip comments so a mention in prose is not a call. */
function codeOf(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("the admin view-as start and exit routes are not self-blocked", () => {
  // Starting a view-as session is an admin acting as themselves, and exiting
  // one is the way OUT of the state this guard refuses in. Guarding either
  // would be a lockout: exit in particular would become unreachable the moment
  // the marker is set.
  for (const path of [
    "src/app/api/admin/impersonate/route.ts",
    "src/app/api/admin/impersonate/exit/route.ts",
  ]) {
    const source = readFileSync(join(REPO_ROOT, ...path.split("/")), "utf8");
    assert.ok(
      !GUARD_CALL.test(source),
      `${path} must not call assertNotImpersonating(): the start route runs ` +
        "before any marker exists and the exit route is the only way to clear one.",
    );
    GUARD_CALL.lastIndex = 0;
  }
});

test("assertNotImpersonating refuses with a 403 and honest copy", () => {
  const source = readFileSync(
    join(REPO_ROOT, "src", "lib", "firebase", "impersonation.ts"),
    "utf8",
  );
  assert.match(
    source,
    /export async function assertNotImpersonating\(/,
    "assertNotImpersonating() lives in src/lib/firebase/impersonation.ts, " +
      "beside the marker it reads.",
  );
  assert.match(source, /getImpersonator\(\)/, "it must read the existing marker.");
  assert.match(source, /status: 403/, "a blocked write answers 403.");
  assert.match(
    source,
    /viewing as another member/,
    "the copy must say what happened, not just Forbidden.",
  );
});

// ---------------------------------------------------------------------------
// Live behaviour: what assertNotImpersonating() actually answers
//
// Everything above reads source. These load the module and call it, because
// the stale-marker rule below is a decision no amount of grepping can pin: a
// marker whose actorUid is the CURRENT session's uid means the admin is signed
// in as themselves again (a half-failed start, or a sign-in that never went
// through the exit route). `(app)/layout.tsx` has always suppressed the banner
// on it and POST /api/admin/impersonate self-heals it, so treating it as a
// live session here would have locked an admin out of every high-trust course
// route until they thought to clear a cookie they cannot see.
//
// The module is TypeScript and imports next/headers, next/server and the
// session module, none of which run outside a request, so it is transpiled in
// memory with the `typescript` devDependency (the dance tests/course-window
// .test.mjs explains at length) and those four specifiers are rewritten to
// stubs driven by `harness` below.
// ---------------------------------------------------------------------------

const harness = { cookie: null, user: null, deleted: false };
globalThis.__viewAsGuardHarness = harness;

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "next/headers",
    `const h = globalThis.__viewAsGuardHarness;
     export async function cookies() {
       return {
         get: (name) => (h.cookie === null ? undefined : { name, value: h.cookie }),
         set: (name, value) => { h.cookie = value; },
         delete: () => { h.cookie = null; h.deleted = true; },
       };
     }`,
  ],
  [
    "next/server",
    `export const NextResponse = {
       json: (body, init) => ({ body, status: init?.status ?? 200 }),
     };`,
  ],
  [
    "./session",
    `export async function getCurrentUser() {
       return globalThis.__viewAsGuardHarness.user;
     }`,
  ],
]);

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"']+)\2/g;

function dataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

async function loadImpersonationModule() {
  let tsc;
  try {
    tsc = (await import("typescript")).default;
  } catch (err) {
    throw new Error(
      "the `typescript` devDependency is not installed. Run `npm install`.",
      { cause: err },
    );
  }
  const file = join(REPO_ROOT, "src", "lib", "firebase", "impersonation.ts");
  const { outputText } = tsc.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      target: tsc.ScriptTarget.ES2022,
      module: tsc.ModuleKind.ESNext,
    },
  });
  const rewritten = outputText.replace(
    SPECIFIER,
    (whole, prefix, quote, specifier) => {
      if (!STUBS.has(specifier)) {
        throw new Error(
          `impersonation.ts imports "${specifier}", which this harness has no ` +
            "stub for. Add one, or the guard's behaviour goes untested.",
        );
      }
      return `${prefix}${quote}${dataUrl(STUBS.get(specifier))}${quote}`;
    },
  );
  return import(dataUrl(rewritten));
}

const { assertNotImpersonating, markerIsLive, IMPERSONATION_BLOCKED_MESSAGE } =
  await loadImpersonationModule();

function setState({ marker, uid }) {
  harness.cookie = marker === null ? null : JSON.stringify(marker);
  harness.user = uid === null ? null : { uid, role: "member" };
  harness.deleted = false;
}

const ADMIN_UID = "admin-uid";
const TARGET_UID = "member-uid";
const LIVE_MARKER = {
  actorUid: ADMIN_UID,
  actorName: "An Admin",
  actorEmail: "admin@example.com",
  auditId: "audit-1",
};

test("no marker means no view-as session, so the write proceeds", async () => {
  setState({ marker: null, uid: TARGET_UID });
  assert.equal(await assertNotImpersonating(), null);
});

test("a live marker refuses with 403 and the honest copy", async () => {
  setState({ marker: LIVE_MARKER, uid: TARGET_UID });
  const blocked = await assertNotImpersonating();
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, IMPERSONATION_BLOCKED_MESSAGE);
  assert.equal(
    harness.deleted,
    false,
    "a live marker must survive the guard: the session is still borrowed and " +
      "the banner and the exit route both depend on it.",
  );
});

test("a same-uid marker is stale, not a session: the write proceeds and the cookie is cleared", async () => {
  // The admin is signed in as THEMSELVES with a leftover marker. Refusing here
  // would leave them unable to publish a course, allocate a cohort or send a
  // nudge, with nothing on screen explaining why: the banner is already
  // suppressed in exactly this case.
  setState({ marker: LIVE_MARKER, uid: ADMIN_UID });
  assert.equal(await assertNotImpersonating(), null);
  assert.equal(
    harness.deleted,
    true,
    "the stale marker must be cleared, the same self-heal " +
      "POST /api/admin/impersonate does, so the next request is not asked again.",
  );
});

test("a marker with no session at all still refuses", async () => {
  // No session means nothing can prove the marker stale, and the route is
  // about to 401 anyway. Refusing is the safe reading.
  setState({ marker: LIVE_MARKER, uid: null });
  const blocked = await assertNotImpersonating();
  assert.equal(blocked.status, 403);
});

test("markerIsLive is the one comparison the banner, the gate and the guard share", () => {
  assert.equal(markerIsLive(null, TARGET_UID), false);
  assert.equal(markerIsLive(LIVE_MARKER, TARGET_UID), true);
  assert.equal(markerIsLive(LIVE_MARKER, ADMIN_UID), false);
  assert.equal(markerIsLive(LIVE_MARKER, null), true);
});

test("the admin page tree is closed while a view-as session is live", () => {
  // The course editors under /admin/courses write to Firestore client-direct
  // (courseMutations.ts), so no route handler exists for assertNotImpersonating
  // to sit in. The layout closing the tree is what covers them, and now that a
  // draftCourse holder can reach that tree, an admin viewing as one would
  // otherwise land on the authoring surfaces.
  const layout = readFileSync(
    join(REPO_ROOT, "src", "app", "(app)", "admin", "layout.tsx"),
    "utf8",
  );
  assert.match(
    layout,
    /markerIsLive\(/,
    "(app)/admin/layout.tsx must consult the impersonation marker: the course " +
      "editors below it write client-direct, where the route guard cannot reach.",
  );
  assert.match(
    layout,
    /getImpersonator\(/,
    "(app)/admin/layout.tsx must read the marker it tests.",
  );
});
