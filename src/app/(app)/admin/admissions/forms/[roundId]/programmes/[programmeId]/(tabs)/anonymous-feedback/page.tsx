import AnonymousAnswers from "@/features/anonymousFeedback/AnonymousAnswers";
import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { readAnonymousAnswers } from "@/lib/anonymousFeedback/readers";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's answers to its anonymous keep, change and drop form
 * (docs/surveys.md, "The anonymous form at a programme's end"), under the
 * programme's head and tabs. No tab links here yet: listed in the build notes.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before any answer is read: the lead of another programme and
 * anybody with no role on this one are told there is no programme here, and
 * a reviewer is told it is the lead's and an admins'. The admin area is
 * closed during a view-as session (`(app)/admin/layout.tsx`).
 *
 * Drawn on the server from `readAnonymousAnswers`: the answers from a day that
 * is over, each question's in alphabetical order, and how many. Nothing on it
 * says when an answer came in, and no browser ever reads the records.
 */
export default async function ProgrammeAnonymousFeedbackPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") {
    return (
      <Refusal
        title="Only the programme’s lead and admins can read the anonymous answers"
        href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
        action="Go to applications"
      >
        The answers to the programme’s anonymous form are read by its lead and NAISI’s admins alone.
      </Refusal>
    );
  }
  const { view } = outcome;
  const answers = await readAnonymousAnswers(db, { viewer: view.viewer, roundId: view.roundId, programmeId: view.programmeId }, new Date());
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  return <AnonymousAnswers view={answers} site={site} />;
}
