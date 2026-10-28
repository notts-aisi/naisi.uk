"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { own } from "@/lib/applications/keys";
import type { ArrangementOptionsView, RingFacilitator, RingGroup, RingOption, RingPerson } from "@/lib/applications/arrange/view";
import styles from "./ArrangeGroups.module.css";

/**
 * Arrange groups, on a programme's Times view, for an admin.
 *
 * Suggest asks the arrangement route for up to five options: the site's own
 * splits of the people into groups by when they are free, ranked by Claude
 * with pros and cons, a reason for each group and a facilitator for each.
 * Each group is a ring: its day, time and programme in the middle, its people
 * around the edge, the facilitator marked. Clicking a person shows what Claude
 * made of their application, links to the application itself, and lets the
 * admin make them a facilitator; clicking another ring then moves them there.
 * Every change is checked on the spot against when each person said they are
 * free, the group's room and its facilitators. The options and every change
 * live on this page and nowhere else.
 *
 * BEFORE DECISION DAY IT IS A PREVIEW, from the decisions as they stand:
 * nobody is on the run yet, so there is nothing to Apply.
 *
 * APPLY USES THE SITE'S OWN ROUTES, in order, and stops at the first refusal:
 * a new group is added (`.../programmes/[id]/groups`), a group with no time is
 * given one (`.../groups/[id]/time`), everybody is placed in one request
 * (`/api/courses/runs/[runId]/allocate`), and each facilitator who offered is
 * added beside the group's own (`/api/courses/groups/[id]/facilitators`).
 * Somebody who did not offer is never made a facilitator here: the page says
 * to ask them, from Groups, Facilitators. Nobody is emailed: telling people
 * their group is still Publish.
 */

type Step = { label: string; ok: boolean; detail?: string };

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const REASON: Record<string, string> = {
  "no-week": "said nothing about when they are free",
  "fits-none": "can make none of these times",
  "no-room": "no room in a group they can make",
};
const POTENTIAL: Record<string, string> = { high: "Strong", medium: "Possible", low: "Unlikely" };

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, data, error: typeof data.error === "string" ? data.error : `It answered ${response.status}.` };
}

/** "Amara Okafor" as a name tag: "Amara O." */
function tagName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

const copyOf = (option: RingOption): RingOption => ({
  ...option,
  groups: option.groups.map((group) => ({
    ...group,
    memberUids: [...group.memberUids],
    facilitators: group.facilitators.map((f) => ({ ...f })),
  })),
});

/** What is wrong with one group as it stands now, a sentence each. */
function warningsFor(group: RingGroup, people: Record<string, RingPerson>, nearUids: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const nameOf = (uid: string) => own(people, uid)?.name ?? "Somebody";
  for (const uid of group.memberUids) {
    if (nearUids.has(uid)) out.push(`${nameOf(uid)} is near their time, not in it: check with them.`);
    else if (!group.canMake.includes(uid)) out.push(`${nameOf(uid)} said they can’t make this time.`);
  }
  if (group.memberUids.length > group.room) out.push(`${group.memberUids.length} people, and room for ${group.room}.`);
  const lead = group.facilitators.find((f) => f.role === "lead");
  const already = group.existing?.facilitatorUids.length ?? 0;
  if (!lead) {
    if (already === 0) out.push("No facilitator.");
  } else if (!lead.offered && !group.facilitators.some((f) => f.role === "second" && f.offered)) {
    out.push(`${nameOf(lead.uid)} didn’t offer to facilitate, and nobody here who did is backing them up.`);
  }
  return out;
}

export default function ArrangeGroups({ roundId, programmeId }: { roundId: string; programmeId: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [view, setView] = useState<ArrangementOptionsView | null>(null);
  const [working, setWorking] = useState<Record<string, RingOption>>({});
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const base = `/api/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;

  const option = active ? (own(working, active) ?? null) : null;
  const people = view?.people ?? {};
  const nearUids = useMemo(() => new Set(option?.nearUids ?? []), [option]);
  const groupOf = (uid: string) => option?.groups.find((group) => group.memberUids.includes(uid)) ?? null;
  const unplaced = option
    ? Object.keys(people)
        .filter((uid) => !option.groups.some((group) => group.memberUids.includes(uid)))
        .sort((a, b) => (own(people, a)?.name ?? "").localeCompare(own(people, b)?.name ?? ""))
    : [];
  const reasonOf = (uid: string) => option?.unplaced.find((entry) => entry.uid === uid)?.reason ?? null;
  const busy = !hydrated || asking || applying;

  const suggest = async (askClaude: boolean) => {
    setAsking(true);
    setError(null);
    setSteps([]);
    setSelected(null);
    try {
      const answer = await send(`${base}/arrangement`, "POST", { askClaude });
      if (!answer.ok) {
        setError(answer.error);
        return;
      }
      const next = answer.data.arrangement as ArrangementOptionsView;
      setView(next);
      setWorking(Object.fromEntries(next.options.map((each) => [each.key, copyOf(each)])));
      setActive(next.options.find((each) => each.preferred)?.key ?? next.options[0]?.key ?? null);
    } catch {
      setError("That couldn’t be sent. Check your connection and try again.");
    } finally {
      setAsking(false);
    }
  };

  /** Change the option on screen, never the one Claude sent. */
  const change = (edit: (draft: RingOption) => void) => {
    if (!option) return;
    const draft = copyOf(option);
    edit(draft);
    setWorking({ ...working, [draft.key]: draft });
    setSteps([]);
  };

  const moveTo = (uid: string, key: string | null) =>
    change((draft) => {
      for (const group of draft.groups) {
        if (!group.memberUids.includes(uid)) continue;
        group.memberUids = group.memberUids.filter((each) => each !== uid);
        // A facilitator sits in the group they facilitate.
        group.facilitators = group.facilitators.filter((f) => f.uid !== uid);
      }
      const target = key ? draft.groups.find((group) => group.key === key) : undefined;
      if (target) target.memberUids.push(uid);
    });

  const setRole = (uid: string, role: RingFacilitator["role"] | null) =>
    change((draft) => {
      const group = draft.groups.find((each) => each.memberUids.includes(uid));
      if (!group) return;
      group.facilitators = group.facilitators.filter((f) => f.uid !== uid && (role === null || f.role !== role));
      if (role) {
        const person = own(people, uid);
        group.facilitators.push({ uid, role, offered: person?.offered ?? false, why: "", bySite: false });
        group.facilitators.sort((a, b) => (a.role === b.role ? 0 : a.role === "lead" ? -1 : 1));
      }
    });

  const reset = () => {
    const sent = view?.options.find((each) => each.key === active);
    if (sent) setWorking({ ...working, [sent.key]: copyOf(sent) });
    setSelected(null);
    setSteps([]);
  };

  const apply = async () => {
    if (!option || !view || view.preview || !view.runId) return;
    setApplying(true);
    setError(null);
    const done: Step[] = [];
    const note = (step: Step) => {
      done.push(step);
      setSteps([...done]);
      return step.ok;
    };
    try {
      // 1 and 2: every group has an id and a time.
      const ids: string[] = [];
      for (const group of option.groups) {
        const start = group.session.startTimeLocal;
        if (group.id === null) {
          const made = await send(`${base}/groups`, "POST", {
            name: group.name,
            weekday: group.session.weekday,
            start,
            minutes: group.session.durationMinutes,
            places: group.room,
          });
          const id = typeof made.data.groupId === "string" ? made.data.groupId : null;
          if (!note({ label: `Add ${group.name}`, ok: made.ok && id !== null, detail: made.ok ? undefined : made.error })) return;
          ids.push(id!);
          continue;
        }
        if (group.timeIsNew && group.existing) {
          const timed = await send(`${base}/groups/${encodeURIComponent(group.id)}/time`, "PUT", {
            weekday: group.session.weekday,
            start,
            from: group.existing.slot,
          });
          if (!note({ label: `Give ${group.name} its time`, ok: timed.ok, detail: timed.ok ? undefined : timed.error })) return;
        }
        ids.push(group.id);
      }

      // 3: everybody placed, in one request.
      const placements = option.groups.flatMap((group, index) => group.memberUids.map((uid) => ({ uid, groupId: ids[index] })));
      const placed = await send(`/api/courses/runs/${encodeURIComponent(view.runId)}/allocate`, "POST", { placements });
      const rejected = Array.isArray(placed.data.rejected) ? (placed.data.rejected as { reason?: string }[]) : [];
      if (
        !note({
          label: `Place ${placements.length} people`,
          ok: placed.ok && rejected.length === 0,
          detail: !placed.ok
            ? placed.error
            : rejected.length > 0
              ? `${rejected.length} could not be placed (${[...new Set(rejected.map((r) => r.reason))].join(", ")}). If it says not-accepted, hand everybody over to the run first.`
              : undefined,
        })
      ) return;

      // 4: each facilitator who offered, beside the group's own.
      const toAsk: string[] = [];
      for (const [index, group] of option.groups.entries()) {
        for (const f of group.facilitators.filter((each) => !each.offered)) toAsk.push(`${own(people, f.uid)?.name ?? "Somebody"} for ${group.name}`);
        const offered = group.facilitators.filter((each) => each.offered).map((each) => each.uid);
        if (offered.length === 0) continue;
        const uids = [...new Set([...(group.existing?.facilitatorUids ?? []), ...offered])];
        const staffed = await send(`/api/courses/groups/${encodeURIComponent(ids[index])}/facilitators`, "POST", { uids });
        const names = offered.map((uid) => own(people, uid)?.name ?? "Somebody").join(" and ");
        if (!note({ label: `${names} ${offered.length === 1 ? "facilitates" : "facilitate"} ${group.name}`, ok: staffed.ok, detail: staffed.ok ? undefined : staffed.error })) return;
      }
      if (toAsk.length > 0) {
        note({
          label: `Still to ask, because they didn’t offer: ${toAsk.join("; ")}. Ask them from Groups, Facilitators, under “Didn’t offer, but worth asking”.`,
          ok: true,
        });
      }
      note({ label: "Done. Nobody has been emailed: Publish tells people their group.", ok: true });
      router.refresh();
    } catch {
      note({ label: "That couldn’t be sent. Check your connection; what is ticked above was saved.", ok: false });
    } finally {
      setApplying(false);
    }
  };

  const chosen = selected ? (own(people, selected) ?? null) : null;
  const chosenGroup = selected ? groupOf(selected) : null;
  const chosenRole = chosenGroup?.facilitators.find((f) => f.uid === selected)?.role ?? null;

  const ring = (group: RingGroup) => {
    const n = group.memberUids.length;
    const warnings = warningsFor(group, people, nearUids);
    const canMove = selected !== null && !group.memberUids.includes(selected);
    const selectedFits = selected !== null && group.canMake.includes(selected);
    return (
      <div key={group.key} className={styles.ringCard}>
        <div className={`${styles.ring} ${warnings.length > 0 ? styles.ringWarn : ""}`}>
          <div className={styles.circle} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.centre} ${canMove ? styles.centreTarget : ""}`}
            disabled={busy || !canMove}
            onClick={() => selected && moveTo(selected, group.key)}
            aria-label={canMove && chosen ? `Move ${chosen.name} to ${group.name}` : `${group.name}, ${DAY[group.session.weekday]} ${group.session.startTimeLocal}`}
          >
            <span className={styles.when}>
              {DAY[group.session.weekday]} {group.session.startTimeLocal}
            </span>
            <span className={styles.centreLine}>
              {group.session.durationMinutes} min · {view?.programmeShortName}
            </span>
            <span className={styles.centreLine}>
              {group.name} · {n} of {group.room}
              {group.id === null ? " · new" : group.timeIsNew ? " · new time" : ""}
            </span>
            {canMove ? (
              <span className={selectedFits ? styles.moveHint : styles.moveHintWarn}>
                {selectedFits ? "Move here" : "Move here (can’t make it)"}
              </span>
            ) : null}
          </button>
          {group.memberUids.map((uid, i) => {
            const person = own(people, uid);
            const angle = ((-90 + (360 * i) / Math.max(n, 1)) * Math.PI) / 180;
            const role = group.facilitators.find((f) => f.uid === uid)?.role ?? null;
            const off = nearUids.has(uid) || !group.canMake.includes(uid);
            return (
              <button
                key={uid}
                type="button"
                className={[
                  styles.chip,
                  role === "lead" ? styles.chipLead : "",
                  role === "second" ? styles.chipSecond : "",
                  off ? styles.chipOff : "",
                  selected === uid ? styles.chipSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` }}
                disabled={!hydrated || applying}
                aria-pressed={selected === uid}
                title={person?.name}
                onClick={() => setSelected(selected === uid ? null : uid)}
              >
                {role === "lead" ? <span className={styles.chipRole}>Lead</span> : null}
                {role === "second" ? <span className={styles.chipRole}>Back-up</span> : null}
                <span>{tagName(person?.name ?? "?")}</span>
                {person?.flags ? <span className={styles.chipFlag} aria-label="Pangram flagged answers">!</span> : null}
              </button>
            );
          })}
        </div>
        {group.existing && group.existing.facilitatorNames.length > 0 ? (
          <p className={styles.facilitatorWhy}>
            Facilitating now, on the run: <strong>{group.existing.facilitatorNames.join(" and ")}</strong>
          </p>
        ) : null}
        {group.why ? <p className={styles.why}>{group.why}</p> : null}
        {group.facilitators.map((f) =>
          f.why ? (
            <p key={f.uid} className={styles.facilitatorWhy}>
              <strong>{own(people, f.uid)?.name}</strong> {f.role === "lead" ? "leads" : "backs up"}: {f.why}
            </p>
          ) : null,
        )}
        {warnings.length > 0 ? (
          <ul className={styles.warnings}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  return (
    <section className={styles.panel} aria-label="Arrange groups">
      <div className={styles.head}>
        <h2 className={styles.title}>Arrange groups</h2>
        <p className={styles.line}>
          The site works out several ways to split the people into groups by when they’re free, and spreads the people who
          offered to facilitate so each group has one. Claude then ranks up to five, with pros and cons, says why each
          group’s people suit each other, and picks a facilitator for each, looking for people who might help run the
          society one day. Click a person to see their application and make them a facilitator, then click another ring to
          move them. Pangram flags are shown for you to weigh; they don’t count against anybody. Only admins see this, and
          nothing is saved until you press Apply.
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={busy} onClick={() => void suggest(true)}>
          {asking ? "Working it out…" : view ? "Suggest again" : "Suggest options with Claude"}
        </button>
        <button type="button" className={styles.quiet} disabled={busy} onClick={() => void suggest(false)}>
          Times only, without Claude
        </button>
        {asking ? <span className={styles.line}>Claude takes a minute or two.</span> : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {view ? (
        <div className={styles.result} aria-live="polite">
          {view.preview ? (
            <p className={styles.preview}>
              A preview, from the decisions as they stand. Places can still change before decision day, and nobody is on
              the run yet, so there is nothing to apply until decisions have gone out.
            </p>
          ) : null}
          {view.options.length === 0 ? (
            <p className={styles.line}>
              {Object.keys(view.people).length === 0
                ? "Nobody to arrange yet: nobody holds a place on this programme."
                : "No group time could be worked out: the people here who marked a real week have no time in common, or everybody marked under 4 hours. Give a group a time above, then suggest again."}
            </p>
          ) : null}
          {view.preferredWhy ? <p className={styles.notes}>{view.preferredWhy}</p> : null}
          {view.notes ? <p className={styles.line}>{view.notes}</p> : null}

          {view.options.length > 0 ? (
            <div className={styles.tabs} role="tablist" aria-label="Options">
              {view.options.map((each) => (
                <button
                  key={each.key}
                  type="button"
                  role="tab"
                  aria-selected={each.key === active}
                  className={`${styles.tab} ${each.key === active ? styles.tabOn : ""}`}
                  onClick={() => {
                    setActive(each.key);
                    setSelected(null);
                    setSteps([]);
                  }}
                >
                  <span className={styles.tabKey}>Option {each.key}</span>
                  {each.title ? <span className={styles.tabTitle}>{each.title}</span> : null}
                  {each.preferred && view.asked ? <span className={styles.badge}>Claude’s pick</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {option ? (
            <>
              {option.pros.length > 0 || option.cons.length > 0 ? (
                <div className={styles.proscons}>
                  <div>
                    <strong className={styles.label}>For</strong>
                    <ul className={styles.list}>
                      {option.pros.map((pro) => (
                        <li key={pro}>{pro}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong className={styles.label}>Against</strong>
                    <ul className={styles.list}>
                      {option.cons.map((con) => (
                        <li key={con}>{con}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className={styles.board}>
                <div className={styles.rings}>{option.groups.map(ring)}</div>

                <aside className={styles.side} aria-label="The person you picked">
                  {chosen ? (
                    <div className={styles.person}>
                      <div className={styles.personHead}>
                        <strong>{chosen.name}</strong>
                        <a className={styles.link} href={chosen.href} target="_blank" rel="noreferrer">
                          Open their application
                        </a>
                      </div>
                      <p className={styles.line}>
                        {chosen.offered ? "Offered to facilitate." : "Didn’t offer to facilitate."}
                        {chosen.told ? " Already told their group, so Apply leaves them in it." : ""}
                        {chosen.littleMarked ? " Marked under 4 hours in the week." : ""}
                      </p>
                      {chosen.potential ? (
                        <p className={styles.line}>
                          <strong>As a facilitator: {own(POTENTIAL, chosen.potential.level) ?? chosen.potential.level}.</strong>{" "}
                          {chosen.potential.why}
                        </p>
                      ) : null}
                      <p className={chosen.flags ? styles.flagLine : styles.line}>
                        {chosen.flags === null
                          ? "Pangram: not checked."
                          : chosen.flags === 0
                            ? "Pangram: nothing flagged."
                            : `Pangram: ${chosen.flags} ${chosen.flags === 1 ? "answer" : "answers"} worth a look. Read them before deciding; a flag is never a finding on its own.`}
                      </p>
                      {chosen.read ? (
                        <div className={styles.read}>
                          <p className={styles.line}>
                            {chosen.read.lean ? <strong>Claude’s lean: {chosen.read.lean}. </strong> : null}
                            {chosen.read.summary}
                          </p>
                          {chosen.read.strengths.length > 0 ? (
                            <p className={styles.line}>Strengths: {chosen.read.strengths.join("; ")}.</p>
                          ) : null}
                          {chosen.read.concerns.length > 0 ? (
                            <p className={styles.line}>Concerns: {chosen.read.concerns.join("; ")}.</p>
                          ) : null}
                          {chosen.read.thin > 0 ? (
                            <p className={styles.line}>
                              {chosen.read.thin} {chosen.read.thin === 1 ? "answer" : "answers"} thin or brief.
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className={styles.line}>Claude hasn’t read their application.</p>
                      )}
                      <p className={styles.line}>
                        {chosenGroup
                          ? `In ${chosenGroup.name}. Click another ring to move them there.`
                          : "Not in a group. Click a ring to put them in it."}
                      </p>
                      <div className={styles.personActions}>
                        {chosenGroup ? (
                          <>
                            <button type="button" className={styles.small} disabled={busy || chosenRole === "lead"} onClick={() => setRole(selected!, "lead")}>
                              Make lead
                            </button>
                            <button type="button" className={styles.small} disabled={busy || chosenRole === "second"} onClick={() => setRole(selected!, "second")}>
                              Make back-up
                            </button>
                            {chosenRole ? (
                              <button type="button" className={styles.small} disabled={busy} onClick={() => setRole(selected!, null)}>
                                Not a facilitator
                              </button>
                            ) : null}
                            <button type="button" className={styles.small} disabled={busy} onClick={() => moveTo(selected!, null)}>
                              Take out of groups
                            </button>
                          </>
                        ) : null}
                        <button type="button" className={styles.smallQuiet} onClick={() => setSelected(null)}>
                          Done
                        </button>
                      </div>
                      {!chosen.offered && chosenRole ? (
                        <p className={styles.flagLine}>
                          They didn’t offer, so Apply won’t make them a facilitator: ask them from Groups, Facilitators.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className={styles.line}>
                      Click a person to see what Claude made of their application, make them a facilitator, or move them.
                      Lead and Back-up mark the facilitators; a red tag is somebody who can’t make that time, and “!” is a
                      Pangram flag.
                    </p>
                  )}
                </aside>
              </div>

              {unplaced.length > 0 ? (
                <div className={styles.unplaced}>
                  <strong>Not in a group ({unplaced.length})</strong>
                  <div className={styles.tray}>
                    {unplaced.map((uid) => (
                      <button
                        key={uid}
                        type="button"
                        className={`${styles.trayChip} ${selected === uid ? styles.chipSelected : ""}`}
                        aria-pressed={selected === uid}
                        disabled={!hydrated || applying}
                        onClick={() => setSelected(selected === uid ? null : uid)}
                      >
                        {own(people, uid)?.name}
                        {reasonOf(uid) ? <span className={styles.trayWhy}> · {own(REASON, reasonOf(uid)!) ?? ""}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {view.dropped.length > 0 ? (
                <details className={styles.dropped}>
                  <summary>Claude suggestions that didn’t fit ({view.dropped.length})</summary>
                  <ul className={styles.list}>
                    {view.dropped.map((entry, i) => (
                      <li key={i}>
                        {entry.suggestion}: {entry.why}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className={styles.actions}>
                {view.preview || !view.runId ? (
                  <span className={styles.line}>Apply opens once decisions have gone out and people are on the run.</span>
                ) : (
                  <>
                    <button type="button" className={styles.button} disabled={busy} onClick={() => void apply()}>
                      {applying ? "Applying…" : `Apply option ${option.key}`}
                    </button>
                    <span className={styles.line}>Adds groups, places people and adds facilitators who offered. Nobody is emailed.</span>
                  </>
                )}
                <button type="button" className={styles.quiet} disabled={busy} onClick={reset}>
                  Undo my changes to option {option.key}
                </button>
              </div>
              {steps.length > 0 ? (
                <ol className={styles.steps}>
                  {steps.map((step, i) => (
                    <li key={i} className={step.ok ? styles.stepOk : styles.stepFailed}>
                      {step.ok ? "✓" : "✗"} {step.label}
                      {step.detail ? <span className={styles.line}> · {step.detail}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
