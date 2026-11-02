import "server-only";
import type { SessionUser } from "@/lib/firebase/session";
import { organises, type OpeningFields } from "./opening";

/**
 * WHO RUNS THE SURVEY AFTER AN EVENT once it is published: its author and its
 * collaborators, while their accounts stand (`organises`), and admins. They
 * change its setting on the event's Survey after tab (who gets it and when
 * until it goes, its questions until it opens), send it now and send
 * themselves a test. Its results stay admins' alone (`canRunSurveys`), and
 * its answers are read by nobody else.
 *
 * The three routes under `/api/events/[id]/survey-after` and the tab's
 * buttons ask here, so the buttons show for exactly the people the routes
 * let through. Before publishing, the setting is part of the event's form,
 * and whoever may edit the event changes it in the editor.
 */
export function runsSurveyAfter(event: OpeningFields, viewer: SessionUser): boolean {
  return viewer.role === "admin" || organises(event, viewer);
}
