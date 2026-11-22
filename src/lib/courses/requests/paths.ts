/**
 * WHERE THE REQUESTS PAGES ARE: in the admissions tree, whose gate
 * (`requireAdmissionsPage`) admits admins and the programmes' leads, the two
 * who decide requests. Most of `/admin` is closed to a lead; the programme
 * pages, and these beside them, are not.
 */
export const REQUESTS_PATH = "/admin/admissions/requests";

/** One request's page. */
export function requestPath(requestId: string): string {
  return `${REQUESTS_PATH}/${encodeURIComponent(requestId)}`;
}

/**
 * The Requests page narrowed to one programme, by the run it names: what a
 * programme's Overview links to. The page filters only what its reader is
 * shown anyway (`loadRequestsPage`).
 */
export function requestsForRunPath(runId: string): string {
  return `${REQUESTS_PATH}?run=${encodeURIComponent(runId)}`;
}
