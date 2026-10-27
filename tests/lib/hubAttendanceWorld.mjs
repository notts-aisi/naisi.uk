/**
 * Week 3 of AGI Strategy's run, for the suites about its lead's Attendance
 * and Overview tabs (boards wk-attendance and wk-overview).
 *
 * Built on `tests/lib/leadWorld.mjs` (AGI Strategy names its run, Claudia
 * leads it, Lloyd reviews it, Yusuf is the run's track lead, Tess leads
 * another programme). On top of it, the run as the boards draw it, with
 * every record a suite reads written as the routes write them:
 *
 *  - FOUR GROUPS. Group A meets on Thursdays at 6pm (Sofia), Group B on
 *    Tuesdays at 6pm (Rahul and Sofia), Group C on Wednesdays at 1pm (Tom)
 *    and Group D on Mondays at 6pm (Grace). Sessions last two hours.
 *  - THE CLOCK. `NOW` is Tue 17 Nov 2026 at noon in London: the run is in
 *    week 3 (Thu 12 to Wed 18 Nov). Group A has run three sessions, all
 *    finished; Group D's third, on Mon 16 Nov, is saved and not finished;
 *    Group B meets tonight and Group C tomorrow.
 *  - THE PEOPLE. Group A: Amara (P P P), Dev (L P P), Bea (P E P), Tariq
 *    (P A A, two in a row) and Sam (P A, then left on Fri 6 Nov, saying why).
 *    Group B: Chloe (P P), Farah (P L), Kofi (E P), and Omar, taken off the
 *    run by staff after week 1 (P). Group C: Hamza (P P), and Una, placed by
 *    an admin and not told by Publish yet. Group D: Freya (P A, then A saved
 *    and not finished) and Yasmin (P P, then P saved).
 *  - THE WEEKS. Weeks 1 to 3 are published, 4 to 6 are not; week 3 is
 *    called "Who decides what AGI means".
 *
 * Every address is `example.com`. A participant note on a register holds a
 * sentence no page or file may show.
 */
import { session, userDoc } from "./applicationsSmallTerm.mjs";
import { COURSE, groupDoc } from "./handoverWorld.mjs";
import { A, AGI, B, C, ROUND, RUN, leadSeed, slot } from "./leadWorld.mjs";

export { A, AGI, B, C, COURSE, ROUND, RUN };

/** Group D: Mondays at 6pm, Grace. */
export const D = "agi-autumn-2026-mondays__grp00004";

/** Tue 17 Nov 2026 at noon in London (GMT). */
export const NOW = new Date("2026-11-17T12:00:00Z");
/** When Publish told everybody their group. */
export const TOLD_ON = new Date("2026-10-28T18:00:00Z");
/** When Sam left: Fri 6 Nov, after Group A's second session. */
export const SAM_LEFT = new Date("2026-11-06T10:00:00Z");
/** What Sam typed when leaving. */
export const SAM_SAID = "Too much on this term.";
/** A facilitator's note about Amara: it never reaches a page or a file. */
export const SECRET_NOTE = "Struggled with the reading, said so in private.";

/** uid: [name, group the enrolment names]. */
export const PEOPLE = {
  amara: ["Amara Okafor", A],
  dev: ["Dev Patel", A],
  bea: ["Bea Lindqvist", A],
  tariq: ["Tariq Mensah", A],
  sam: ["Sam Whitfield", A],
  chloe: ["Chloe Nguyen", B],
  farah: ["Farah Hussain", B],
  kofi: ["Kofi Asante", B],
  omar: ["Omar Haddad", null],
  hamza: ["Hamza Qureshi", C],
  una: ["Una Byrne", C],
  freya: ["Freya Thompson", D],
  yasmin: ["Yasmin Farouk", D],
};

/** An account whose chosen name is the whole name, as the boards draw people. */
export function account(uid, name, role = "member", su = false) {
  const doc = userDoc(session(uid, role, su, name));
  doc.profile = { ...doc.profile, preferredName: name };
  return doc;
}

/** An enrolment as allocation and Publish leave one. */
export function enrolment(uid, groupId, over = {}) {
  return {
    runId: RUN.agi,
    courseId: COURSE.agi,
    uid,
    groupId,
    status: "active",
    role: "learner",
    selfEnrolled: false,
    applicationId: null,
    joinedWeekNumber: 1,
    allocatedEmailAt: TOLD_ON,
    attendance: {},
    createdAt: TOLD_ON,
    updatedAt: TOLD_ON,
    ...over,
  };
}

export const registerPath = (groupId, week) => `courseAttendance/${RUN.agi}__${groupId}__w0${week}`;

/** A register as the register's routes leave one: finished (pushed) unless said. */
export function register(groupId, week, records, { pushed = true, held = true, notes = {} } = {}) {
  return {
    runId: RUN.agi,
    groupId,
    weekNumber: week,
    occurrence: 1,
    records,
    held,
    pushedAt: pushed ? new Date("2026-11-01T09:00:00Z") : null,
    pushedByUid: pushed ? "sofia" : "",
    participantNotes: notes,
    notes: "",
    markedByUid: "sofia",
    updatedAt: new Date("2026-11-01T09:00:00Z"),
  };
}

/** The week docs: published through `published`. */
function weekDoc(n, published) {
  return {
    weekNumber: n,
    title: n === 3 ? "Who decides what AGI means" : `Week ${n} readings`,
    summary: "",
    published,
  };
}

/** The world every suite starts from. `over` adds or replaces whole documents. */
export function attendanceSeed(over = {}) {
  const seed = leadSeed();
  seed["users/grace"] = account("grace", "Grace Okoye");
  for (const [uid, [name]] of Object.entries(PEOPLE)) seed[`users/${uid}`] = account(uid, name);

  seed[`courseGroups/${D}`] = groupDoc({
    name: "Group D",
    facilitatorUids: ["grace"],
    session: slot({ weekday: 1, location: "Room D4" }),
  });

  for (const [uid, [, groupId]] of Object.entries(PEOPLE)) {
    seed[`courseEnrolments/${RUN.agi}__${uid}`] = enrolment(uid, groupId);
  }
  // Sam left the run on Fri 6 Nov: withdrawn, the group kept and the stamp cleared.
  seed[`courseEnrolments/${RUN.agi}__sam`] = enrolment("sam", A, {
    status: "withdrawn",
    droppedOutAt: SAM_LEFT,
    dropOutReason: SAM_SAID,
    allocatedEmailAt: null,
  });
  // Omar was taken off the run by staff: removed, the group and the stamp cleared.
  seed[`courseEnrolments/${RUN.agi}__omar`] = enrolment("omar", null, { status: "removed", allocatedEmailAt: null });
  // Una is placed and Publish has not told her yet.
  seed[`courseEnrolments/${RUN.agi}__una`] = enrolment("una", C, { allocatedEmailAt: null });

  // Group A: three sessions, all finished.
  seed[registerPath(A, 1)] = register(
    A,
    1,
    { amara: "present", dev: "late", bea: "present", tariq: "present", sam: "present" },
    { notes: { amara: SECRET_NOTE } },
  );
  seed[registerPath(A, 2)] = register(A, 2, { amara: "present", dev: "present", bea: "excused", tariq: "absent", sam: "absent" });
  seed[registerPath(A, 3)] = register(A, 3, { amara: "present", dev: "present", bea: "present", tariq: "absent" });
  // Group B: two sessions finished; tonight's has no register yet.
  seed[registerPath(B, 1)] = register(B, 1, { chloe: "present", farah: "present", kofi: "excused", omar: "present" });
  seed[registerPath(B, 2)] = register(B, 2, { chloe: "present", farah: "late", kofi: "present" });
  // Group C: two sessions finished; tomorrow's to come.
  seed[registerPath(C, 1)] = register(C, 1, { hamza: "present" });
  seed[registerPath(C, 2)] = register(C, 2, { hamza: "present" });
  // Group D: two finished, and Monday's saved and not finished.
  seed[registerPath(D, 1)] = register(D, 1, { freya: "present", yasmin: "present" });
  seed[registerPath(D, 2)] = register(D, 2, { freya: "absent", yasmin: "present" });
  seed[registerPath(D, 3)] = register(D, 3, { freya: "absent", yasmin: "present" }, { pushed: false });

  for (let n = 1; n <= 6; n += 1) seed[`courseRuns/${RUN.agi}/weeks/w0${n}`] = weekDoc(n, n <= 3);
  return { ...seed, ...over };
}

/** The scheduler's switches, stored as Site status stores them. */
export function switches({ scheduled = false, reminders = false, tasks = true } = {}) {
  return {
    jobs: {
      "courses-next-week-email": { enabled: scheduled },
      "courses-register-reminders": { enabled: reminders },
      "courses-unmarked-registers": { enabled: tasks },
    },
  };
}

