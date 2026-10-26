import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import { Chip } from "@/features/applications/editor/controls";
import ProgrammeTabs from "@/features/applications/editor/ProgrammeTabs";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import styles from "@/features/applications/editor/ProgrammeFrame.module.css";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import { opensProgrammeGroups } from "@/lib/applications/access";
import { loadProgrammeForStaff } from "@/lib/applications/editor/load";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { readTeamsTab } from "@/lib/applications/handover/teamsLoad";
import { countPlaceHolders } from "@/lib/applications/people/load";
import { stageSummaryFor } from "@/lib/applications/lifecycle/view";
import { readRunEndById } from "@/lib/courses/finishing/record";
import { groupsGoOutDay } from "@/lib/courses/groupsGoOut";
import { readGroupsGoOut } from "@/lib/courses/groupsGoOutRead";
import { readRunHeader } from "@/lib/courses/programmeAttendance";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * The head the tabbed pages of one programme sit under: its name, where the
 * term is, who leads it, and the tabs.
 *
 * WHICH PAGES THAT IS. This file is in a route group, `(tabs)`, which adds
 * nothing to an address. The pages inside the group (Settings, the list of
 * applications, People, Groups with its three views, and Attendance) are
 * drawn under this head. The single application at
 * `applications/[uid]` is OUTSIDE the group on purpose: it is a screen of its
 * own, drawn with no programme head and no tabs, so it must not inherit this
 * layout. A page that should carry the tabs goes inside `(tabs)`; one that
 * should stand alone goes beside it. Either way its address is the same.
 *
 * It is drawn for anybody with a role on the programme: an admin, its lead,
 * or one of its reviewers. Somebody with none is shown "there is no programme
 * here" IN PLACE of the page beneath, whether or not the programme exists,
 * so the page is never rendered for them at all. Each page under here still
 * asks its own question, because what a reviewer may open and what a lead may
 * open are not the same.
 *
 * The dates in the head are the form's own. They are the same for every
 * programme on it.
 *
 * ONCE THE RUN IS UNDER WAY the head says what the wk boards draw under the
 * name: "Running · week 3 of 6", then "31 taking part in 4 groups" and "Last
 * sessions Wed 9 Dec", in place of the term's stage, the places and the day
 * everybody hears. From the run's own records (`readRunHeader`), for the
 * lead and admins, who open the run's tabs; a reviewer keeps the form's line.
 * Before the run's first day the form's line stays.
 *
 * ONCE THE RUN'S LAST SESSION IS OVER the chip reads "Finished · Wed 9 Dec",
 * the day of that session (`readRunEndById`, the moment the lead can say who
 * finished), and the line says how many "took part": the same people the
 * running line counted as taking part.
 *
 * Before the run is under way, the head says "Groups go out Wed 28 Oct" for
 * the lead and admins, from the run's own setting (`groupsGoOutOn`, set on
 * the Groups tab), while that day is today or later.
 *
 * An incubator's head also says "Teams by", the day its run's teams are made
 * (the run's own setting, `readTeamsTab`), as its last fact.
 *
 * The People tab's count is how many hold a place on the programme now
 * (`countPlaceHolders`), worked out for an admin and the lead alone, who are
 * the two the tab opens for, and only once decisions have gone out.
 */
export default async function ProgrammeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const loaded = db ? await loadProgrammeForStaff(db, user, roundId, programmeId) : null;
  if (!loaded) return <NoProgrammeHere roundId={roundId} />;

  const { form, programme, context, role, applications } = loaded;
  const runHeader =
    db && programme.runId && opensProgrammeGroups(role)
      ? await readRunHeader(db, programme.runId, { isAdmin: role === "admin" }, context.now)
      : null;
  // "Finished · Wed 9 Dec" once the last session is over, from the run's own sessions.
  const runEnd = db && runHeader && programme.runId ? await readRunEndById(db, programme.runId, context.now) : null;
  const finishedOn = runEnd?.over ? runEnd.lastDay : null;
  // An incubator's Teams tab and the day its teams are made; null for a fellowship.
  const teamsTab = db ? await readTeamsTab(db, programme) : null;
  // How many hold a place, beside People: for the two who open it.
  const people = db && opensProgrammeGroups(role) ? await countPlaceHolders(db, form, programme.id) : null;
  // Before the run is under way, the day groups go out, for the lead and admins.
  const groupsGoOut =
    db && programme.runId && opensProgrammeGroups(role) && !runHeader
      ? groupsGoOutDay(await readGroupsGoOut(db, programme.runId), londonDateKey(context.now))
      : null;
  const state = finishedOn
    ? { label: `Finished · ${finishedOn}`, live: false, tone: "neutral" as const }
    : runHeader
    ? { label: runHeader.chip, live: runHeader.live, tone: runHeader.live ? ("live" as const) : ("neutral" as const) }
    : programme.closed
    ? { label: "Closed", live: false, tone: "neutral" as const }
    : (() => {
        // The same chip the term's own page draws, so a programme never reads
        // Closed under a term that reads Deciding.
        const term = stageSummaryFor(form, context.now);
        return {
          label: term.title,
          live: term.live,
          tone: term.live || term.stage === "opens-later" ? ("live" as const) : ("neutral" as const),
        };
      })();
  const leadName = programme.leadUid ? (context.names.get(programme.leadUid) ?? null) : null;
  const hears = form.round.decisionsByDate ? formatRunStartShort(form.round.decisionsByDate) : undefined;
  const places =
    programme.places === null
      ? null
      : programme.groupCount === null
        ? `${programme.places} ${programme.places === 1 ? "place" : "places"}`
        : `${programme.places} ${programme.places === 1 ? "place" : "places"} in ${programme.groupCount} ${programme.groupCount === 1 ? "group" : "groups"}`;
  const home = applicationFormPath(form.round.id);

  const facts: React.ReactNode[] = [];
  if (programme.leadUid && leadName) {
    facts.push(
      <span className={styles.metaItem} key="lead">
        <InitialsChip name={leadName} uid={programme.leadUid} size="sm" />
        <span>
          Lead: <strong>{leadName}</strong>
        </span>
      </span>,
    );
  } else {
    facts.push(
      <span className={styles.metaItem} key="lead">
        No lead yet
      </span>,
    );
  }
  if (runHeader && finishedOn) {
    facts.push(
      <span className={styles.metaItem} key="took-part">
        {`${runHeader.takingPart} took part`}
      </span>,
    );
  } else if (runHeader) {
    facts.push(
      <span className={styles.metaItem} key="taking-part">
        {`${runHeader.takingPart} taking part in ${runHeader.groups} ${runHeader.groups === 1 ? "group" : "groups"}`}
      </span>,
    );
    if (runHeader.lastSession) {
      facts.push(
        <span className={styles.metaItem} key="last">
          Last sessions <strong>{runHeader.lastSession}</strong>
        </span>,
      );
    }
  }
  if (places && !runHeader) {
    facts.push(
      <span className={styles.metaItem} key="places">
        {places}
      </span>,
    );
  }
  if (hears && !runHeader) {
    facts.push(
      <span className={styles.metaItem} key="hears">
        Everyone hears <strong>{hears}</strong>
      </span>,
    );
  }
  if (groupsGoOut) {
    facts.push(
      <span className={styles.metaItem} key="groups-go-out">
        Groups go out <strong>{groupsGoOut}</strong>
      </span>,
    );
  }
  if (teamsTab?.teamsBy) {
    facts.push(
      <span className={styles.metaItem} key="teams-by">
        Teams by <strong>{teamsTab.teamsBy}</strong>
      </span>,
    );
  }

  return (
    <ApplicationsRoot className={shared.page}>
      <nav className={shared.crumb} aria-label="Breadcrumb">
        <Link href={home}>Programmes</Link>
      </nav>
      <header className={shared.head}>
        <div className={shared.headMain}>
          <div className={shared.titleRow}>
            <h1 className={shared.title}>{programme.name}</h1>
            <div className={shared.chips}>
              <Chip tone={state.tone} dot={state.live}>
                {state.label}
              </Chip>
            </div>
          </div>
          <div className={styles.meta}>
            {facts.flatMap((fact, at) =>
              at === 0
                ? [fact]
                : [
                    <span className={styles.metaDot} aria-hidden="true" key={`dot-${at}`}>
                      ·
                    </span>,
                    fact,
                  ],
            )}
          </div>
        </div>
      </header>
      <ProgrammeTabs
        base={`${home}/programmes/${programme.id}`}
        applications={applications}
        people={people}
        groups={programme.groupCount}
        canEdit={role === "admin" || role === "lead"}
        groupsOpen={opensProgrammeGroups(role)}
        teams={teamsTab ? { count: teamsTab.count } : null}
      />
      {children}
    </ApplicationsRoot>
  );
}
