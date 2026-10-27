import "server-only";
import { randomBytes } from "node:crypto";

/**
 * A new secret for a personal link: 32 bytes from the platform's secure
 * source, base64url. The one way a survey link's secret is made: a send
 * (`./sending.ts`), a leaving survey's test link (`./create.ts`), the row
 * made for somebody as they leave (`./leaving.ts`) and the rows of a survey
 * after an event (`./events/store.ts`) all ask this.
 *
 * Its own module, importing nothing of the site, so the leave, which an
 * applicant's own reply can start, reaches no staff module through it.
 */
export function mintSurveyToken(): string {
  return randomBytes(32).toString("base64url");
}
