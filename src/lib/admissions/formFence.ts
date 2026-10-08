import "server-only";
import { NextResponse } from "next/server";
import { isApplicationForm } from "@/lib/applications/normalise";

/**
 * THE FENCE BETWEEN THE OLDER ROUND CODE AND AN APPLICATION FORM.
 *
 * An application form is stored on an admission round. It sits in the same
 * collection as the rounds that came before it, under the same kind of id, so
 * everything written for those rounds can be pointed at one: the older
 * console's routes, the older apply flow, the two scheduler jobs that walk
 * open rounds, and the lookups behind the course pages and the status pages.
 * None of that code knows a form's programmes, its question sets, the two
 * copies of an application or decision day. Left to run, it would save a
 * reviewer list over the union the form keeps, file an application in the
 * older shape beside the new ones, or email an applicant about a flow they
 * are not in.
 *
 * THE RULE: a round that is an application form is edited, applied to,
 * reminded about and decided only by the application form's own code
 * (`src/lib/applications/` and the routes under `/api/admissions/forms`).
 * Everything older asks `isApplicationForm` of the STORED document and then
 * does one of three things. `tests/admissions-form-fence.test.mjs` walks the
 * tree and holds every route, page, job and lookup to the one it is listed
 * under:
 *
 *  - IT REFUSES. A route answers with `refuseApplicationForm` below, after its
 *    own "not found" answers and before it writes anything, sends anything or
 *    serves the document in the older shape. The applicant's own routes go
 *    through `loadRound` (`applyContext.ts`), which throws the same refusal.
 *  - IT LEAVES THE FORM ALONE. The scheduler jobs and the course page lookup
 *    skip one, so nothing older emails an applicant on a form or offers a form
 *    as one course's own intake.
 *  - IT SERVES BOTH, on purpose, with the reason written beside its entry in
 *    that test: destroying a round, deleting an account, the member record,
 *    the list of one person's applications, and the two applicant pages. Each
 *    of those pages asks for the form's own screen first and returns what it
 *    answers, and to the older half that follows a form is a round that is not
 *    there.
 *
 * THE REFUSAL COMES AFTER A ROUTE'S "NOT FOUND" ANSWERS, NEVER BEFORE THEM.
 * Whether a round exists is not something a stranger is told, and a form
 * nobody has opened yet reads to an applicant exactly as a round that is not
 * there.
 *
 * A new route, page, job or lookup that reads a round fails that test until it
 * is listed, which is the point: somebody has to decide which of the three it
 * does before it can be pointed at a form.
 */

/**
 * What the older console says about an application form, to the people who
 * work on rounds. One sentence, used by every older staff route and by the
 * older round page, so it reads the same wherever it is met.
 */
export const EDITED_IN_THE_APPLICATION_FORM =
  "This round is an application form, so it is edited in the application form and not here. Open it from Admissions.";

/**
 * What the older apply flow says about an application form, to somebody who
 * came to apply. It says where applying happens and nothing about how the
 * form is run.
 */
export const MADE_ON_THE_APPLICATION_FORM =
  "Applications for this term are made on the application form.";

/**
 * The status every refusal here carries. Nothing is wrong with the request and
 * the caller may well be allowed to make it: it is the wrong door for what the
 * round is.
 */
export const APPLICATION_FORM_REFUSAL_STATUS = 409;

/**
 * The refusal an older route answers with when the round it loaded is an
 * application form, or null for a round of the older kind.
 *
 * Hand it the document exactly as Firestore returned it (`snap.data()`), not
 * the output of `normalizeAdmissionRound`: that normaliser predates the form
 * and drops the one field that says what the round is.
 *
 * `reader` chooses the sentence. Everything a member of staff reaches says
 * where a form is edited. The one older read an applicant's browser makes says
 * where applications are made.
 */
export function refuseApplicationForm(
  data: unknown,
  reader: "staff" | "applicant" = "staff",
): NextResponse | null {
  if (!isApplicationForm(data)) return null;
  return NextResponse.json(
    {
      error:
        reader === "applicant" ? MADE_ON_THE_APPLICATION_FORM : EDITED_IN_THE_APPLICATION_FORM,
    },
    { status: APPLICATION_FORM_REFUSAL_STATUS },
  );
}
