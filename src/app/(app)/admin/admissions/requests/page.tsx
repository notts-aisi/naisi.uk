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
 */

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const user = await requireAdmissionsPage();
  const db = getAdminDb();
  const loaded = db ? await loadRequestsPage(db, user, new Date()) : null;
  if (!loaded || loaded.status === "none") {
    return (
      <Refusal title={NO_REQUESTS_HERE} href="/dashboard" action="Go to Home">
        {NO_REQUESTS_HERE_LINE}
      </Refusal>
    );
  }
  // An admin's own switch for the email about new requests to be excused:
  // drawn for admins alone, who are the only people emailed about one.
  const emailMe =
    loaded.view.viewer === "admin" && db
      ? wantsRequestEmails((await db.collection("users").doc(user.uid).get()).data() ?? {})
      : null;
  return <RequestsList view={loaded.view} emailMe={emailMe} />;
}
