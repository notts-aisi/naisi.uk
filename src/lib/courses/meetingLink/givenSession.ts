import "server-only";
import { resolveSessions } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import { GROUP_FIELD_LIMITS, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { validateSubmissionUrl, type CourseRunDoc } from "@/lib/firestore/courses";
import { seesSessionLink } from "./audience";

/**
 * THE ONE SESSION'S MEETING LINK FOR SOMEBODY GIVEN IT, for the register
 * they take it from: the session's own link (its week's, or the group's
 * standing one, as `resolveSessions` resolves it), when the one answer about
 * who sees a link (`seesSessionLink`) says they do, which for them is while
 * the grant holds. Null otherwise, for a session called off, and for a link
 * that is not a web address. Shown on the site as a value, never put into
 * words and never into an email.
 */
export function givenSessionLink(input: {
  run: CourseRunDoc;
  group: CourseGroupDoc;
  viewer: SessionUser;
  sessionKey: string;
  /** The live grants of this group to the viewer (`gateGroupRegister`'s `givenSessions`). */
  givenSessions: readonly string[];
}): string | null {
  const { run, group, viewer, sessionKey, givenSessions } = input;
  if (!seesSessionLink({ viewer, isAdmin: false, seat: null, group, sessionKey, givenSessions })) return null;
  const session = resolveSessions(run, group).find((each) => each.sessionKey === sessionKey);
  if (!session || session.cancelled) return null;
  const link = session.session.meetingUrl ?? "";
  return link && validateSubmissionUrl(link, GROUP_FIELD_LIMITS.meetingUrl) === null ? link : null;
}
