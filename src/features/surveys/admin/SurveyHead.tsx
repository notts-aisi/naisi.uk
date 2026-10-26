import Link from "next/link";
import Chip from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import SectionTabs from "@/components/ui/SectionTabs";
import type { HeadView } from "@/lib/surveys/adminView";
import { LIST_WORDS, TAB_WORDS } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

export type SurveyTab = "results" | "answered" | "questions" | "send";

const STATE_CHIP = {
  draft: { word: "Draft", tone: "neutral" },
  open: { word: LIST_WORDS.open, tone: "success" },
  closed: { word: LIST_WORDS.closed, tone: "neutral" },
} as const;

/** The address of one of a survey's tabs. */
export function surveyTabHref(id: string, tab: SurveyTab): string {
  return `/admin/surveys/${encodeURIComponent(id)}/${tab}`;
}

/**
 * The head of a survey's pages (sv-send-programme): the way back to Surveys,
 * its name, whether it is open, that it is confidential, its programme and
 * when it closes, and its four tabs. Drawn by each tab's page, which is the
 * one <h1> on it.
 */
export default function SurveyHead({ head, current }: { head: HeadView; current: SurveyTab }) {
  const chip = STATE_CHIP[head.state];
  return (
    <>
      <PageHead
        crumb={
          <>
            <Link href="/admin/surveys">{LIST_WORDS.title}</Link>
            <span aria-hidden="true">›</span>
            <Link href={`/admin/surveys/${encodeURIComponent(head.id)}`}>{head.name}</Link>
            <span aria-hidden="true">›</span>
            <span>{TAB_WORDS[current]}</span>
          </>
        }
        title={head.name}
        badges={
          <>
            <Chip tone={chip.tone} dot={head.state === "open"}>
              {chip.word}
            </Chip>
            <Chip tone="accent">{LIST_WORDS.confidential}</Chip>
          </>
        }
        meta={
          <>
            <span>{head.programme}</span>
            {head.closes && <span>{head.closes}</span>}
          </>
        }
      />
      <SectionTabs
        className={styles.tabs}
        ariaLabel="Survey sections"
        current={current}
        tabs={[
          { key: "results", label: TAB_WORDS.results, href: surveyTabHref(head.id, "results") },
          { key: "answered", label: TAB_WORDS.answered, href: surveyTabHref(head.id, "answered"), count: head.answered },
          { key: "questions", label: TAB_WORDS.questions, href: surveyTabHref(head.id, "questions") },
          { key: "send", label: TAB_WORDS.send, href: surveyTabHref(head.id, "send") },
        ]}
      />
    </>
  );
}
