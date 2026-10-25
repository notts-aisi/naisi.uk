import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { LIST_WORDS, REFUSAL } from "@/lib/surveys/words";

/**
 * A survey address that opens no survey, said on the page (never
 * `notFound()`, which answers with an empty body until the scripts arrive).
 */
export default function SurveyMissing() {
  return (
    <PageHead
      crumb={<Link href="/admin/surveys">{LIST_WORDS.title}</Link>}
      title="Survey not found"
      description={REFUSAL.noSurvey}
    />
  );
}
