import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import { Chip } from "@/features/applications/editor/controls";
import { ArrowRightIcon, CheckIcon, PencilIcon } from "@/features/applications/editor/Icons";
import { NoFormHere } from "@/features/applications/editor/Refusals";
import { NewProgrammeButton, ProgrammeOrderMenu } from "@/features/applications/editor/TermActions";
import shared from "@/features/applications/editor/editor.module.css";
import styles from "@/features/applications/editor/FormHome.module.css";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import kit from "@/features/applications/kit/kit.module.css";
import { AlsoThisTerm, NeedsYou } from "@/features/applications/lifecycle/TermHome";
import { TermState } from "@/features/applications/lifecycle/TermState";
import { loadFormForStaff } from "@/lib/applications/editor/load";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { projectFormForStaff, type FormStaffView } from "@/lib/applications/editor/views";
import { own } from "@/lib/applications/keys";
import { loadReadiness } from "@/lib/applications/lifecycle/load";
import { loadTermNumbers } from "@/lib/applications/lifecycle/loadTermHome";
import {
  closedToNewProgrammes,
  type TermSteps as TermStepStates,
} from "@/lib/applications/lifecycle/status";
import { buildTermHome, type ProgrammeCounts as Counts } from "@/lib/applications/lifecycle/termHome";
import {
  buildLifecycleView,
  wantsReadiness,
  type LifecycleView,
} from "@/lib/applications/lifecycle/view";
import { PROGRAMME_STANDING_LABEL } from "@/lib/applications/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One term's programmes: the form's dates in a strip, then a card for each
 * programme with who leads it and where its applications stand.
 *
 * For anybody with a role on the form. Somebody with none is told there is no
 * form here, whether or not there is one. What each person is shown follows
 * their role: an admin sees every programme's counts, and a lead or a
 * reviewer sees the counts of the programmes they are on and only the name
 * and lead of the others.
 *
 * This is also where the other screens are reached from. "Needs you" has a
 * row for each programme with applications waiting for the person looking,
 * and for an admin the pooled applicants who need an outcome and the line
 * about decision day; "Also this term" leads to the pooled applicants. Every
 * number is the one the screen behind its link works out (`loadTermNumbers`),
 * so a button that says 23 opens a list of 23.
 *
 * The two things an admin starts from here are the application form and a new
 * programme. Neither is offered to anybody else, and both routes refuse
 * anybody else whatever this page draws.
 *
 * Where the form is in its term is said in one sentence under the dates, for
 * everybody. An admin also gets what goes with it: the list of what is left
 * before the form can open, and the careful actions (open applications, close
 * early, reopen, settle the term). The chip, the day marked Now, the sentence
 * and the buttons all come from one reading of the form
 * (`buildLifecycleView`), so they cannot disagree.
 */
export default async function TermPage({ params }: { params: Promise<{ roundId: string }> }) {
  const [{ roundId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const loaded = db ? await loadFormForStaff(db, user, roundId) : null;
  if (!db || !loaded) return <NoFormHere />;

  const form = projectFormForStaff(loaded.form, loaded.context);
  const home = applicationFormPath(form.id);
  const { now } = loaded.context;
  // The list of what is left is only worked out for somebody who can act on
  // it, at a moment the form could be opened.
  const [numbers, readiness] = await Promise.all([
    loadTermNumbers(db, user, loaded.form),
    wantsReadiness(loaded.form, form.canRunTerm, now) ? loadReadiness(db, loaded.form, now) : null,
  ]);
  const lifecycle = buildLifecycleView({
    form: loaded.form,
    readiness,
    canRunTerm: form.canRunTerm,
    sent: form.sent,
    home,
    now,
  });
  const termHome = buildTermHome({
    stage: lifecycle.stage,
    canRunTerm: form.canRunTerm,
    home,
    decisionsDay: form.decisions?.day ?? null,
    programmes: form.programmes,
    work: numbers.work,
    pool: numbers.pool,
  });
  const order = form.programmes.map((programme) => programme.id);

  return (
    <ApplicationsRoot className={shared.page}>
      <nav className={shared.crumb} aria-label="Breadcrumb">
        <Link href="/admin/admissions/forms">Application forms</Link>
      </nav>
      <header className={shared.head}>
        <div className={shared.headMain}>
          <div className={shared.titleRow}>
            <h1 className={shared.title}>Programmes</h1>
            <div className={shared.chips}>
              <StageChip lifecycle={lifecycle} />
            </div>
          </div>
          <p className={shared.lede}>
            {form.label}. Each lead decides their own programme.
            {form.decisions ? ` Everyone hears together on ${form.decisions.day}.` : ""}
          </p>
        </div>
        {form.canRunTerm && (
          <div className={shared.headActions}>
            <Link href={`${home}/form`} className={shared.btn}>
              <PencilIcon />
              <span>Application form</span>
            </Link>
            {/*
              Offered until decision day has gone out. After that a new
              programme could take no applications and would never be
              decided, so the term's page stops offering one. The route that
              adds a programme refuses on the same answer.
            */}
            {closedToNewProgrammes({
              status: loaded.form.round.status,
              archived: loaded.form.round.archived,
              decisionsSentAt: loaded.form.decisionsSentAt,
            }) === null && <NewProgrammeButton roundId={form.id} />}
          </div>
        )}
      </header>

      <TermSteps form={form} states={lifecycle.steps} />
      <TermState roundId={form.id} lifecycle={lifecycle} />
      {termHome.needsYou && <NeedsYou needsYou={termHome.needsYou} />}

      {form.programmes.length === 0 ? (
        <section className={`${shared.card} ${shared.empty}`}>
          <h2 className={shared.cardTitle}>No programmes yet</h2>
          <p className={shared.cardNote}>
            {form.canRunTerm
              ? "Add the fellowships and the incubator this term is running. Each one gets a lead, its places and a question set of its own."
              : "An admin adds the programmes this term is running."}
          </p>
        </section>
      ) : (
        <div className={styles.grid}>
          {form.programmes.map((programme) => {
            // Present only for a programme this person has a role on.
            const card = programme.role ? own(termHome.cards, programme.id) : undefined;
            const base = `${home}/programmes/${programme.id}`;
            return (
              <section key={programme.id} className={styles.programme} aria-label={programme.name}>
                <div className={styles.programmeTop}>
                  <div className={kit.mono}>{programme.facts || (programme.kind === "incubator" ? "Incubator" : "Fellowship")}</div>
                  {programme.closed ? <Chip>Closed</Chip> : <StageChip lifecycle={lifecycle} />}
                </div>
                <h2 className={styles.programmeName}>{programme.name}</h2>
                <div className={styles.lead}>
                  {programme.lead ? (
                    <>
                      <InitialsChip name={programme.lead.name} uid={programme.lead.uid} />
                      <span>
                        <strong>{programme.lead.name}</strong>
                        <span className={styles.leadRole}> · lead{programme.lead.you ? " (you)" : ""}</span>
                      </span>
                    </>
                  ) : (
                    <span className={styles.leadRole}>No lead yet</span>
                  )}
                </div>
                <hr className={styles.rule} />
                {card ? (
                  <>
                    <ProgrammeCounts counts={card.counts} />
                    <PlacesBar held={card.places} places={programme.places} />
                  </>
                ) : (
                  <p className={styles.programmeNote}>
                    {programme.places === null
                      ? "Its lead has not said how many places it has."
                      : `${programme.places} ${programme.places === 1 ? "place" : "places"}.`}{" "}
                    You are not on this programme, so its applications are not yours to read.
                  </p>
                )}
                {programme.role && (
                  <div className={styles.programmeFoot}>
                    <Link href={card?.action.href ?? `${base}/applications`} className={shared.btn}>
                      <span>{card?.action.label ?? "See applications"}</span>
                      <ArrowRightIcon />
                    </Link>
                    {programme.role !== "reviewer" && (
                      <Link href={`${base}/setup`} className={`${shared.btn} ${shared.btnQuiet}`}>
                        Settings
                      </Link>
                    )}
                    {form.canRunTerm && form.programmes.length > 1 && (
                      <ProgrammeOrderMenu
                        roundId={form.id}
                        programmeId={programme.id}
                        name={programme.shortName}
                        order={order}
                      />
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {termHome.pooled && <AlsoThisTerm pooled={termHome.pooled} />}
    </ApplicationsRoot>
  );
}

/** Where the form is in its term, as the one chip that says so. */
function StageChip({ lifecycle }: { lifecycle: LifecycleView }) {
  return (
    <Chip tone={lifecycle.live || lifecycle.stage === "opens-later" ? "live" : "neutral"} dot={lifecycle.live}>
      {lifecycle.title}
    </Chip>
  );
}

/**
 * The form's own dates, as steps: gone, now, or still to come. Which is which
 * is worked out with the rest of the lifecycle (`termStepsFor`), from the
 * form's status, its dates and whether decision day has been sent.
 */
function TermSteps({ form, states }: { form: FormStaffView; states: TermStepStates }) {
  const starts = [...new Set(form.programmes.filter((p) => !p.closed && p.starts).map((p) => p.starts))];
  const steps: { label: string; value: string; state: "done" | "now" | "ahead" }[] = [];
  if (form.opens) steps.push({ label: "Applications open", value: form.opens.day, state: states.opens });
  if (form.closes) steps.push({ label: "Close", value: form.closes.dayAndTime, state: states.closes });
  if (form.decisions) steps.push({ label: "Decisions", value: form.decisions.day, state: states.decisions });
  if (starts.length === 1) steps.push({ label: "Start", value: starts[0], state: states.start });
  if (steps.length === 0) return null;

  return (
    <ol className={styles.steps} aria-label={`${form.label} dates`}>
      {steps.map((step) => (
        <li
          key={step.label}
          className={`${styles.step} ${step.state === "done" ? styles.stepDone : ""} ${step.state === "now" ? styles.stepNow : ""}`}
          aria-current={step.state === "now" ? "step" : undefined}
        >
          <div className={styles.stepHead}>
            <span>{step.label}</span>
            {step.state === "done" && (
              <span className={styles.stepTick} role="img" aria-label="Done">
                <CheckIcon size={16} weight={2.4} />
              </span>
            )}
            {step.state === "now" && (
              <Chip tone="live" dot>
                Now
              </Chip>
            )}
          </div>
          <span className={styles.stepValue}>{step.value}</span>
        </li>
      ))}
    </ol>
  );
}

function ProgrammeCounts({ counts }: { counts: Counts }) {
  const rows: [string, number][] = [
    [PROGRAMME_STANDING_LABEL["to-review"], counts.toReview],
    [PROGRAMME_STANDING_LABEL.accepted, counts.accepted],
    [PROGRAMME_STANDING_LABEL.pooled, counts.pooled],
    [PROGRAMME_STANDING_LABEL.declined, counts.declined],
  ];
  return (
    <ul className={styles.counts}>
      {rows.map(([label, value]) => (
        <li key={label} className={styles.count}>
          <span>{label}</span>
          <strong>{value}</strong>
        </li>
      ))}
      <li className={`${styles.count} ${styles.countTotal}`}>
        <span>Applications</span>
        <strong>{counts.all}</strong>
      </li>
    </ul>
  );
}

/**
 * A programme's places, in the numbers its own list's head shows: who holds a
 * place now (accepted by its lead and still in the term, or here by an
 * invitation they accepted), how many are left, and how many are kept for an
 * invitation nobody has answered yet. Nothing is worked out here.
 */
function PlacesBar({
  held,
  places,
}: {
  held: { placed: number; invited: number; left: number | null };
  places: number | null;
}) {
  if (places === null || places === 0) {
    return <p className={styles.programmeNote}>Its lead has not said how many places it has.</p>;
  }
  const accepted = held.placed;
  const left = held.left ?? 0;
  const share = Math.min(100, Math.round((accepted / places) * 100));
  const kept =
    held.invited > 0
      ? ` · ${held.invited} held for ${held.invited === 1 ? "an invitation" : "invitations"}`
      : "";
  return (
    <div>
      <div className={styles.placesLine}>
        <span>
          {accepted} of {places} places accepted
        </span>
        <span className={styles.placesLeft}>
          {left === 0 && held.invited === 0 ? "Full" : `${left} left`}
          {kept}
        </span>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-label="Places accepted"
        aria-valuenow={share}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.barFill} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}
