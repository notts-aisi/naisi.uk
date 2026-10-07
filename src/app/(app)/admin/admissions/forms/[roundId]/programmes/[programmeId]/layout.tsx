import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import { Chip } from "@/features/applications/editor/controls";
import ProgrammeTabs from "@/features/applications/editor/ProgrammeTabs";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import styles from "@/features/applications/editor/ProgrammeFrame.module.css";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import { loadProgrammeForStaff } from "@/lib/applications/editor/load";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { formStateFor } from "@/lib/applications/editor/views";
import { formatRunStartShort } from "@/lib/courses/window";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * The head every page of one programme sits under: its name, where the term
 * is, who leads it, and the tabs.
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
  const state = programme.closed
    ? { label: "Closed", live: false, tone: "neutral" as const }
    : (() => {
        const term = formStateFor(form, context.now);
        return {
          label: term.label,
          live: term.live,
          tone: term.live || term.key === "opens" ? ("live" as const) : ("neutral" as const),
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
  if (places) {
    facts.push(
      <span className={styles.metaItem} key="places">
        {places}
      </span>,
    );
  }
  if (hears) {
    facts.push(
      <span className={styles.metaItem} key="hears">
        Everyone hears <strong>{hears}</strong>
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
        groups={programme.groupCount}
        canEdit={role === "admin" || role === "lead"}
      />
      {children}
    </ApplicationsRoot>
  );
}
