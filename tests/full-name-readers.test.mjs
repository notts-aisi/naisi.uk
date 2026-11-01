/**
 * EVERY FILE THAT NAMES A FULL NAME, AND THE GATE IN FRONT OF ITS READER.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The sentence this holds
 *
 * The privacy policy says: "We may also ask for your full name as well as
 * the name you go by. Only the committee sees your full name; everyone else
 * sees the name you go by." The committee is the committee role and admins,
 * SU-recognised or not; a member who facilitates a group is not on it. The
 * rule is one function, `nameForViewer` in `src/lib/names/staffName.ts`, run
 * as every kind of viewer in `tests/names-rule.test.mjs`. This file holds
 * the other half: every place the full name is read, written or drawn, so a
 * new reader cannot show it to somebody else without somebody deciding.
 *
 * ## What counts as naming a full name
 *
 * A file's code (comments gone, strings kept) names a full name when it:
 *
 *  - names the field, `fullName`, or Home's stamp beside it,
 *    `fullNameAskedAt`, as a property, a key or a string, whatever it is a
 *    property of; or
 *  - uses what the names module hands out that holds a full name: the
 *    `StaffName` type, the `StaffNameText` component that draws one, or a
 *    call of one of the functions that read or return one
 *    (`PRODUCERS` below).
 *
 * That catches other things called `fullName` as well: a collaborator's own
 * name, an email's `{fullName}` token, a local variable. Each is listed as
 * `other`, with what it is, and held to reading no account's full name.
 * Listing them is the price of a walk nobody can step round by spelling the
 * field differently.
 *
 * ## What each entry says
 *
 *  - `rule`: the names module, which decides who sees what, the component
 *    that draws a name it was handed, and a loader that names everybody
 *    through `nameForViewer` or `staffNamesFor` with its own session's
 *    viewer (`proof` is the call).
 *  - `shape`: declares the field or carries it in a typed shape, and shows
 *    nobody anything.
 *  - `own`: the person's own full name, to the person: joining, Home's
 *    question, Profile, their own application.
 *  - `committee`: shown to the committee and admins, and nobody else. `proof`
 *    is the gate, as text the file must contain; a component is proved by
 *    the files that import it (`mountedBy`, every one of them), each of which
 *    must itself be behind the gate.
 *  - `scrub`: reads every name an account holds, the full name among them,
 *    only to take each out of words before they leave the site for an
 *    outside service. It shows nobody anything: server code, with `proof`
 *    saying where the names are read and where they go.
 *  - `viewer`: drawn for whoever its page admits, with names a route made
 *    for the person looking by the rule: the committee and admins are sent
 *    the full name, anybody else the name people go by. `proof` is where its
 *    names come from, and it reads no account's name itself.
 *  - `other`: a different thing that is also called `fullName`. It may not
 *    read an account's full name.
 *
 * Both directions: a file that names a full name and is not listed fails, and
 * so does an entry whose file no longer does. Every entry carries a reason.
 *
 * The other half of a scrub is the last section: every file that takes names
 * out of words before they leave, and where its names come from, so a scrub
 * that does not know the full name is found as well as a screen that shows
 * it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveImport, walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const repoPath = (file) => relative(REPO_ROOT, file).split(sep).join("/");
const codeOf = (path) => stripSource(readFileSync(join(REPO_ROOT, path), "utf8"), { keepStrings: true });

/**
 * The functions that read a full name off an account, or return a string or
 * a `StaffName` with one in it. A call of any of them names a full name.
 */
const PRODUCERS = [
  "accountNamesOf",
  "staffNameOf",
  "staffNamesFor",
  "nameForViewer",
  "applicantName",
  "accountStaffName",
  "accountStaffWords",
  "namesToScrubOf",
];

const NAMES_A_FULL_NAME = new RegExp(
  `\\bfullName(?:AskedAt)?\\b|\\bStaffName(?:Text)?\\b|\\b(?:${PRODUCERS.join("|")})\\s*\\(`,
);

/**
 * An account's full name read off its document, or a call of a producer the
 * file did not write itself: what an `other` entry may never do.
 */
function readsAnAccountsFullName(code) {
  const ownFunctions = PRODUCERS.filter((name) => new RegExp(`\\bfunction\\s+${name}\\s*\\(|\\bconst\\s+${name}\\s*=`).test(code));
  const borrowed = PRODUCERS.filter((name) => !ownFunctions.includes(name));
  const field = /profile\??\.fullName|["'`]profile\.fullName["'`]|\[\s*["'`]profile["'`]\s*,\s*["'`]fullName["'`]\s*\]/;
  return field.test(code) || (borrowed.length > 0 && new RegExp(`\\b(?:${borrowed.join("|")})\\s*\\(`).test(code));
}

/** The admin area's admin-only tree: its layout lets an admin in and nobody else. */
const ADMIN_ONLY_TREE = "src/app/(app)/admin/(admin-only)/";

const READERS = new Map([
  // --- The rule ------------------------------------------------------------
  ["src/lib/names/staffName.ts", {
    who: "rule",
    why: "the rule itself: who sees a full name (`seesFullNames`), the parts a staff screen draws, and the name everybody else sees",
  }],
  ["src/lib/names/load.ts", {
    who: "rule",
    proof: ["if (!seesFullNames(viewer)) {"],
    why: "a staff screen's names, read for the viewer it is handed: anybody outside the committee is given the name people go by and nothing else",
  }],
  ["src/components/StaffNameText.tsx", {
    who: "rule",
    mountedBy: [
      "src/features/admin/MembersTable.tsx",
      "src/features/admin/MemberItem.tsx",
      "src/features/events/AttendeeDashboard.tsx",
      "src/features/events/SignupRequests.tsx",
      "src/features/events/checkIn/DoorList.tsx",
      "src/features/events/checkIn/WhoCame.tsx",
    ],
    why:
      "draws a staff name it is handed, in its parts; every screen that mounts it is a committee screen listed here, or " +
      "one drawn only with names a route made for the person looking (`viewer`)",
  }],
  ["src/lib/names/scrub.ts", {
    who: "rule",
    why: "every name an account holds, the full name among them, for a scrub: read to be taken out of words and never shown; its callers are the scrub entries below",
  }],
  ["src/app/api/events/[id]/audience/route.ts", {
    who: "rule",
    proof: ['chosenBy: chooser?.exists ? nameForViewer(viewer, accountNamesOf(chooser.data()), "NAISI member") : null,'],
    why: "who chose the people an event for chosen people is for, named to the people who run events by the rule for the session's own viewer: the committee and admins see the full name, a member who drafts or approves events the name people go by",
  }],
  ["src/lib/audience/load.ts", {
    who: "rule",
    proof: ['return nameForViewer(viewer, accountNamesOf(data), "NAISI member");'],
    why: "the picker of who a message is for names everybody through one function, by the rule for the session's own viewer: the committee and admins see the full name, a facilitator the name people go by",
  }],
  ["src/lib/events/requestCard.ts", {
    who: "rule",
    proof: ["staffNamesFor(db, uids, viewer, { emailShown: access.everyone })"],
    why:
      "the names of the people asking for a place at an event, for its Sign-ups page: every one through staffNamesFor with " +
      "the session's own viewer, so the committee and admins are sent the full name and an organiser who is a member the " +
      "name people go by; the name a sign-up kept is sent only to admins and SU-recognised committee",
  }],
  ["src/lib/courses/explainers/readers.ts", {
    who: "rule",
    proof: ['out.set(snap.id, nameForViewer(viewer, names, ""));'],
    why: "who explains and who scheduled an explainer, named through `nameForViewer` for the viewer each page hands it, the session's own: a facilitator who is not on the committee reads the name people go by on their ticket, the committee and admins a full name",
  }],
  ["src/lib/courses/explainers/schedule.ts", {
    who: "rule",
    proof: [
      'people.push({ uid: doc.id, name: nameForViewer(viewer, accountNamesOf(data), "NAISI member"), role });',
      'nameForViewer({ role: String(explainerData.role) }, accountNamesOf(schedulerSnap.data() ?? {}), "An admin")',
    ],
    why: "an admin's form names who may explain through `nameForViewer` for the admin; the task and the email to whoever explains name the admin who asked through it for them, somebody the server held to the committee or an admin",
  }],
  ["src/lib/applications/review/people.ts", {
    who: "rule",
    why: "the review screens' name for an applicant (`applicantName`): the staff rule over the full name on their application",
  }],

  // --- Shapes --------------------------------------------------------------
  ["src/lib/firestore/users.ts", {
    who: "shape",
    why: "declares `profile.fullName` and Home's stamp on the account's type, and the field's 120-character limit",
  }],
  ["src/lib/applications/model.ts", {
    who: "shape",
    why: "declares the full name on an application's About you, the copy a reviewer reads",
  }],
  ["src/lib/applications/normalise.ts", {
    who: "shape",
    why: "reads a stored About you into its shape, the full name capped to its limit, and shows it to nobody",
  }],
  ["src/features/admin/adminMutations.ts", {
    who: "shape",
    why: "the list of profile fields an admin's edit writes; it writes what the admin's own form hands it and shows nothing",
  }],
  ["src/lib/events/requestWords.ts", {
    who: "shape",
    why: "a request for a place carries its name in the parts a staff screen draws; it reads no account, and is filled by the requests route",
  }],
  ["src/lib/events/checkInView.ts", {
    who: "shape",
    why: "a door list row carries a name in the parts a staff screen draws; it reads no account, and is handed names by pages behind runsCheckIn",
  }],

  // --- The person's own ----------------------------------------------------
  ["src/app/(auth)/register/page.tsx", {
    who: "own",
    proof: ["fullName: fullName.trim(),"],
    why: "joining asks the person their full name, starting with the name on their own Google account, and sends it as their own profile",
  }],
  ["src/auth/signInWithGoogle.ts", {
    who: "own",
    proof: ['await setDoc(doc(db, "users", user.uid), {'],
    why: "writes the join request, with the full name, to the signed-in person's own account document and nobody else's",
  }],
  ["src/app/(app)/dashboard/homeData.ts", {
    who: "own",
    proof: ['const snap = await db.collection("users").doc(uid).get();'],
    why: "Home asks for a full name: reads the session's own account to know whether to ask, and offers their own Google name",
  }],
  ["src/app/(app)/dashboard/FullNameCard.tsx", {
    who: "own",
    proof: ['await updateDoc(doc(getClientDb(), "users", uid), {'],
    mountedBy: ["src/app/(app)/dashboard/page.tsx"],
    why: "the question on Home: writes the full name the person types to their own account, from the page that is theirs",
  }],
  ["src/features/profile/ProfileForm.tsx", {
    who: "own",
    proof: ['await updateDoc(doc(db, "users", user.uid), patch);'],
    why: "the person's own profile: shows them the full name they gave and saves the one they change",
  }],
  ["src/lib/applications/applicant/account.ts", {
    who: "own",
    why: "the About you a person's own account holds, to open their own application with",
  }],
  ["src/lib/applications/applicant/draft.ts", {
    who: "own",
    why: "cleans the applicant's own draft before it is saved, the full name with the rest of About you",
  }],
  ["src/lib/applications/applicant/join.ts", {
    who: "own",
    why: "the join request the application form's first step makes of the person's own answers, and what that tab keeps of them",
  }],
  ["src/lib/applications/applicant/project.ts", {
    who: "own",
    why: "an application as its owner is sent it, so their form opens with the full name they saved",
  }],
  ["src/lib/applications/validate.ts", {
    who: "own",
    why: "says a full name is missing from the applicant's own About you, before their application can be sent",
  }],
  ["src/features/applications/apply/AboutStep.tsx", {
    who: "own",
    why: "the application form's first step, where the applicant gives their own full name",
  }],
  ["src/features/applications/apply/ApplicationForm.tsx", {
    who: "own",
    why: "the applicant's own form: a draft from before the step asked opens with their account's full name in the box",
  }],

  // --- The committee and admins --------------------------------------------
  ["src/app/(app)/events/manage/[id]/attendees/page.tsx", {
    who: "committee",
    proof: [
      "if (!access.requests) redirect(",
      "if (access.everyone && db) {",
      "staffNamesFor(db, uids, viewer, { emailShown: true })",
    ],
    why:
      "an event's Sign-ups: the names of everybody who signed up are looked up only for admins and SU-recognised " +
      "committee, as the sign-ups rule has it; the event's other organisers are drawn the requests alone, whose names " +
      "their route makes for them (SignupRequests)",
  }],
  ["src/features/events/AttendeeDashboard.tsx", {
    who: "committee",
    mountedBy: ["src/app/(app)/events/manage/[id]/attendees/page.tsx"],
    why:
      "draws the staff names of everybody who signed up, which its page looked up for admins and SU-recognised " +
      "committee alone; for anybody else its page admits it draws the requests alone (SignupRequests)",
  }],
  ["src/features/events/SignupRequests.tsx", {
    who: "viewer",
    proof: ["fetch(`/api/events/${encodeURIComponent(eventId)}/signups`"],
    mountedBy: ["src/features/events/AttendeeDashboard.tsx"],
    why:
      "the requests waiting for a decision, drawn for an event's organisers as well as the committee, with the names the " +
      "requests route made for the person looking by the rule (src/lib/events/requestCard.ts)",
  }],
  ["src/app/(app)/events/manage/[id]/door/page.tsx", {
    who: "committee",
    proof: ["if (!runsCheckIn(viewer)) redirect(", "await staffNamesFor(db,"],
    why: "the door list, for the people who run check-in (admins and SU-recognised committee) and nobody else",
  }],
  ["src/features/events/checkIn/DoorList.tsx", {
    who: "committee",
    mountedBy: ["src/app/(app)/events/manage/[id]/door/page.tsx"],
    why: "draws the door list's rows its page named behind runsCheckIn",
  }],
  ["src/app/(app)/events/manage/[id]/check-in/page.tsx", {
    who: "committee",
    proof: ["const staff = runsCheckIn(viewer);", "const people = staff"],
    why: "Who came, on the Check-in tab: the names are looked up only when the viewer runs check-in; everybody else's rows are counted",
  }],
  ["src/features/events/checkIn/WhoCame.tsx", {
    who: "committee",
    mountedBy: ["src/app/(app)/events/manage/[id]/check-in/page.tsx"],
    why: "draws who came, which its page mounts only for the people who run check-in",
  }],
  ["src/app/(app)/admin/(admin-only)/members/page.tsx", {
    who: "committee",
    why: "the admin People list's search and sort, under the admin-only layout",
  }],
  ["src/features/admin/MembersTable.tsx", {
    who: "committee",
    mountedBy: [
      "src/app/(app)/admin/(admin-only)/members/page.tsx",
      "src/features/admin/MemberPage.tsx",
      "src/features/admin/MemberItem.tsx",
    ],
    why: "the admin People list's rows, named by the staff rule, and the same name for one person's page",
  }],
  ["src/features/admin/MemberPage.tsx", {
    who: "committee",
    mountedBy: ["src/app/(app)/admin/(admin-only)/members/[uid]/page.tsx"],
    why: "one person's page for an admin, which names who approved or turned the account down",
  }],
  ["src/features/admin/MemberItem.tsx", {
    who: "committee",
    mountedBy: ["src/features/admin/MemberPage.tsx"],
    why: "the head of one person's page for an admin: their full name, with the name they go by after it",
  }],
  ["src/features/admin/MemberEditForm.tsx", {
    who: "committee",
    mountedBy: ["src/features/admin/MemberItem.tsx"],
    why: "the profile an admin can change on one person's page, the full name with it",
  }],
  ["src/features/admin/ApprovalCard.tsx", {
    who: "committee",
    mountedBy: ["src/app/(app)/admin/(admin-only)/page.tsx"],
    why: "a join request on the admin Approvals page, named by the staff rule",
  }],
  ["src/lib/applications/review/board.ts", {
    who: "committee",
    proof: ["const looking = lookingAt({ form, sets, term, viewer, application });"],
    why: "the applications board's rows, built for a viewer who reviews or leads the programme (`lookingAt`): admins and SU-recognised committee",
  }],
  ["src/lib/applications/review/detail.ts", {
    who: "committee",
    proof: ["const looking = lookingAt({ form, sets, term, viewer, application });"],
    why: "one application's review page, for its reviewers, its lead and admins (`lookingAt`)",
  }],
  ["src/lib/applications/review/decide.ts", {
    who: "committee",
    proof: ["!canReadApplication(user, form, ranked, joinedByInvitation(application))"],
    why: "a decision's answer names the applicant to the lead or admin deciding, once the read path's own question has said they may read it",
  }],
  ["src/lib/courses/facilitatorAsks/people.ts", {
    who: "committee",
    why: "the list of people who would facilitate, for the programme's lead and admins, read behind the programme's own gate",
  }],

  // --- Course and survey screens, by the rule for their own reader --------
  // Each names everybody through `nameForViewer` and nothing else (the walk's
  // last test in this block holds that), with the viewer its page or route
  // is drawn for: the committee and admins see "Priya Shah (Pri)", a lead or
  // facilitator who is not on the committee the name people go by.
  ["src/lib/courses/registerAccess.ts", {
    who: "rule",
    proof: ['nameByUid.set(doc.id, nameForViewer(viewer, accountNamesOf(data), "NAISI member"));'],
    why: "a register's rows, named for the viewer each caller hands it: the register's route hands it the session; what reaches the people themselves hands it no role, and reads the name they go by",
  }],
  ["src/app/api/courses/groups/[groupId]/attendance/route.ts", {
    who: "rule",
    proof: [
      "loadRegisterMembers(db, runId, groupId, { isAdmin: gated.isAdmin, role: actor.role })",
      'displayName: nameForViewer(actor, accountNamesOf(runRecords?.accounts.get(leaver.uid) ?? {}), "NAISI member"),',
    ],
    why: "the register: its rows and the people who left the group, each named for the session reading it, behind the register's own gate",
  }],
  ["src/lib/courses/programmeAttendance.ts", {
    who: "rule",
    proof: ['return nameForViewer(viewer, accountNamesOf(data ?? {}), "NAISI member");'],
    why: "the lead's Attendance grid and its CSV, the Overview, who finished, the group page and the ratings: every row and facilitator named for the viewer each page hands it, and by the name people go by where it is handed none",
  }],
  ["src/lib/courses/programmeOverview.ts", {
    who: "rule",
    proof: ['name: nameForViewer(viewer, accountNamesOf(records.accounts.get(enrolment.uid) ?? {}), "NAISI member"),'],
    why: "the Overview's people who left with no register to list them, named for the lead or admin reading it, as the grid names the rest",
  }],
  ["src/lib/courses/coursework/load.ts", {
    who: "rule",
    proof: ['.map((doc) => [doc.id, nameForViewer(viewer, accountNamesOf(doc.data() ?? {}), "NAISI member")] as const),'],
    why: "the Coursework tab and one person's coursework page, for the programme's lead and admins: every row named off its account for the session reading it",
  }],
  ["src/lib/courses/feedback/send.ts", {
    who: "rule",
    proof: ['name: nameForViewer(user, accountNamesOf(account), "NAISI member"),'],
    why: "the Overview's list of feedback to email, each person named for the admin or lead pressing; the email itself greets them by the first name they go by, and a piece stays signed with the name its writer goes by",
  }],
  ["src/lib/courses/getReady/read.ts", {
    who: "rule",
    proof: ['name: nameForViewer(actor, accountNamesOf(records.accounts.get(uid) ?? {}), "NAISI member"),'],
    why: "get-ready's facilitators when the Facilitators view could not be read, named for the lead or admin reading the card",
  }],
  ["src/lib/courses/groupNotes/readers.ts", {
    who: "rule",
    proof: ['const writerName = nameForViewer(viewer, accountNamesOf(account), "NAISI member");'],
    why: "the name beside a shared note's initials, for the group page's facilitators and admins and the Attendance tab's lead and admins; the name over the note is the first name its writer goes by",
  }],
  ["src/lib/courses/sessionReports/readers.ts", {
    who: "rule",
    proof: ['const nameOf = (uid: string) => nameForViewer(viewer, accountNamesOf(accounts.get(uid) ?? {}), "NAISI member");'],
    why: "session reports, for the programme's lead and admins and for each writer's own: the writer and the people a report picks, named for the reader",
  }],
  ["src/lib/courses/weeksTab/load.ts", {
    who: "rule",
    proof: ['const nameOf = (data: Record<string, unknown>) => nameForViewer(viewer, accountNamesOf(data), "NAISI member");'],
    why: "the Weeks tab's owners, the programme's lead and the run's helpers, named for the lead or admin reading it",
  }],
  ["src/lib/courses/writtenAnswers/queue.ts", {
    who: "rule",
    proof: ['if (snap.exists) names.set(snap.id, nameForViewer(actor, accountNamesOf(snap.data() ?? {}), "NAISI member"));'],
    why: "Feedback to write, on the group page, Home and the Attendance tab: each person named for the session the queue is read for",
  }],
  ["src/lib/courses/writtenAnswers/reviewPage.ts", {
    who: "rule",
    proof: ['shownName.set(snap.id, nameForViewer(actor, accountNamesOf(data), "NAISI member"));'],
    why: "the review page's people, named for the facilitator, lead or admin reading it; feedback on it stays signed with the name its writer goes by",
  }],
  ["src/lib/ratings/view.ts", {
    who: "rule",
    proof: ['const nameOf = (data: Record<string, unknown>) => nameForViewer(viewer, accountNamesOf(data), "NAISI member");'],
    why: "the ratings at the end: the fellows (through the grid) and the raters, named for the facilitator, lead or admin reading them",
  }],
  ["src/lib/surveys/names.ts", {
    who: "rule",
    proof: ['if (doc.exists) out.set(doc.id, nameForViewer(viewer, accountNamesOf(doc.data() ?? {}), "NAISI member"));'],
    why: "the admins' survey screens and the download with names, each name for the admin reading it; the audience read that sending shares hands it no viewer, and reads the name people go by",
  }],
  ["src/lib/surveys/onePerson.ts", {
    who: "rule",
    proof: ['return { name: nameForViewer(viewer, accountNamesOf(data), "NAISI member"), firstName: firstNameOfUser(data) };'],
    why: "one person's survey answers, opened by an admin: their name for that admin, recorded before it is read",
  }],
  ["src/lib/surveys/events/audience.ts", {
    who: "rule",
    proof: ['accounts.set(doc.id, { name: nameForViewer(viewer, accountNamesOf(data), "NAISI member"), address: address || null });'],
    why: "who a survey after an event is for: named for the admin's screens that hand it a viewer, and by the name people go by for sending and everything else, which hands it none",
  }],

  // --- Scrubs: read to be taken out, never shown ---------------------------
  ["src/lib/applications/assessment/run.ts", {
    who: "scrub",
    proof: [
      "const accountNames = await namesToScrubOf(db, Object.values(input.applicants));",
      "scrubbed(ask.question, people)",
    ],
    why: "an admin's question about a whole programme has every name on each applicant's account taken out before it is sent",
  }],
  ["src/lib/applications/arrange/advise.ts", {
    who: "scrub",
    proof: [
      "const accountNames = await namesToScrubOf(db, uids);",
      "const fullName = application?.sent?.aboutYou.fullName.trim();",
      "question: scrubbed(input.question, named),",
    ],
    why: "an admin's question about arranging groups, and the turns before it, have every name on each person's account, and the full name on their application, taken out before they are sent",
  }],
  ["src/lib/courses/coursework/gather.ts", {
    who: "scrub",
    proof: ["return namesToScrubOf(db, uids);"],
    why: "the names the coursework scrub takes out of the best answers' and a note draft's messages (`loadAccountNames`), read here and used there",
  }],

  // --- Other things called fullName ----------------------------------------
  ["src/app/api/admissions/rounds/[roundId]/apply/route.ts", {
    who: "other",
    why: "an older round's apply route has a function of its own called `applicantName`: the caller's own preferred name, then display name",
  }],
  ["src/app/api/collaborators/route.ts", {
    who: "other",
    why: "an external collaborator's own application, which has a name field of its own called fullName",
  }],
  ["src/app/api/collaborators/[id]/route.ts", {
    who: "other",
    why: "an admin's decision on a collaborator's application, which names the collaborator by their own form's field",
  }],
  ["src/app/collaborator/layout.tsx", {
    who: "other",
    why: "a collaborator's own area, which greets them by the name on their own application",
  }],
  ["src/app/collaborator/page.tsx", {
    who: "other",
    why: "a collaborator's own application, opened for them to change",
  }],
  ["src/components/CollaboratorApplicationForm.tsx", {
    who: "other",
    why: "the form a collaborator fills in: their own name, in a collection of its own",
  }],
  ["src/features/admin/CollaboratorCard.tsx", {
    who: "other",
    why: "a collaborator's application on the admin page, named by its own field",
  }],
  ["src/lib/firestore/collaborators.ts", {
    who: "other",
    why: "the shape of a collaborator's application, whose own name field is called fullName",
  }],
  ["src/lib/firebase/session.ts", {
    who: "other",
    why: "a signed-in collaborator's own session, which carries the name from their own application",
  }],
  ["src/app/api/courses/runs/[runId]/allocation/publish/preview/route.ts", {
    who: "other",
    why: "a local function called fullName, which returns what `fullNameOfUser` does: the name people go by",
  }],
  ["src/lib/firestore/applicationEmails.ts", {
    who: "other",
    why: "the {fullName} token of an email about a person's own application, filled from their display name or preferred name",
  }],
  ["src/features/admin/emailDesigns/EmailDesignEditor.tsx", {
    who: "other",
    why: "a sample value for the {fullName} token, shown to the admin writing an email design",
  }],
  ["src/lib/applications/editor/people.ts", {
    who: "other",
    why: "a candidate lead's or reviewer's account display name for the form editor's picker, never the full name a person gave",
  }],
  ["src/lib/applications/editor/views.ts", {
    who: "other",
    why: "carries the editor picker's display name for a candidate, under a property called fullName",
  }],
  ["src/features/applications/editor/ProgrammeSetup.tsx", {
    who: "other",
    why: "the form editor's picker of leads and reviewers, labelled with each candidate's display name",
  }],
]);

const WHO = ["rule", "shape", "own", "committee", "scrub", "viewer", "other"];

/** Every file under `src` that imports `target`, by repository path. A type-only import draws nothing and is left out. */
function importersOf(target) {
  const found = [];
  for (const file of walkSource(SRC)) {
    const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    for (const [, typeOnly, specifier] of code.matchAll(/\bimport\s+(type\s+)?[^;]*?\bfrom\s*"([^"]+)"/g)) {
      if (typeOnly) continue;
      const resolved = resolveImport(file, specifier, SRC);
      if (resolved && repoPath(resolved) === target) found.push(repoPath(file));
    }
  }
  return [...new Set(found)].sort();
}

/** Whether a file is behind the committee's gate: a committee entry here, or a page under the admin-only tree. */
function behindCommitteeGate(file) {
  return READERS.get(file)?.who === "committee" || file.startsWith(ADMIN_ONLY_TREE);
}

describe("every file that names a full name says who reads it", () => {
  const found = [...walkSource(SRC)]
    .map(repoPath)
    .filter((file) => !file.startsWith("src/content/legal/"))
    .filter((file) => NAMES_A_FULL_NAME.test(codeOf(file)))
    .sort();

  test("the walk is reading: it finds the files this list knows by name", () => {
    assert.ok(found.length >= 40, `only ${found.length} files were found`);
    for (const known of ["src/lib/names/staffName.ts", "src/features/profile/ProfileForm.tsx", "src/lib/firestore/collaborators.ts"]) {
      assert.ok(found.includes(known), `${known} names a full name and the walk did not see it`);
    }
    // A comment is not a reader: the certificate's rule names none in code.
    assert.ok(!found.includes("src/lib/names/certificateName.ts"));
  });

  test("each one is listed, and every entry is a file that still names one", () => {
    assert.deepEqual(
      found.filter((file) => !READERS.has(file)),
      [],
      "These files name a full name and are not in READERS. The privacy policy says only the committee sees " +
        "a full name and everyone else sees the name people go by: decide who reads what this file reads, put " +
        "the gate in front of it, and list it here with the gate and a reason.",
    );
    assert.deepEqual([...READERS.keys()].filter((file) => !found.includes(file)), [], "these entries no longer name a full name: drop them");
  });

  for (const [file, entry] of READERS) {
    test(`${file} is what its entry says`, () => {
      assert.ok(WHO.includes(entry.who), `\`${entry.who}\` is not a kind of reader`);
      assert.ok(typeof entry.why === "string" && entry.why.length >= 40, "a reason is missing or too short to weigh");
      const code = codeOf(file);
      for (const literal of entry.proof ?? []) {
        assert.ok(code.includes(literal), `its gate is \`${literal}\`, which the file no longer contains`);
      }
      if (entry.mountedBy) {
        assert.deepEqual(
          importersOf(file),
          [...entry.mountedBy].sort(),
          "it is drawn by files its entry does not name. Each one shows what this draws: list it, behind its gate.",
        );
      }
      if (entry.who === "committee") {
        // Proved by its own gate, by the tree it is in, or by every file that draws it being behind the gate.
        const proved =
          (entry.proof ?? []).length > 0 ||
          file.startsWith(ADMIN_ONLY_TREE) ||
          (entry.mountedBy ?? []).length > 0 ||
          file.startsWith("src/lib/");
        assert.ok(proved, "a committee entry has to say what keeps anybody else out");
        for (const parent of entry.mountedBy ?? []) {
          assert.ok(behindCommitteeGate(parent), `${parent} draws it and is not behind the committee's gate`);
        }
      }
      if (entry.who === "rule" && entry.mountedBy) {
        // What draws a staff name it is handed is drawn only on committee
        // screens, or by a screen whose names a route made for its viewer.
        for (const parent of entry.mountedBy) {
          assert.ok(
            behindCommitteeGate(parent) || READERS.get(parent)?.who === "viewer",
            `${parent} mounts it and is neither a committee screen nor one named for its viewer`,
          );
        }
      }
      if (entry.who === "viewer") {
        // Drawn for whoever its page admits, so every name in it was made for that person by a route.
        assert.ok((entry.proof ?? []).length > 0, "a viewer entry has to say where its names come from");
        assert.ok(file.endsWith(".tsx") && /^"use client";/.test(codeOf(file)), "a viewer entry is a browser component, handed what a route sent");
        assert.ok(!readsAnAccountsFullName(code), "it is drawn for whoever its page admits, and it reads a full name itself");
      }
      if (entry.who === "scrub") {
        // Server code that hands names to a scrub draws nothing.
        assert.ok(file.startsWith("src/lib/") && file.endsWith(".ts"), "a scrub entry is server code under src/lib");
        assert.ok((entry.proof ?? []).length > 0, "a scrub entry has to say where the names are read and where they go");
      }
      if (entry.who === "other") {
        assert.ok(
          !readsAnAccountsFullName(code),
          "it is listed as another thing called fullName, and it reads an account's full name",
        );
      }
    });
  }

  test("the admin-only tree lets an admin in and nobody else", () => {
    assert.match(codeOf("src/app/(app)/admin/(admin-only)/layout.tsx"), /await requireAdminPage\(\);/);
  });

  test("the course and survey code that facilitators and leads read names a full name only through the rule", () => {
    // Course and survey screens show a full name only through `nameForViewer`,
    // for the reader in front of them: the committee and admins see "Priya
    // Shah (Pri)", a facilitator or lead who is not on the committee the name
    // people go by. The rest of this side that names one: the lead's list of
    // people who would facilitate, a review of applications by the lead and
    // admins; the coursework scrub, which reads every name an account holds
    // only to take it out of what is sent; and Publish's preview, whose
    // `fullName` is a local name for the name people go by.
    const courseSide = found.filter((file) =>
      /^src\/(?:lib\/courses|features\/courses|app\/\(app\)\/learn|app\/api\/courses|lib\/surveys|app\/api\/surveys|lib\/ratings)\//.test(file),
    );
    const notTheRule = [
      "src/app/api/courses/runs/[runId]/allocation/publish/preview/route.ts",
      "src/lib/courses/coursework/gather.ts",
      "src/lib/courses/facilitatorAsks/people.ts",
    ];
    assert.deepEqual(
      courseSide.filter((file) => !notTheRule.includes(file)),
      courseSide.filter((file) => READERS.get(file)?.who === "rule"),
      "a course or survey file names a full name some other way than the rule: decide who reads it, and list it",
    );
    assert.deepEqual(courseSide.filter((file) => notTheRule.includes(file)), notTheRule, "an exception no longer names a full name: take it off the list");
    for (const file of courseSide.filter((each) => !notTheRule.includes(each))) {
      const code = codeOf(file);
      // The one rule, and only the rule: no staff name built by hand, and no full name read off a document.
      assert.match(code, /\bnameForViewer\(/, `${file} names a full name without the rule`);
      const others = PRODUCERS.filter((name) => name !== "nameForViewer" && name !== "accountNamesOf");
      assert.ok(!new RegExp(`\\b(?:${others.join("|")})\\s*\\(`).test(code), `${file} builds a staff name some other way than the rule`);
      assert.ok(!/profile\??\.fullName/.test(code), `${file} reads a full name off a document`);
    }
  });
});

describe("the names module hands out what this file knows", () => {
  test("its exports are the ones listed, so a new producer of a full name is a decision", () => {
    const code = codeOf("src/lib/names/staffName.ts");
    const exported = [...code.matchAll(/\bexport\s+(?:async\s+)?(?:function|const|type)\s+(\w+)/g)].map((match) => match[1]).sort();
    assert.deepEqual(exported, [
      "AccountNames",
      "GUEST_FIRST_NAME_ONLY",
      "NameViewer",
      "StaffName",
      "accountNamesOf",
      "fullNameKey",
      "goByNameOf",
      "guestStaffName",
      "nameForViewer",
      "namesInStaffWords",
      "seesFullNames",
      "sharedFullNames",
      "staffNameOf",
      "staffNameWords",
    ]);
    const load = codeOf("src/lib/names/load.ts");
    // `LIVE_RUN` names nobody: it is what "their programme" means, shared
    // with the card under a request for a place at an event
    // (src/lib/events/requestCard.ts) so the two say the same programmes.
    assert.deepEqual(
      [...load.matchAll(/\bexport\s+(?:async\s+)?(?:function|const|type)\s+(\w+)/g)].map((match) => match[1]).sort(),
      ["LIVE_RUN", "StaffNamesOptions", "staffNamesFor"],
    );
    const scrub = codeOf("src/lib/names/scrub.ts");
    assert.deepEqual(
      [...scrub.matchAll(/\bexport\s+(?:async\s+)?(?:function|const|type)\s+(\w+)/g)].map((match) => match[1]).sort(),
      ["namesToScrubOf"],
    );
    // The name people go by is never read off the full name.
    assert.match(code, /goBy: text\(profile\.preferredName\) \?\? display,/);
  });
});

describe("every scrub of words that leave the site knows the full name", () => {
  /**
   * The files that take names out of words before they go to an outside
   * service, and where each one's names come from. The site asks for a full
   * name, so a scrub that knew only the name people go by, or the account's
   * display name, would let a full name typed into a question or an answer
   * through. `names` is where its list of names is read, as text the file
   * must contain; a scrub whose names are handed to it says by whom
   * (`handedBy`: every file that calls its builders, with where that file
   * reads them).
   */
  const SCRUBS = new Map([
    ["src/lib/applications/assessment/run.ts", {
      names: ["namesInStaffWords(own(applicantNames, label)", "namesToScrubOf(db, Object.values(input.applicants))"],
      why: "an admin's question about a programme: each row's names, read back from its staff line, and every name on each account",
    }],
    ["src/lib/applications/arrange/advise.ts", {
      names: ["namesToScrubOf(db, uids)", "application?.sent?.aboutYou.fullName"],
      why: "an admin's question about arranging groups, and the turns before it: the name on the screen, every name on each account, and the full name on each application",
    }],
    ["src/lib/courses/coursework/input.ts", {
      names: [],
      builders: ["bestAnswersInput", "noteDraftInput"],
      handedBy: {
        "src/lib/courses/coursework/bestAnswers.ts": "runPeopleToScrub(db, door)",
        // CHANGED ON PURPOSE (the week review): the people running the
        // programme are scrubbed from a note draft too.
        "src/lib/memberNotes/draft.ts": "await loadAccountNames(db, [subjectUid, ...enrolled, ...people.facilitators, ...staff])",
      },
      why: "the best answers' and a note draft's messages: `scrubNames` over the people each builder is handed",
    }],
    ["src/lib/courses/weekReview/input.ts", {
      names: [],
      builders: ["reviewInputs"],
      handedBy: {
        // The gatherer reads the names by `runPeopleToScrub(db, door)`, the coursework door's every-name read.
        "src/lib/courses/weekReview/store.ts": "gatherWeekReview(db, opened, now)",
      },
      why: "a week review's three messages: `scrubNames` over everybody on the run, its seats, its facilitators and the people running the programme, read by the review's gatherer through the coursework door",
    }],
  ]);
  const callsOf = (names) => new RegExp(`(?<!function\\s+)\\b(?:${names.join("|")})\\s*\\(`);

  test("every file that scrubs names out of words is listed, and every entry still does", () => {
    const scrubbing = [...walkSource(SRC)]
      .map(repoPath)
      .filter((file) => callsOf(["scrubbed", "scrubNames"]).test(codeOf(file)))
      .sort();
    assert.deepEqual(
      scrubbing,
      [...SCRUBS.keys()].sort(),
      "A file takes names out of words and is not listed here. Read every name the people in it hold, the full " +
        "name among them (`namesToScrubOf` in src/lib/names/scrub.ts), and list it with where its names come from.",
    );
  });

  for (const [file, entry] of SCRUBS) {
    test(`${file} reads every name it takes out`, () => {
      assert.ok(entry.why.length >= 40, "a reason is missing or too short to weigh");
      const code = codeOf(file);
      for (const literal of entry.names) assert.ok(code.includes(literal), `its names are read by \`${literal}\`, which it no longer contains`);
      if (entry.handedBy) {
        const callers = [...walkSource(SRC)]
          .map(repoPath)
          .filter((other) => other !== file && callsOf(entry.builders).test(codeOf(other)))
          .sort();
        assert.deepEqual(callers, Object.keys(entry.handedBy).sort(), "its builders are called by files this entry does not name");
        for (const [caller, literal] of Object.entries(entry.handedBy)) {
          assert.ok(codeOf(caller).includes(literal), `${caller} reads the names by \`${literal}\`, which it no longer contains`);
        }
      }
    });
  }

  test("what the scrubs read off an account is every name it holds, the full name among them", () => {
    assert.match(codeOf("src/lib/names/scrub.ts"), /\[data\.displayName, profile\.preferredName, profile\.fullName\]/);
    assert.match(codeOf("src/lib/courses/coursework/door.ts"), /const names = await loadAccountNames\(db, uids\);/);
    assert.match(codeOf("src/lib/courses/weekReview/gather.ts"), /runPeopleToScrub\(db, door\)/);
    assert.match(codeOf("src/lib/courses/coursework/gather.ts"), /return namesToScrubOf\(db, uids\);/);
  });
});
