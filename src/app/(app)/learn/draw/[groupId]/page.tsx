import Link from "next/link";
import { redirect } from "next/navigation";
import DrawEditor from "@/features/courses/packsAndCases/DrawEditor";
import DrawWeekPicker from "@/features/courses/packsAndCases/DrawWeekPicker";
import styles from "@/features/courses/packsAndCases/packsAndCases.module.css";
import facilitator from "@/features/courses/facilitator/facilitator.module.css";
import weekly from "@/features/courses/weekly/weekly.module.css";
import NotForYou from "@/features/courses/facilitator/NotForYou";
import { getSessionUser } from "@/features/courses/runAccess";
import { isAddressableId } from "@/lib/addressableId";
import { drawTalkOf, hasDraw } from "@/lib/courses/packsAndCases/model";
import { drawClosed, drawGate, readDrawRoster, readDrawState, readDrawWeeks } from "@/lib/courses/packsAndCases/readers";
import {
  CASE,
  DRAW_LEDE,
  WEEK_NOW,
  backToWords,
  drawEyebrowWords,
  drawFootWords,
  drawHoldingWords,
  drawTitleWords,
  drawWeekOptionWords,
  givingWeeksWords,
  handOutCalledOffWords,
  noSessionBeforeWords,
  nothingGivenOutWords,
  sessionsFinishedWords,
  setBeforeWords,
  weekMetWords,
} from "@/lib/courses/packsAndCases/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { closedWords } from "@/lib/courses/weekWork/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * THE DRAW, TYPED IN: at the
 * end of a session a facilitator hands out next week's packs and cases on
 * paper, then copies the slips in here; swaps go through them too. One row
 * per person in the group (its people taking part and its facilitators, who
 * take part too), each with the Choose one's select ("Pathway") and the
 * case's ("Case"), whose list offers only that pathway's cases and never a
 * case with a content note. "Swap two people" swaps two rows. Save writes
 * what changed (`/api/courses/groups/[groupId]/draw`); nobody is emailed.
 *
 * WHICH WEEK: `?week=3`, any week, or else the week the slips being handed
 * out are for (`drawWeekRule`, through `readDrawWeeks`: the one rule the
 * route and the group page's card ask too), so from the start of the session
 * that hands them out the page is about next week, never that session's own.
 * The Week picker lists every week of the course that gives something out,
 * past ones too, each by its number and what it gives out.
 *
 * WHAT IT SAYS ABOUT THE WEEK, over the people: "Copy in the slips you
 * handed out tonight." on the hand-out night only; before the hand-out
 * session, when the slips go out; which session they go out at when the one
 * before the week is called off; and, before any change, that this is the
 * week people are working on now or a week that has met, where Save first
 * asks "Changing a case takes back that person’s Ready for my talk." (the
 * route refuses the save without that yes). Once every session has ended it
 * says so; once the programme has closed for work (`workClosesAt`) the page
 * is read only, with the members' own sentence, and the route refuses a save.
 *
 * WHO (`drawGate`, the route's own gate, restated because a page's only
 * protection must not be a level above it): the group's live facilitators,
 * the lead of the programme that names the run, and admins. Everybody else
 * signed in is given one calm page (`NotForYou`), the same bytes for a real
 * group that is not theirs, an archived one and an id that names nothing, so
 * it never says whether the group exists: never a redirect, and never
 * `notFound()`, which answers an empty body in a page that matched its route.
 * Its sentence names the lead, because this page admits the lead. Somebody
 * the page does admit (an admin anywhere; the group's facilitator or the lead
 * once `drawGate` has let them in) at an address it cannot open (an archived
 * group, a closing run, an id that names nothing) is given its fixed "can't
 * be opened" answer instead, decided from what the gate already read. Signed
 * out still goes to sign in.
 *
 * A STATIC SEGMENT UNDER /learn, not `/learn/[runId]/...`, whose layout sends
 * away a programme's lead who holds no role on the run (as the facilitator
 * material's pages are). The group page links here for its facilitators; the
 * lead opens it by its address until the programme's Groups tab links it.
 */

export const dynamic = "force-dynamic";

export default async function DrawPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const [{ groupId }, query] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/learn/draw/${groupId}`)}`);
  // An admin is admitted to every group, so is never told the page is not
  // theirs: the fixed "can’t be opened" answer instead. Asked of the session
  // already read, so it costs no read.
  const admin = user.role === "admin";
  if (!isAddressableId(groupId)) return <NotForYou page="draw" admitted={admin} />;

  const db = getAdminDb();
  if (!db) return <NotForYou page="draw" admitted={admin} />;

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) return <NotForYou page="draw" admitted={admin} />;
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  const gate = await drawGate(db, user, group);
  if (!gate.ok) return <NotForYou page="draw" />;
  // From here the gate has admitted the caller: never "not for your account".
  if (group.archived) return <NotForYou page="draw" admitted />;

  const runSnap = group.runId ? await db.collection("courseRuns").doc(group.runId).get() : null;
  if (!runSnap?.exists || (runSnap.data() ?? {}).destroying === true) return <NotForYou page="draw" admitted />;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});

  // The people, when the programme closes, and every week of the course with the week the slips are for.
  const now = new Date();
  const roster = await readDrawRoster(db, run.id, group, { isAdmin: gate.isAdmin }, now);
  if (!roster) return <NotForYou page="draw" admitted />;
  const { people, closesAt } = roster;
  const course = await readDrawWeeks(db, { run, group, people, now });
  const asked = typeof query.week === "string" && /^\d{1,2}$/.test(query.week) ? Number(query.week) : 0;
  const weekNumber = asked >= 1 && asked <= 60 ? asked : (course.rule.weekNumber ?? course.fallbackWeek);
  const week = course.weeks.get(weekNumber) ?? null;
  const gives = week !== null && hasDraw(week.draw);
  const state = week && gives ? (course.states.get(weekNumber) ?? (await readDrawState(db, run.id, week, people))) : new Map();
  const facts = gives ? (course.rule.facts.get(weekNumber) ?? null) : null;
  const closed = closesAt !== null && drawClosed(closesAt, now);

  const groupName = group.name.trim() || "Group";
  // A facilitator and an admin go back to the group's page; a lead to their programme's Groups.
  const back =
    gate.facilitates || gate.isAdmin || !gate.leadOf
      ? { href: `/learn/${encodeURIComponent(run.id)}/group/${encodeURIComponent(groupId)}`, label: groupName }
      : {
          href: `/admin/admissions/forms/${encodeURIComponent(gate.leadOf.roundId)}/programmes/${encodeURIComponent(gate.leadOf.programmeId)}/groups`,
          label: "Groups",
        };

  const draw = week?.draw ?? { packs: [], cases: [] };
  // What the course gives out, for a week that gives nothing: the first week that does, or the week's number.
  const courseDraw = course.giving[0]?.draw ?? null;
  const title = gives ? drawTitleWords(draw) : courseDraw ? drawTitleWords(courseDraw) : `Week ${weekNumber}`;
  // The session the slips go out at: the rule's, once the week has a date; with no dates, the session before it.
  const handOutSession = facts?.startsAt ? (facts.handOut?.session.weekNumber ?? null) : weekNumber >= 2 ? weekNumber - 1 : null;

  // The Week picker: every week that gives something out, and the week shown when it gives nothing.
  const givingNumbers = course.giving.map((each) => each.weekNumber);
  const options = course.giving.map((each) => ({ weekNumber: each.weekNumber, label: drawWeekOptionWords(each.weekNumber, each.draw) }));
  if (!givingNumbers.includes(weekNumber)) {
    options.push({ weekNumber, label: drawWeekOptionWords(weekNumber, gives ? draw : null) });
    options.sort((a, b) => a.weekNumber - b.weekNumber);
  }
  const hint = givingWeeksWords(
    givingNumbers,
    course.taught.filter((n) => !givingNumbers.includes(n)),
  );

  // What the page says about the week, over the people.
  const lines: Array<{ text: string; warn?: boolean }> = [];
  if (course.finished) lines.push({ text: sessionsFinishedWords(groupName) });
  if (closed && closesAt) lines.push({ text: closedWords(closesAt) });
  if (gives && facts && !closed) {
    if (facts.calledOff) {
      lines.push({ text: handOutCalledOffWords(weekNumber, facts.calledOff.weekNumber, facts.handOut?.session.weekNumber ?? null) });
    }
    if (facts.standing === "ahead") {
      if (facts.handOutNight) lines.push({ text: DRAW_LEDE });
      else if (facts.handOut && now.getTime() < facts.handOut.startsAt.getTime()) {
        lines.push({ text: setBeforeWords(weekNumber, { dateKey: facts.handOut.session.dateKey, startsAt: facts.handOut.startsAt }, londonDateKey(now)) });
      } else if (!facts.handOut && facts.startsAt && !facts.calledOff) lines.push({ text: noSessionBeforeWords(weekNumber) });
    } else if (facts.standing === "now") {
      lines.push({ text: WEEK_NOW, warn: true });
    } else if (facts.startsAt) {
      lines.push({ text: weekMetWords(facts.startsAt, facts.startsCalledOff), warn: true });
    }
  }

  return (
    // The page is the facilitator pages' size container, at the width the
    // shell gives it, so the phone's bar and the laptop's breadcrumb switch
    // where the group page's do; the draw itself keeps to a column inside it.
    <div className={facilitator.page}>
      <div className={`${weekly.bar} ${facilitator.phoneBar}`}>
        <div className={weekly.barStart}>
          <Link href={back.href} className={weekly.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={weekly.icon}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>{back.label}</span>
          </Link>
        </div>
        <div className={weekly.barTitle}>{title}</div>
        <div className={weekly.barEnd} />
      </div>

      <div className={styles.drawPage}>
        <header className={styles.drawHead}>
          <Link href={back.href} className={`${facilitator.crumb} ${facilitator.crumbDesk}`}>
            {back.label}
          </Link>
          <p className={styles.drawEyebrow}>{drawEyebrowWords(groupName, handOutSession)}</p>
          <h1 className={styles.drawTitle}>{title}</h1>
          {givingNumbers.length > 0 ? (
            <DrawWeekPicker groupId={groupId} options={options} current={weekNumber} hint={hint} />
          ) : null}
          {lines.map((line) => (
            <p key={line.text} className={line.warn ? styles.drawWarn : styles.drawLede}>
              {line.text}
            </p>
          ))}
        </header>

        {week && gives ? (
          <DrawEditor
            // A week of its own each: opening another week starts its editor afresh.
            key={week.weekId}
            groupId={groupId}
            weekId={week.weekId}
            people={people.map((person) => ({ uid: person.uid, name: person.name, firstName: person.firstName }))}
            packs={draw.packs.map((chooseOne) => ({
              id: chooseOne.id,
              title: chooseOne.title.trim() || "Pack",
              packs: chooseOne.packs.map((pack) => ({ id: pack.id, name: pack.name })),
            }))}
            talks={draw.cases.map((talk) => drawTalkOf(week.blocks, talk))}
            caseLabel={CASE}
            initial={Object.fromEntries(people.map((person) => [person.uid, state.get(person.uid) ?? { packs: {}, cases: {} }]))}
            foot={drawFootWords(weekNumber)}
            weekNumber={weekNumber}
            holding={drawHoldingWords(draw)}
            late={facts !== null && facts.standing !== "ahead"}
            readOnly={closed}
          />
        ) : (
          <>
            <p className={weekly.cardLine}>{nothingGivenOutWords(weekNumber)}</p>
            <Link href={back.href} className={weekly.cardLink}>
              {backToWords(back.label)}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
