import "server-only";
import { safeReturnPath } from "@/lib/safeReturnPath";
import { qrShape, siteOrigin, type QrShape } from "./shortLinkCode";

/**
 * A QR CODE SHOWN ON A SCREEN, NEVER PRINTED: a page of this site, for the
 * people in a room to open on their phones while it is shown to them.
 *
 * Every printed code encodes a short link (`/q/<slug>`, `./shortLinkCode.ts`),
 * because paper outlives where it points. A code that is only ever drawn on a
 * screen, for as long as the thing it opens is open, has nothing to outlive,
 * and points straight at its page: today the check-in at the end of a
 * session (`src/lib/surveys/checkIns/`), which its group's facilitator shows
 * in the room. Nothing here can be downloaded or printed: the shape is drawn
 * inline, and no route hands it out as a file.
 *
 * The address is this site's own origin (`siteOrigin`, never the request's)
 * and a path on it, refused when it is anything else (`safeReturnPath`, the
 * one place that is decided).
 */

/** The code of a page of this site: `path` is a path on this site. */
export function pageCodeShape(path: string): QrShape & { address: string } {
  if (safeReturnPath(path) === null) throw new Error(`Not a page of this site: ${JSON.stringify(path)}`);
  const url = `${siteOrigin()}${path}`;
  return { ...qrShape(url), address: `${new URL(url).host}${path}` };
}
