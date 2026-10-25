"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import InitialsChip from "@/components/ui/InitialsChip";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import type {
  AgendaRowView,
  PitchTeamRowView,
  TeamCardView,
  TeamPersonView,
  TeamsView,
} from "@/lib/courses/teams/model";
import { emailsWords, inATeamWords, namesInWords, peopleWords } from "@/lib/courses/teams/words";
import styles from "./ProgrammeTeams.module.css";

/**
 * AN INCUBATOR'S TEAMS TAB (boards in-teams, option C, and in-agenda): the
 * pitches or the agenda the teams come from, the teams with each person's
 * "Move to…", and "Tell everyone their team".
 *
 * IT DRAWS WHAT THE SERVER WORKED OUT, and decides nothing: every count,
 * every name and every sentence that depends on a record comes in the view
 * (`TeamsView`, built by `src/lib/applications/handover/teamsLoad.ts`), and
 * each press answers with the view as it stands after it. Moving somebody is
 * a menu of their own group's other teams and "No team", never a drag.
 *
 * Nothing works before the page's script has arrived: the controls are drawn
 * disabled until then (`useHydrated`), so a press is never lost.
 *
 * Every address here is one of this site's own, written from the view's ids.
 */

/** The value of "No team" in a person's menu: never a team's id. */
const NO_TEAM = "~none";

type Answer = { ok: boolean; body: Record<string, unknown> };

async function post(url: string, body: unknown): Promise<Answer> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, body: json };
  } catch {
    return { ok: false, body: { error: "That didn’t reach the site. Check your connection, then try again." } };
  }
}

function errorOf(answer: Answer): string {
  return typeof answer.body.error === "string" ? answer.body.error : "That didn’t work. Reload the page, then try again.";
}

function viewOf(answer: Answer): TeamsView | null {
  const view = answer.body.view;
  return view && typeof view === "object" ? (view as TeamsView) : null;
}

export default function ProgrammeTeams({ view: initial }: { view: TeamsView }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [view, setView] = useState(initial);
  // A new view from the server (a reload, another tab's press) replaces the
  // one on screen (adjusted during render, the RunEditor precedent).
  const [seed, setSeed] = useState(initial);
  if (initial !== seed) {
    setSeed(initial);
    setView(initial);
  }
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const idle = hydrated && !busy;
  const base = `/api/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/teams`;

  async function press(url: string, body: unknown, sayOk: (answer: Answer) => string[]) {
    setBusy(true);
    setProblem(null);
    setSaid([]);
    const answer = await post(url, body);
    const next = viewOf(answer);
    if (answer.ok && next) {
      setView(next);
      setSaid(sayOk(answer));
    } else {
      setProblem(errorOf(answer));
      // A count that moved under the button: read the tab again.
      if (typeof answer.body.emails === "number") router.refresh();
    }
    setBusy(false);
  }

  const act = (body: Record<string, unknown>) =>
    press(base, body, (answer) => (typeof answer.body.said === "string" ? [answer.body.said] : []));

  const sendTest = () =>
    press(`${base}/tell/test`, {}, (answer) => {
      const subject = typeof answer.body.subject === "string" ? answer.body.subject : "";
      if (answer.body.delivery === "sent") return [`A test is on its way to you: “${subject}”.`];
      if (answer.body.delivery === "suppressed") {
        return ["Your address is on the do-not-email list, so the test wasn’t sent. Nothing changes until one reaches you."];
      }
      return ["This copy of the site doesn’t send to your address, so the test was held. Nothing changes until one reaches you."];
    });

  const tellEveryone = () =>
    press(`${base}/tell`, { emails: view.tell.emails }, (answer) =>
      Array.isArray(answer.body.said) ? answer.body.said.filter((line): line is string => typeof line === "string") : [],
    );

  if (view.blank !== null) return null;

  const teamsByGroup = (groupId: string) => view.teams.filter((team) => team.groupId === groupId);

  /** The menu beside one person: their group's other teams, and "No team" when they are in one. */
  function moveMenu(person: TeamPersonView, current: TeamCardView | null) {
    const targets = teamsByGroup(person.groupId).filter((team) => team.id !== current?.id);
    if (targets.length === 0 && !current) return null;
    return (
      <Select
        className={styles.move}
        aria-label={`Move to… (${person.name})`}
        value=""
        disabled={!idle}
        onChange={(event) => {
          const choice = event.target.value;
          if (!choice) return;
          void act({ action: "move", uid: person.uid, teamId: choice === NO_TEAM ? null : choice });
        }}
      >
        <option value="">Move to…</option>
        {targets.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
        {current ? <option value={NO_TEAM}>No team</option> : null}
      </Select>
    );
  }

  function personRow(person: TeamPersonView, current: TeamCardView | null) {
    return (
      <li key={person.uid} className={styles.person}>
        <InitialsChip name={person.name} uid={person.uid} size="md" />
        <div className={styles.personText}>
          <span className={styles.personName}>{person.name}</span>
          {person.ranks && person.ranks.length > 0 ? (
            <span className={styles.ranks}>
              {person.ranks.map((rank) => (
                <span key={rank.place} className={rank.above ? styles.rankAbove : styles.rank}>
                  {rank.place}: {rank.item}
                </span>
              ))}
            </span>
          ) : person.rankedNothing ? (
            <span className={styles.ranks}>
              <span className={styles.rank}>Ranked nothing</span>
            </span>
          ) : null}
        </div>
        {moveMenu(person, current)}
      </li>
    );
  }

  function teamCard(team: TeamCardView) {
    const confirming = removing === team.id;
    return (
      <article key={team.id} className={styles.team} aria-labelledby={`team-${team.id}`}>
        <div className={styles.teamHead}>
          <h3 id={`team-${team.id}`} className={styles.teamName}>
            {team.name}
          </h3>
          <span className={styles.teamCount}>{peopleWords(team.people.length)}</span>
        </div>
        {team.groupName ? <p className={styles.teamGroup}>{team.groupName}</p> : null}
        {team.project ? <p className={styles.project}>{team.project}</p> : null}
        {team.sizeNote ? <p className={styles.sizeNote}>{team.sizeNote}</p> : null}
        {team.people.length > 0 ? (
          <ul className={styles.people}>{team.people.map((person) => personRow(person, team))}</ul>
        ) : (
          <p className={styles.emptyTeam}>Nobody is in this team.</p>
        )}
        <div className={styles.teamActions}>
          {confirming ? (
            <>
              <span className={styles.confirmLine}>Remove {team.name}? Its people go to no team.</span>
              <Button
                variant="danger"
                disabled={!idle}
                onClick={() => {
                  setRemoving(null);
                  void act({ action: "remove", teamId: team.id });
                }}
              >
                Remove
              </Button>
              <Button variant="secondary" disabled={!idle} onClick={() => setRemoving(null)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="ghost" disabled={!idle} onClick={() => setRemoving(team.id)}>
              Remove team
            </Button>
          )}
        </div>
      </article>
    );
  }

  function pitchRow(row: PitchTeamRowView) {
    return (
      <li key={row.id} className={styles.pitch}>
        <div className={styles.pitchHead}>
          <p className={row.state === "not-taken-forward" ? styles.pitchTitleDim : styles.pitchTitle}>{row.title}</p>
          <span className={row.state === "not-taken-forward" ? styles.chipQuiet : styles.chipJoin}>{row.wouldJoinLine}</span>
        </div>
        <div className={styles.pitchMeta}>
          <span>{row.pitchedBy}</span>
          {row.state === "became-a-team" ? <span className={styles.chipOk}>Became a team</span> : null}
          {row.state === "not-taken-forward" ? <span className={styles.chipQuiet}>Not taken forward</span> : null}
          {row.groupName ? <span className={styles.meta}>{row.groupName}</span> : null}
        </div>
        <p className={styles.pitchTwist}>{row.twist}</p>
        {row.state !== "became-a-team" ? (
          <div className={styles.pitchActions}>
            <Button variant="secondary" disabled={!idle} onClick={() => void act({ action: "from-pitch", pitchId: row.id })}>
              Make it a team
            </Button>
          </div>
        ) : null}
      </li>
    );
  }

  function agendaRow(row: AgendaRowView) {
    return (
      <tr key={row.item}>
        <td className={styles.cell}>
          <span className={styles.itemName}>{row.item}</span>
        </td>
        {row.ranked.map((count, place) => (
          <td key={place} className={styles.cell}>
            <span className={styles.tally}>
              <span className={styles.tallyNumber}>{count}</span>
              <span className={styles.dots} aria-hidden="true">
                {Array.from({ length: Math.min(count, 12) }, (_, at) => (
                  <span key={at} className={`${styles.dot} ${styles[`dot${place + 1}`]}`} />
                ))}
              </span>
            </span>
          </td>
        ))}
        <td className={styles.cell}>
          {row.teams.length === 0 ? (
            <span className={styles.muted}>No team</span>
          ) : (
            row.teams.map((team) => (
              <span key={team.id} className={styles.teamCell}>
                <span className={styles.chips}>
                  {team.people.map((person) => (
                    <InitialsChip key={person.uid} name={person.name} uid={person.uid} size="sm" />
                  ))}
                </span>
                <span className={styles.srOnly}>{namesInWords(team.people.map((person) => person.name))}: </span>
                {peopleWords(team.people.length)}
              </span>
            ))
          )}
        </td>
      </tr>
    );
  }

  const runEditor = view.run
    ? `/admin/courses/${encodeURIComponent(view.run.courseId)}/runs/${encodeURIComponent(view.run.id)}`
    : null;

  if (view.madeFrom === null) {
    return (
      <section className={`${styles.card} ${styles.blank}`}>
        <p className={styles.blankText}>
          Nobody has said how {view.programmeName}’s teams are made yet: from the pitches, or from the agenda
          people ranked on the application form. {view.canOpenRunEditor ? "Set it" : "An admin sets it"} in the run
          editor’s Pitching week section.
        </p>
        {view.canOpenRunEditor && runEditor ? (
          <div className={styles.blankActions}>
            <Link href={runEditor} className={styles.linkButton}>
              Open the run editor
            </Link>
          </div>
        ) : null}
      </section>
    );
  }

  const { count, rest } = inATeamWords(view.inATeam, view.takingPart);
  const tell = view.tell;

  const teamsSection = (
    <section className={styles.teams} aria-labelledby="teams-heading">
      <h2 id="teams-heading" className={styles.heading}>
        Teams <span className={styles.headingCount}>({view.teams.length})</span>
      </h2>
      {view.sizes === null ? (
        <p className={styles.note}>
          Set the smallest and largest team in the run editor’s Pitching week section, and teams are made within
          them.
        </p>
      ) : null}
      {view.teams.length === 0 ? (
        <div className={styles.noTeams}>
          <p className={styles.note}>
            {view.madeFrom === "pitches"
              ? "No teams yet. Make a pitch a team with its Make it a team."
              : "No teams yet. They’re made from everybody’s first choices, within the smallest and largest team."}
          </p>
          {view.madeFrom === "agenda" && view.agenda?.found && view.sizes ? (
            <Button disabled={!idle} onClick={() => void act({ action: "from-agenda" })}>
              Make teams from first choices
            </Button>
          ) : null}
        </div>
      ) : (
        <div className={styles.teamGrid}>{view.teams.map(teamCard)}</div>
      )}
      {view.noTeam.length > 0 ? (
        <section className={styles.noTeam} aria-labelledby="no-team-heading">
          <h3 id="no-team-heading" className={styles.teamName}>
            No team <span className={styles.headingCount}>({view.noTeam.length})</span>
          </h3>
          <ul className={styles.people}>{view.noTeam.map((person) => personRow(person, null))}</ul>
        </section>
      ) : null}

      <div className={styles.footer}>
        <p className={styles.footLine}>
          <strong className={styles.footCount}>{count}</strong>
          {rest}
          {view.changeUntil ? ` ${view.changeUntil}` : ""}
        </p>
        <div className={styles.footActions}>
          {tell.emails > 0 ? <span className={styles.emails}>{emailsWords(tell.emails)}</span> : null}
          <Button variant="secondary" disabled={!idle || view.inATeam === 0} onClick={() => void sendTest()}>
            Send a test to me
          </Button>
          <Button disabled={!idle || tell.emails === 0 || !tell.tested} onClick={() => void tellEveryone()}>
            Tell everyone their team
          </Button>
        </div>
        <div className={styles.footNotes}>
          {view.inATeam > 0 && tell.emails === 0 && tell.noAddress.length === 0 ? (
            <p className={styles.note}>Everyone in a team has been told their team.</p>
          ) : null}
          {tell.emails > 0 && !tell.tested ? (
            <p className={styles.note}>Send yourself a test first: it’s the first person’s email, marked as a test.</p>
          ) : null}
          {tell.noAddress.length > 0 ? (
            <p className={styles.warn}>
              {namesInWords(tell.noAddress)} {tell.noAddress.length === 1 ? "has" : "have"} no email address on file,
              so {tell.noAddress.length === 1 ? "isn’t" : "aren’t"} emailed.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      {said.length > 0 ? (
        <div className={styles.said} role="status">
          {said.map((line) => (
            <p key={line} className={styles.saidLine}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}

      {view.madeFrom === "pitches" ? (
        <div className={styles.columns}>
          <section className={`${styles.card} ${styles.pitches}`} aria-labelledby="pitches-heading">
            {view.pitches?.weekNumber ? (
              <>
                <h2 id="pitches-heading" className={styles.heading}>
                  Pitches from week {view.pitches.weekNumber}{" "}
                  <span className={styles.headingCount}>({view.pitches.rows.length})</span>
                </h2>
                {!view.pitches.published ? (
                  <p className={styles.note}>
                    Week {view.pitches.weekNumber} isn’t published yet, so nobody can pitch until it is.
                  </p>
                ) : null}
                {view.pitches.rows.length === 0 ? (
                  <p className={styles.note}>No pitches yet.</p>
                ) : (
                  <ul className={styles.pitchList}>{view.pitches.rows.map(pitchRow)}</ul>
                )}
              </>
            ) : (
              <>
                <h2 id="pitches-heading" className={styles.heading}>
                  Pitches
                </h2>
                <p className={styles.note}>
                  No week of {view.programmeName}’s course run is pitching week. Tick “This is pitching week” in that
                  week’s details in the run editor, and its pitches show here.
                </p>
              </>
            )}
          </section>
          {teamsSection}
        </div>
      ) : (
        <>
          <section className={`${styles.card} ${styles.agenda}`} aria-labelledby="agenda-heading">
            <h2 id="agenda-heading" className={styles.heading}>
              What people ranked
            </h2>
            <p className={styles.sub}>From the form, for the {view.takingPart} taking part.</p>
            {view.agenda?.found ? (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col" className={styles.th}>
                        Agenda item
                      </th>
                      <th scope="col" className={styles.th}>
                        Ranked 1st
                      </th>
                      <th scope="col" className={styles.th}>
                        Ranked 2nd
                      </th>
                      <th scope="col" className={styles.th}>
                        Ranked 3rd
                      </th>
                      <th scope="col" className={styles.th}>
                        Team
                      </th>
                    </tr>
                  </thead>
                  <tbody>{view.agenda.rows.map(agendaRow)}</tbody>
                </table>
              </div>
            ) : (
              <p className={styles.note}>
                The application form asks {view.programmeName}’s applicants to rank nothing, so there is no agenda to
                make teams from.
              </p>
            )}
          </section>
          {teamsSection}
        </>
      )}
    </div>
  );
}
