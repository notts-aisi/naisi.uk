/**
 * The markers the certificate send keeps, in `courseNudges`: the server-only
 * collection the course emails keep theirs in (`firestore.rules` shuts it to
 * every browser). Each carries the run's id, so destroying the run sweeps
 * them, and the person's uid as `byUid`, so deleting their account does.
 *
 * Pure: ids and kinds only.
 */

export const CERTIFICATE_MARKERS = "courseNudges";

/** A test of the certificate email that reached the person who pressed it, on one run. One per person. */
export function certificatesTestId(runId: string, uid: string): string {
  return `certificatestest__${runId}__${uid}`;
}

/** The kind on a test's marker. */
export const CERTIFICATES_TEST_KIND = "certificates-test";

/** One press in progress on a run: taken in a transaction, let go when the press ends. */
export function certificatesPressId(runId: string): string {
  return `certificatespress__${runId}`;
}

/** The kind on a press's marker. */
export const CERTIFICATES_PRESS_KIND = "certificates-press";

/** How long a press holds the run before another may take it: longer than any request lives. */
export const PRESS_STALE_MS = 5 * 60_000;
