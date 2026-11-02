import { redirect } from "next/navigation";

/**
 * THE OLD FEEDBACK PAGE, `/learn/[runId]/weeks/[n]/feedback`: where the
 * "feedback is waiting" emails sent before feedback became a signed comment
 * link. Feedback now shows on the week's own page, in its Feedback section,
 * so this address sends its reader there (`#feedback`) and keeps every link
 * in an email already sent working. It reads nothing: the run's layout and
 * the week page each keep their own gate.
 */

export const dynamic = "force-dynamic";

const MAX_WEEK_NUMBER = 60;

export default async function OldFeedbackPage({ params }: { params: Promise<{ runId: string; n: string }> }) {
  const { runId, n } = await params;
  const runHome = `/learn/${encodeURIComponent(runId)}`;
  const weekNumber = /^[1-9]\d?$/.test(n) ? Number(n) : NaN;
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) redirect(runHome);
  redirect(`${runHome}/weeks/${weekNumber}#feedback`);
}
