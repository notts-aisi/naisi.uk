import Link from "next/link";
import Chip from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import SectionTabs from "@/components/ui/SectionTabs";
import type { HeadView } from "@/lib/surveys/adminView";
import { MAKE_CHART_WORDS } from "@/lib/surveys/chartWords";
import { CHECK_IN_ADMIN_WORDS } from "@/lib/surveys/checkIns/words";
import { hubTabHref } from "@/lib/surveys/hub/tabs";
import { LIST_WORDS, OPEN_WORDS, TAB_WORDS } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

export type SurveyTab = "results" | "chart" | "answered" | "questions" | "send";

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
 * The head of a survey's pages (sv-send-programme): the way back to Surveys
 * (to its Events tab for a survey after an event), its name, whether it is
 * open, that it is confidential, its programme and when it closes, and its
 * five tabs. Drawn by each tab's page, which is the one <h1> on it. A leaving
 * survey is opened rather than sent, so its Send tab is Open, at the same
 * address; a check-in's is Opening, saying how its group's facilitator
 * opened it. Make a chart sits beside Results, whose counting it shares.
 */
export default function SurveyHead({ head, current }: { head: HeadView; current: SurveyTab }) {
  const chip = STATE_CHIP[head.state];
  const words: Record<SurveyTab, string> = {
    ...TAB_WORDS,
    chart: MAKE_CHART_WORDS.tab,
    send: head.leaving ? OPEN_WORDS.tab : head.checkIn ? CHECK_IN_ADMIN_WORDS.tab : TAB_WORDS.send,
  };
  return (
    <>
      <PageHead
        crumb={
          <>
            <Link href={hubTabHref(head.event ? "events" : "programmes")}>{LIST_WORDS.title}</Link>
            <span aria-hidden="true">›</span>
            <Link href={`/admin/surveys/${encodeURIComponent(head.id)}`}>{head.name}</Link>
            <span aria-hidden="true">›</span>
            <span>{words[current]}</span>
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
          { key: "results", label: words.results, href: surveyTabHref(head.id, "results") },
          { key: "chart", label: words.chart, href: surveyTabHref(head.id, "chart") },
          { key: "answered", label: words.answered, href: surveyTabHref(head.id, "answered"), count: head.answered },
          { key: "questions", label: words.questions, href: surveyTabHref(head.id, "questions") },
          { key: "send", label: words.send, href: surveyTabHref(head.id, "send") },
        ]}
      />
    </>
  );
}
