import FormEditor from "@/features/applications/editor/FormEditor";
import { FormIsAdminOnly, NoFormHere } from "@/features/applications/editor/Refusals";
import { canRunTerm } from "@/lib/applications/access";
import { loadFormForStaff } from "@/lib/applications/editor/load";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { fixedSectionsAfter } from "@/lib/applications/editor/sets";
import {
  projectFormForStaff,
  projectSetForEditor,
  setsInFormOrder,
} from "@/lib/applications/editor/views";
import { loadQuestionSets } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * The application form's editor: its sections in order and the questions in
 * each set.
 *
 * The tree's gate runs again here rather than being inherited silently, and
 * then the page asks its own question. The form is an admin's to edit, so a
 * lead or a reviewer who opens this address is told so and sent back to
 * their programmes, and somebody with no role on the form is told there is no
 * form, whether or not there is one.
 *
 * `?set=<id>` opens that question set first, which is how a programme's
 * settings link to its own questions.
 */
export default async function ApplicationFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string }>;
  searchParams: Promise<{ set?: string | string[] }>;
}) {
  const [{ roundId }, query, user] = await Promise.all([
    params,
    searchParams,
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const loaded = db ? await loadFormForStaff(db, user, roundId) : null;
  if (!db || !loaded) return <NoFormHere />;
  const { form, context } = loaded;
  // The questions are read only once the caller is known to be an admin.
  if (!canRunTerm(user)) return <FormIsAdminOnly roundId={form.round.id} />;
  const sets = await loadQuestionSets(db, form.round.id);
  return (
    <FormEditor
      form={projectFormForStaff(form, context)}
      sets={setsInFormOrder(form, sets).map((set) => projectSetForEditor(set, form, sets))}
      fixedAfter={fixedSectionsAfter(form.round.availabilityGrid)}
      initialSetId={typeof query.set === "string" ? query.set : null}
      homeHref={applicationFormPath(form.round.id)}
    />
  );
}
