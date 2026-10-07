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
import { loadFormForStaff, loadTermTally } from "@/lib/applications/editor/load";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { own } from "@/lib/applications/editor/own";
import { projectFormForStaff, type FormStaffView } from "@/lib/applications/editor/views";
import type { ProgrammeTally } from "@/lib/applications/decisions";
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
 * The two things an admin starts from here are the application form and a new
 * programme. Neither is offered to anybody else, and both routes refuse
 * anybody else whatever this page draws.
 */
export default async function TermPage({ params }: { params: Promise<{ roundId: string }> }) {
  const [{ roundId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const loaded = db ? await loadFormForStaff(db, user, roundId) : null;
  if (!db || !loaded) return <NoFormHere />;

  const form = projectFormForStaff(loaded.form, loaded.context);
  const tally = await loadTermTally(db, loaded.form);
  const home = applicationFormPath(form.id);
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
              <Chip tone={form.state.live || form.state.key === "opens" ? "live" : "neutral"} dot={form.state.live}>
                {form.state.label}
              </Chip>
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
            <NewProgrammeButton roundId={form.id} />
          </div>
        )}
      </header>

      <TermSteps form={form} />

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
            const counts = programme.role ? own(tally.programmes, programme.id) : undefined;
            const base = `${home}/programmes/${programme.id}`;
            return (
              <section key={programme.id} className={styles.programme} aria-label={programme.name}>
                <div className={styles.programmeTop}>
                  <div className={kit.mono}>{programme.facts || (programme.kind === "incubator" ? "Incubator" : "Fellowship")}</div>
                  {programme.closed ? (
                    <Chip>Closed</Chip>
                  ) : (
                    <Chip tone={form.state.live || form.state.key === "opens" ? "live" : "neutral"} dot={form.state.live}>
                      {form.state.label}
                    </Chip>
                  )}
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
                {counts ? (
                  <>
                    <ProgrammeCounts counts={counts} />
                    <PlacesBar accepted={counts.accepted} places={programme.places} />
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
                    <Link href={`${base}/applications`} className={shared.btn}>
                      <span>See applications</span>
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
    </ApplicationsRoot>
  );
}

/** The form's own dates, as steps: gone, now, or still to come. */
function TermSteps({ form }: { form: FormStaffView }) {
  const starts = [...new Set(form.programmes.filter((p) => !p.closed && p.starts).map((p) => p.starts))];
  const steps: { label: string; value: string; state: "done" | "now" | "ahead" }[] = [];
  const key = form.state.key;
  // A draft has not begun, so none of its days has been.
  const begun = !form.draft && key !== "archived" && key !== "cancelled";
  if (form.opens) {
    steps.push({
      label: "Applications open",
      value: form.opens.day,
      state: !begun ? "ahead" : key === "opens" ? "now" : "done",
    });
  }
  if (form.closes) {
    steps.push({
      label: "Close",
      value: form.closes.dayAndTime,
      state: !begun || key === "opens" ? "ahead" : key === "open" ? "now" : "done",
    });
  }
  if (form.decisions) {
    steps.push({
      label: "Decisions",
      value: form.decisions.day,
      state: key === "settled" ? "done" : begun && (key === "closed" || key === "deciding") ? "now" : "ahead",
    });
  }
  if (starts.length === 1) {
    steps.push({ label: "Start", value: starts[0], state: key === "settled" ? "now" : "ahead" });
  }
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

function ProgrammeCounts({ counts }: { counts: ProgrammeTally }) {
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
        <strong>{counts.applications}</strong>
      </li>
    </ul>
  );
}

function PlacesBar({ accepted, places }: { accepted: number; places: number | null }) {
  if (places === null || places === 0) {
    return <p className={styles.programmeNote}>Its lead has not said how many places it has.</p>;
  }
  const left = Math.max(0, places - accepted);
  const share = Math.min(100, Math.round((accepted / places) * 100));
  return (
    <div>
      <div className={styles.placesLine}>
        <span>
          {accepted} of {places} places accepted
        </span>
        <span className={styles.placesLeft}>{left === 0 ? "Full" : `${left} left`}</span>
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
