import type { Metadata } from "next";
import SurveyFlow from "@/features/aiSurvey/SurveyFlow";
import SurveyFrame from "@/features/aiSurvey/SurveyFrame";
import { publicSurvey } from "@/features/aiSurvey/projectSurvey";
import { AI_SURVEY } from "@/lib/aiSurvey/definition";
import { surveyIsClosed } from "@/lib/aiSurvey/stage";

/*
  /ai-survey: "AI at Nottingham: what should students ask for?"

  An anonymous survey of Nottingham students, with a University-email check in
  front of it. Its words are data (src/content/aiSurvey/definition.ts) and
  this page is a shell around them.

  WHERE A PRINTED CODE LANDS. Every poster and slide for the survey carries a
  short link that ends here, opened on a phone in a lecture theatre, so the
  start screen is in the first HTML that arrives. It never calls `notFound()`
  (which answers with an empty body until the scripts land): a survey that has
  closed says so in ordinary HTML, here.

  NOT in a route group. It sits under the root layout alone and draws its own
  bar (SurveyFrame), with no site header, no footer and no link out of the
  survey but the one to its own notice.

  WHAT THE PAGE NEVER READS: the `?q=<slug>` a short link leaves in the
  address, a cookie, or who is signed in. The link somebody arrived by is
  never kept with their answers. The page asks one thing of the server before
  it renders, whether the survey has closed, and renders the start screen if
  that cannot be answered in time.

  Kept out of search: until it opens it is reachable by its address alone, and
  after that it is for Nottingham students, who are handed the address.
*/

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: AI_SURVEY.title,
  description: AI_SURVEY.start.time,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AiSurveyPage() {
  const closed = await surveyIsClosed();
  return (
    <SurveyFrame label={AI_SURVEY.ui.frameLabel}>
      <SurveyFlow survey={publicSurvey()} closed={closed} />
    </SurveyFrame>
  );
}
