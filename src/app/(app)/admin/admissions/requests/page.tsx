import { Refusal } from "@/features/applications/editor/Refusals";
import RequestsList from "@/features/courses/requests/RequestsList";
import { NO_REQUESTS_HERE, NO_REQUESTS_HERE_LINE } from "@/lib/courses/registerCorrection/pageWords";
import { loadRequestsPage } from "@/lib/courses/requests/load";
import { wantsRequestEmails } from "@/lib/courses/excused/alert";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * THE REQUESTS PAGE, at `/admin/admissions/requests`: what facilitators have
 * asked the people running a programme to do, which today is a correction of
 * a line of a finished register.
 *
 * WHY HERE. The people who decide a request are admins and a programme's
 * lead. Most of `/admin` is closed to a lead; the admissions tree is not:
 * its gate (`requireAdmissionsPage`, restated here because a page's only
 * protection must not be a level above it) admits admins, round authors and
 * everybody appointed on a form, a programme's lead among them, which is how
 * a lead already reaches the programme's pages beside this one.
 *
 * WHAT IS READ is the loader's (`loadRequestsPage`): an admin reads every
 * programme's requests, a lead the requests of the runs they lead, and
 * anybody else the tree admits (an author who leads nothing) is told calmly
 * that there are none for them here. Names only, never an address. Nothing
 * here emails anybody.
 *
 * `?run=<runId>` NARROWS THE PAGE TO ONE PROGRAMME, by the run it names (each
 * programme's Overview links here so): the loader keeps only that run's rows
 * of the ones the reader is shown anyway, so the filter never widens what
 * anybody sees, and an id that is not a run the reader may see (another
 * programme's, or none at all) is shown nothing and named "A programme".
 */

export const dynamic = "force-dynamic";

/** The run asked for, as the address gives it: the first `run`, or none. */
function runAskedIn(query: { run?: string | string[] }): string | null {
  const asked = Array.isArray(query.run) ? query.run[0] : query.run;
  if (typeof asked !== "string" || asked === "") return null;
  // Too long to be an id names nothing: the page filters to nothing.
  return asked.length > 128 ? "" : asked;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ run?: string | string[] }>;
}) {
  const [user, query] = await Promise.all([requireAdmissionsPage(), searchParams ?? Promise.resolve({} as { run?: string | string[] })]);
  const db = getAdminDb();
  const loaded = db ? await loadRequestsPage(db, user, new Date(), { runId: runAskedIn(query) }) : null;
  if (!loaded || loaded.status === "none") {
    return (
      <Refusal title={NO_REQUESTS_HERE} href="/dashboard" action="Go to Home">
        {NO_REQUESTS_HERE_LINE}
      </Refusal>
    );
  }
  // An admin's own switch for the email about new requests to be excused:
  // drawn for admins alone, who are the only people emailed about one.
  // And the second, about messages to the team, off unless they switch it on.
  const own = loaded.view.viewer === "admin" && db ? ((await db.collection("users").doc(user.uid).get()).data() ?? {}) : null;
  const emailMe = own ? wantsRequestEmails(own) : null;
  const emailMeTeam = own ? wantsRequestEmails(own, "team") : null;
  return <RequestsList view={loaded.view} emailMe={emailMe} emailMeTeam={emailMeTeam} />;
}
