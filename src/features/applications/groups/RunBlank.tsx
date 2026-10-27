import Link from "next/link";
import shared from "@/features/applications/editor/editor.module.css";
import type { ProgrammeRunView } from "@/lib/applications/handover/programmeRun";

/**
 * A calm sentence in place of a view of the run, when the programme names
 * no run or the one it names is gone. Naming a run is an admin's (the
 * Settings tab's Course run panel, which only an admin is shown), so an
 * admin is sent there and a lead is told who does it.
 */
export default function RunBlank({ view }: { view: Pick<ProgrammeRunView, "roundId" | "programmeId" | "programmeName" | "viewer" | "blank"> }) {
  const name = view.programmeName;
  const admin = view.viewer === "admin";
  const sentence =
    view.blank === "run-gone"
      ? `The course run ${name} names is no longer on the site. ${admin ? "Name another" : "An admin names another"} on the Settings tab, under Course run.`
      : `${name} doesn’t name a course run yet. ${admin ? "Name it" : "An admin names it"} on the Settings tab, under Course run.`;
  return (
    <section className={`${shared.card} ${shared.empty}`}>
      <p className={shared.cardNote}>{sentence}</p>
      {admin && (
        <div className={shared.emptyActions}>
          <Link
            href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/setup`}
            className={shared.btn}
          >
            Go to Settings
          </Link>
        </div>
      )}
    </section>
  );
}
