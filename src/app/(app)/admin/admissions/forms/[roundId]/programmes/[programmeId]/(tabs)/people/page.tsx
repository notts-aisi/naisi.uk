import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import ProgrammePeople from "@/features/applications/people/ProgrammePeople";
import { loadProgrammePeople } from "@/lib/applications/people/load";
import { NOT_YOURS_TITLE, NOT_YOURS_WHY, notSentWords } from "@/lib/applications/people/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's People tab (board st-people): everyone who holds a place on
 * it or gave it back, with their group, their reply to "I'm coming" and its
 * day, when they are free as fit marks against the run's groups, and where
 * their place stands.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammePeople`), decided from
 * the form before anybody is read. A reviewer is told the tab is the lead's
 * and an admin's; somebody with no role on the programme is told there is no
 * programme here, whether or not it exists.
 *
 * Every row and every count is worked out on the server, from records, and
 * the table only draws them and filters them. A lead is sent names, degree
 * lines and replies, never an email address or anything written under access
 * requirements; an admin is sent the same, and reads those where they always
 * have.
 */
export default async function ProgrammePeoplePage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammePeople(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") {
    return (
      <Refusal
        title={NOT_YOURS_TITLE}
        href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
        action="Go to applications"
      >
        {NOT_YOURS_WHY}
      </Refusal>
    );
  }
  const { view } = outcome;
  if (view.blank === "not-sent") {
    return (
      <section className={`${shared.card} ${shared.empty}`}>
        <p className={shared.cardNote}>{notSentWords(view.programmeName)}</p>
      </section>
    );
  }
  return <ProgrammePeople view={view} />;
}
