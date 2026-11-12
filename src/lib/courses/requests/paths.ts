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
