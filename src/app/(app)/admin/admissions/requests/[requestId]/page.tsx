import { Refusal } from "@/features/applications/editor/Refusals";
import RequestPage from "@/features/courses/requests/RequestPage";
import { BACK_TO_REQUESTS, REQUEST_NOT_HERE, REQUEST_NOT_HERE_LINE } from "@/lib/courses/registerCorrection/pageWords";
import { loadRequestPage } from "@/lib/courses/requests/load";
import { REQUESTS_PATH } from "@/lib/courses/requests/paths";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE REQUEST'S PAGE, at `/admin/admissions/requests/[requestId]`: for an
 * admin and the people leading the programme of the request's group, who
 * decide it (`loadRequestPage`, which asks the group's register gate). The
 * tree's gate is restated here, as on the Requests page beside it.
 *
 * Anybody else, and an id that names nothing, is shown the same calm "not
 * here" with a 200, never told whether such a request exists. The routes
 * behind every button ask again who the caller is: approving and declining
 * refuse the person who asked, and the page offers neither to them.
 */

export const dynamic = "force-dynamic";

export default async function OneRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const [{ requestId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const loaded = db ? await loadRequestPage(db, user, requestId) : null;
  if (!loaded || loaded.status === "none") {
    return (
      <Refusal title={REQUEST_NOT_HERE} href={REQUESTS_PATH} action={BACK_TO_REQUESTS}>
        {REQUEST_NOT_HERE_LINE}
      </Refusal>
    );
  }
  return <RequestPage view={loaded.view} />;
}
