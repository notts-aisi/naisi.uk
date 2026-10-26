import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { TicketFacts } from "@/features/courses/sessionChange/cardFacts";
import { runProgrammeOf, type RunProgramme } from "@/lib/applications/handover/runProgramme";
import { resolveGroupCalendar, resolveWeekDoc } from "@/lib/courses/groupResolve";
import { sessionEyebrow } from "@/lib/courses/memberPageWords";
import { pitchesOnRun } from "@/lib/courses/pitching/load";
import { readPitchingWeek } from "@/lib/courses/pitching/week";
import { cardChangeFacts } from "@/lib/courses/sessionChange/model";
import { clockWords, dayWords, slotWords } from "@/lib/courses/sessionChange/words";
import { resolveSessions, sessionRange, type ResolvedSession } from "@/lib/courses/sessions";
import type { TeamDoc } from "@/lib/courses/teams/model";
import { weekSources } from "@/lib/courses/weekBlocks/reader";
import { londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import type { SessionUser } from "@/lib/firebase/session";
import { sessionModesOf, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  namedInATeam,
  runTakesTeamWriting,
  teamPagePerson,
  type Refusal,
  type TeamPagePerson,
  type TeamRoster,
} from "./access";
import {
  TEAM_ENTRIES_COLLECTION,
  TEAM_PAGE_LIMITS,
  checkInEntryId,
  handInEntryId,
  normalizeTeamEntry,
  shownAddress,
  type CheckInEntry,
  type HandInEntry,
  type LinkEntry,
  type TeamEntry,
} from "./model";
import type {
  CheckInView,
  HandInCardView,
  HandInPageView,
  TeamCardView,
  TeamLinkView,
  TeamPageView,
  TeamPersonView,
  TeamProjectView,
  TeamTicketView,
} from "./views";
import { teamWeeks, type PlanSlot } from "./weeks";
import {
  HAND_IN_CLOSED_RUN,
  NOT_HANDED_IN,
  changeUntilWords,
  handInActionWords,
  handInAsksWords,
  handInClosedWords,
  handInEyebrowWords,
  handInLedeWords,
  handInTitleWords,
  handedInDayWords,
  handedInWords,
  savedWords,
  sharedWithWords,
  showcaseLineWords,
  showcaseTicketWords,
  showcaseWhereWords,
  teamCardWords,
  teamEyebrowWords,
  teamHeadLineWords,
  teamWhoLine,
  tickFirstWords,
} from "./words";

/**
 * A TEAM'S PAGE, ITS HAND-IN AND ITS CARD, as each reader is shown them.
 *
 * Who reads is decided by `./access.ts` (the team's people) and by the Teams
 * tab's gate (the lead and admins, `./lead.ts`); this file builds what each
 * is shown, field by field, from records only: the team and its pitch, the
 * group's own calendar with its changes, the run's hand-in setting, and what
 * the team wrote. Every date and time is London's.
 */

/** The last minute a team can hand in on its due day: 23:59 in London, the house's closing minute. */
const CLOSING_CLOCK = "23:59";

/** When hand-ins due on `dueOn` stop. 23:59:00 is the last instant that counts. */
export function handInClosesAt(dueOn: string): Date {
  return londonWallClockToInstant(dueOn, CLOSING_CLOCK);
}

/** Whether a team can hand in or change its hand-in now. */
export function handInIsOpen(run: CourseRunDoc, now: Date): boolean {
  if (!runTakesTeamWriting(run)) return false;
  const { dueOn } = run.teamHandIn;
  return dueOn === null || now.getTime() <= handInClosesAt(dueOn).getTime();
}

/** The first word of the name a person goes by. */
function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** The team's people as the page names them, the reader first when they are one of them. */
function peopleOf(roster: TeamRoster, uids: readonly string[], readerUid: string | null): TeamPersonView[] {
  const ordered = readerUid && uids.includes(readerUid) ? [readerUid, ...uids.filter((uid) => uid !== readerUid)] : [...uids];
  return ordered.map((uid) => {
    const name = roster.takingPart.get(uid)?.name ?? "NAISI member";
    return { uid, name, firstName: firstNameOf(name) };
  });
}

/** A first name for whoever saved an entry last, when they take part on the run now; null otherwise. */
function saverName(roster: TeamRoster, uid: string | null): string | null {
  if (!uid) return null;
  const name = roster.takingPart.get(uid)?.name;
  return name ? firstNameOf(name) : null;
}

/** Everything the team has written, by kind. One equality on the team, so no declared index. */
async function entriesOf(db: Firestore, run: CourseRunDoc, teamId: string): Promise<TeamEntry[]> {
  const snap = await db.collection(TEAM_ENTRIES_COLLECTION).where("teamId", "==", teamId).get();
  return snap.docs
    .map((doc) => normalizeTeamEntry(doc.id, doc.data() ?? {}))
    .filter((entry): entry is TeamEntry => entry !== null && entry.runId === run.id && entry.teamId === teamId);
}

const linksOf = (entries: readonly TeamEntry[]): LinkEntry[] =>
  entries
    .filter((entry): entry is LinkEntry => entry.kind === "link")
    .sort(
      (a, b) =>
        (a.createdAt?.getTime() ?? Number.POSITIVE_INFINITY) - (b.createdAt?.getTime() ?? Number.POSITIVE_INFINITY) ||
        a.id.localeCompare(b.id),
    );

const handInOf = (entries: readonly TeamEntry[], teamId: string): HandInEntry | null =>
  entries.find((entry): entry is HandInEntry => entry.kind === "hand-in" && entry.id === handInEntryId(teamId)) ?? null;

const checkInsOf = (entries: readonly TeamEntry[]): CheckInEntry[] =>
  entries.filter((entry): entry is CheckInEntry => entry.kind === "check-in");

function linkViews(links: readonly LinkEntry[]): TeamLinkView[] {
  return links.map((link) => ({ id: link.id, label: link.label, url: link.url, shown: shownAddress(link.url) }));
}

// ---------------------------------------------------------------------------
// The group's calendar, as the page reads it
// ---------------------------------------------------------------------------

/** The group's sessions, the week's first in each taught week. */
function firstSessions(run: CourseRunDoc, group: CourseGroupDoc): ResolvedSession[] {
  return resolveSessions(run, group).filter((session) => session.occurrence === 1);
}

/** The taught week a London day falls in, by the group's calendar, or null. */
function weekOfDay(sessions: readonly ResolvedSession[], dateKey: string): number | null {
  for (const session of sessions) {
    if (!session.slotStartKey) continue;
    const start = session.slotStartKey;
    const end = new Date(Date.parse(`${start}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
    if (start <= dateKey && dateKey <= end) return session.weekNumber;
  }
  return null;
}

/** Where a week's session is held, as a line says it: its room, "Online" for an online week, or "". */
function placeOf(group: CourseGroupDoc, session: ResolvedSession): string {
  const mode = sessionModesOf(group)[session.weekId] ?? null;
  if (mode === "virtual") return "Online";
  return session.session.location.trim();
}

/** The week plan as "The weeks" reads it: each taught week with its dates, and the breaks. */
function planSlots(run: CourseRunDoc, group: CourseGroupDoc, sessions: readonly ResolvedSession[]): PlanSlot[] {
  const byWeek = new Map(sessions.map((session) => [session.weekNumber, session] as const));
  const { calendar } = resolveGroupCalendar(run, group);
  return calendar.weekPlan.map((entry): PlanSlot => {
    if (entry.kind === "break") return { kind: "break" };
    const session = byWeek.get(entry.weekNumber);
    return {
      kind: "week",
      weekNumber: entry.weekNumber,
      slotStartKey: session?.slotStartKey ?? "",
      dateKey: session?.dateKey ?? "",
    };
  });
}

/**
 * The group's next session, as the team page's ticket draws it (in-team):
 * its own day, time and room, a change for that week applied. The joining
 * link of an online week is not on this page: the programme's page carries
 * it, so the ticket says only that the week is online.
 */
function ticketOf(run: CourseRunDoc, group: CourseGroupDoc, now: Date): TeamTicketView | null {
  const sessions = resolveSessions(run, group);
  const range = sessionRange(sessions, now);
  const next = range.next;
  if (!next || !next.dateKey) return null;
  const todayKey = londonDateKey(now);
  const changes = cardChangeFacts(sessions, group, next, todayKey);
  const mode = sessionModesOf(group)[weekDocId(next.weekNumber)] ?? null;
  const location = (changes.next?.location ?? next.session.location).trim();
  const room = mode !== "virtual" && location ? location : null;
  const weekNumbers = changes.next?.weekNumbers ?? [next.weekNumber];
  const facts: TicketFacts = {
    weekNumber: next.weekNumber,
    weekNumbers,
    dateKey: next.dateKey,
    startTimeLocal: next.session.startTimeLocal,
    durationMinutes: next.session.durationMinutes,
    room,
    mode,
    joinUrl: null,
    missing: mode === "in-person" && !room ? "Your facilitator will confirm the room." : null,
  };
  const clock = clockWords(next.session.startTimeLocal);
  return {
    facts,
    eyebrow: sessionEyebrow({
      isToday: next.dateKey === todayKey,
      isFirst: next.dateKey === range.firstDateKey,
      startTimeLocal: next.session.startTimeLocal,
      weekNumbers,
    }),
    heading: [dayWords(next.dateKey), clock].filter(Boolean).join(", "),
    roomChanged: room !== null && room !== group.session.location.trim(),
  };
}

// ---------------------------------------------------------------------------
// The project
// ---------------------------------------------------------------------------

/**
 * The team's project, from the pitch it was made from: the paper (linked
 * when it is one of the pitching week's readings with an address, as the
 * team's group has the week) and the twist. A pitch no longer stored gives
 * the project line the team was made with; a team made from the agenda or by
 * hand has none.
 */
async function projectOf(db: Firestore, run: CourseRunDoc, team: TeamDoc): Promise<TeamProjectView | null> {
  if (team.source.kind !== "pitch") return null;
  const pitchId = team.source.pitchId;
  const pitch = (await pitchesOnRun(db, run.id)).find((each) => each.id === pitchId) ?? null;
  if (!pitch) return team.project ? { line: team.project } : null;
  let paper: { title: string; url: string | null } | null = null;
  if (pitch.paper) {
    let url: string | null = null;
    if (pitch.paper.kind === "reading") {
      const materialId = pitch.paper.materialId;
      const week = await readPitchingWeek(db, run.id);
      const resolved = week ? await resolveWeekDoc(db, run.id, team.groupId, week.weekId) : null;
      const source = resolved?.week ? weekSources(resolved.week).find((each) => each.id === materialId) : undefined;
      url = source?.url && /^https?:\/\//i.test(source.url) ? source.url : null;
    }
    paper = { title: pitch.paper.title, url };
  }
  return { paper, twist: pitch.twist.trim() };
}

// ---------------------------------------------------------------------------
// The hand-in
// ---------------------------------------------------------------------------

/** The hand-in card, as the team page and the lead's reading show it. */
function handInCard(
  run: CourseRunDoc,
  roster: TeamRoster,
  group: CourseGroupDoc,
  team: TeamDoc,
  entry: HandInEntry | null,
  reader: "member" | "staff",
  now: Date,
): HandInCardView {
  const sessions = firstSessions(run, group);
  const { dueOn, showcaseWeek } = run.teamHandIn;
  const showcase = showcaseWeek ? sessions.find((session) => session.weekNumber === showcaseWeek) : undefined;
  const open = handInIsOpen(run, now);
  const savedAt = entry?.updatedAt ?? entry?.handedInAt ?? null;
  return {
    asks: handInAsksWords(dueOn, dueOn ? weekOfDay(sessions, dueOn) : null, TEAM_PAGE_LIMITS.summaryWords),
    showcase:
      showcase && showcase.dateKey
        ? showcaseLineWords(showcase.dateKey, showcase.session.startTimeLocal, placeOf(group, showcase))
        : null,
    open,
    handedIn: entry ? handedInDayWords(saverName(roster, entry.byUid), savedAt ? londonDateKey(savedAt) : "") : null,
    entry:
      reader === "staff" && entry
        ? { url: entry.url, shown: shownAddress(entry.url), summary: entry.summary, whoDidWhat: entry.whoDidWhat }
        : null,
    action:
      reader === "member" && (open || entry)
        ? { href: `/learn/${encodeURIComponent(run.id)}/team/hand-in`, label: handInActionWords(entry !== null, open) }
        : null,
  };
}

// ---------------------------------------------------------------------------
// A team's page
// ---------------------------------------------------------------------------

type PageInput = {
  run: CourseRunDoc;
  roster: TeamRoster;
  group: CourseGroupDoc;
  team: TeamDoc;
  uids: string[];
  programme: RunProgramme | null;
};

async function buildTeamPage(
  db: Firestore,
  input: PageInput,
  reader: { kind: "member"; uid: string } | { kind: "staff"; back: { href: string; label: string; short: string } },
  now: Date,
): Promise<TeamPageView> {
  const { run, roster, group, team, uids, programme } = input;
  const [entries, project] = await Promise.all([entriesOf(db, run, team.id), projectOf(db, run, team)]);
  const sessions = firstSessions(run, group);
  const todayKey = londonDateKey(now);
  const people = peopleOf(roster, uids, reader.kind === "member" ? reader.uid : null);
  const member = reader.kind === "member";

  let checkIn: TeamPageView["checkIn"] = null;
  if (member) {
    const current = resolveGroupCalendar(run, group, now).currentWeek;
    if (current?.phase === "running" && current.weekNumber !== null) {
      const weekNumber = current.weekNumber;
      const saved = checkInsOf(entries).find((entry) => entry.id === checkInEntryId(team.id, weekNumber));
      checkIn = {
        weekNumber,
        did: saved?.did ?? "",
        inTheWay: saved?.inTheWay ?? "",
        canSave: runTakesTeamWriting(run),
      };
    }
  }
  const checkIns: CheckInView[] = member
    ? []
    : checkInsOf(entries)
        .filter((entry) => entry.id === checkInEntryId(team.id, entry.weekNumber))
        .sort((a, b) => b.weekNumber - a.weekNumber)
        .map((entry) => {
          const at = entry.updatedAt ?? entry.createdAt;
          return {
            weekNumber: entry.weekNumber,
            did: entry.did,
            inTheWay: entry.inTheWay,
            savedLine: savedWords(saverName(roster, entry.byUid), at ? londonDateKey(at) : ""),
          };
        });

  const runHome = `/learn/${encodeURIComponent(run.id)}`;
  return {
    runId: run.id,
    teamId: team.id,
    reader: member ? "member" : "staff",
    eyebrow: teamEyebrowWords(programme, run.courseTitle),
    back: member
      ? {
          href: runHome,
          label: run.courseTitle.trim() || programme?.shortName || "Your programme",
          short: programme?.shortName || run.courseTitle.trim() || "Your programme",
        }
      : reader.back,
    name: team.name,
    people,
    headLine: teamHeadLineWords(
      people.map((person) => person.firstName),
      slotWords(group.session.weekday, group.session.startTimeLocal),
      group.session.location,
    ),
    project,
    ticket: member ? ticketOf(run, group, now) : null,
    checkIn,
    checkIns,
    whoLine: teamWhoLine(programme?.leadFirstName ?? null),
    links: linkViews(linksOf(entries)),
    canChangeLinks: member && runTakesTeamWriting(run),
    handIn: handInCard(run, roster, group, team, handInOf(entries, team.id), member ? "member" : "staff", now),
    weeks: teamWeeks(planSlots(run, group, sessions), todayKey),
  };
}

/** A team's page for one of its people, or why it is not theirs. Reads; writes nothing. */
export async function loadTeamPage(
  db: Firestore,
  user: SessionUser,
  runId: string,
  now: Date = new Date(),
): Promise<{ ok: true; view: TeamPageView } | Refusal> {
  const gate = await teamPagePerson(db, user, runId);
  if (!gate.ok) return gate;
  const { person } = gate;
  const programme = await runProgrammeOf(db, person.run.id);
  return {
    ok: true,
    view: await buildTeamPage(db, { ...person, programme }, { kind: "member", uid: user.uid }, now),
  };
}

/** A team's page as the programme's lead and admins read it: every week's check-in, the hand-in's words, nothing to write. */
export async function buildStaffTeamPage(
  db: Firestore,
  roster: TeamRoster,
  team: TeamDoc,
  uids: string[],
  back: { href: string; label: string; short: string },
  now: Date,
): Promise<TeamPageView | null> {
  const group = roster.groups.get(team.groupId);
  if (!group) return null;
  const programme = await runProgrammeOf(db, roster.run.id);
  return buildTeamPage(db, { run: roster.run, roster, group, team, uids, programme }, { kind: "staff", back }, now);
}

// ---------------------------------------------------------------------------
// The hand-in page
// ---------------------------------------------------------------------------

/** The hand-in page for one of a team's people, or why it is not theirs. Reads; writes nothing. */
export async function loadHandInPage(
  db: Firestore,
  user: SessionUser,
  runId: string,
  now: Date = new Date(),
): Promise<{ ok: true; view: HandInPageView } | Refusal> {
  const gate = await teamPagePerson(db, user, runId);
  if (!gate.ok) return gate;
  return { ok: true, view: await handInPageView(db, gate.person, now) };
}

async function handInPageView(db: Firestore, person: TeamPagePerson, now: Date): Promise<HandInPageView> {
  const { run, roster, group, team, uids, user } = person;
  const [programme, entries] = await Promise.all([runProgrammeOf(db, run.id), entriesOf(db, run, team.id)]);
  const entry = handInOf(entries, team.id);
  const sessions = firstSessions(run, group);
  const todayKey = londonDateKey(now);
  const { dueOn, showcaseWeek } = run.teamHandIn;
  const people = peopleOf(roster, uids, user.uid);
  const others = people.filter((each) => each.uid !== user.uid).map((each) => each.firstName);
  const showcase = showcaseWeek ? sessions.find((session) => session.weekNumber === showcaseWeek) : undefined;
  const open = handInIsOpen(run, now);
  const savedAt = entry?.updatedAt ?? entry?.handedInAt ?? null;
  return {
    runId: run.id,
    teamId: team.id,
    eyebrow: handInEyebrowWords(programme, run.courseTitle, dueOn ? weekOfDay(sessions, dueOn) : null),
    title: handInTitleWords(team.name),
    lede: handInLedeWords(
      people.map((each) => each.firstName),
      programme?.leadFirstName ?? null,
    ),
    back: { href: `/learn/${encodeURIComponent(run.id)}/team`, label: team.name },
    url: entry?.url ?? "",
    summary: entry?.summary ?? "",
    whoDidWhat: entry?.whoDidWhat ?? "",
    summaryWords: TEAM_PAGE_LIMITS.summaryWords,
    showcase:
      showcase && showcase.dateKey
        ? {
            dateKey: showcase.dateKey,
            line: showcaseTicketWords(showcase.dateKey === todayKey, showcase.session.startTimeLocal, placeOf(group, showcase)),
            where: showcaseWhereWords(programme?.shortName || run.courseTitle, showcase.weekNumber),
          }
        : null,
    shareLabel: sharedWithWords(others),
    tickFirst: tickFirstWords(others),
    open,
    untilLine: open && dueOn ? changeUntilWords(dueOn, todayKey) : null,
    closedLine: open ? null : !runTakesTeamWriting(run) ? HAND_IN_CLOSED_RUN : dueOn ? handInClosedWords(dueOn) : null,
    handedInLine: entry
      ? handedInWords(
          saverName(roster, entry.byUid),
          savedAt,
          todayKey,
          savedAt ? londonDateKey(savedAt) : "",
          savedAt ? clockOfInstant(savedAt) : "",
        )
      : null,
  };
}

/** "9:04pm", an instant's London wall clock. */
function clockOfInstant(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return clockWords(`${get("hour")}:${get("minute")}`);
}

// ---------------------------------------------------------------------------
// The programme page's card
// ---------------------------------------------------------------------------

/** "Your team" on the programme's page, for somebody in a team they have been told about; null for anybody else. */
export async function teamCardFor(db: Firestore, user: SessionUser, runId: string): Promise<TeamCardView | null> {
  if (!(await namedInATeam(db, runId, user.uid))) return null;
  const gate = await teamPagePerson(db, user, runId);
  if (!gate.ok) return null;
  const { roster, team, uids } = gate.person;
  const others = peopleOf(roster, uids, user.uid)
    .filter((person) => person.uid !== user.uid)
    .map((person) => person.firstName);
  return { line: teamCardWords(team.name, others) };
}

// ---------------------------------------------------------------------------
// For the lead's reading
// ---------------------------------------------------------------------------

/** Every team's hand-in on a run, by team. One equality on the run, so no declared index. */
export async function handInsOnRun(db: Firestore, run: CourseRunDoc): Promise<Map<string, HandInEntry>> {
  const snap = await db.collection(TEAM_ENTRIES_COLLECTION).where("runId", "==", run.id).get();
  const out = new Map<string, HandInEntry>();
  for (const doc of snap.docs) {
    const entry = normalizeTeamEntry(doc.id, doc.data() ?? {});
    if (entry?.kind === "hand-in" && entry.runId === run.id && entry.id === handInEntryId(entry.teamId)) {
      out.set(entry.teamId, entry);
    }
  }
  return out;
}

/** "Handed in by Wen on Thu 18 Feb." or "Not handed in yet.", for the lead's list. */
export function handInStateWords(roster: TeamRoster, entry: HandInEntry | null): string {
  if (!entry) return NOT_HANDED_IN;
  const at = entry.updatedAt ?? entry.handedInAt;
  return handedInDayWords(saverName(roster, entry.byUid), at ? londonDateKey(at) : "");
}

