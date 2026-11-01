import type { ReactNode } from "react";
import { chartQuery, type ChartBlock, type ChartModel, type ChartPanel, type ChartWho } from "@/lib/surveys/chart";
import {
  MAKE_CHART_WORDS,
  barSaidWords,
  chartAnswersWords,
  showAllGroupsWords,
  showingWords,
  weekShortWords,
} from "@/lib/surveys/chartWords";
import ChartControls from "./ChartControls";
import DownloadPicture from "./DownloadPicture";
import styles from "./chart.module.css";

/**
 * MAKE A CHART, for admins: the choices, then the chart they make, drawn on
 * the server from the model (`src/lib/surveys/chart.ts`), which counts every
 * figure the way Results do and holds no name. One chart for everybody
 * counted, or one a group, each on the same scale; the first four groups
 * drawn and the rest behind a press that needs no script. Under them the
 * chart as a picture, made in the browser, and its numbers as a file, from
 * the route that builds the same model; neither names anybody, so neither is
 * a recorded download.
 *
 * Every bar and column is the theme's accent, with its words and its figure
 * outside it in the text colours.
 */

/** The charts drawn before "Show all". */
export const PANELS_SHOWN = 4;

function Columns({ block }: { block: ChartBlock }) {
  return (
    <ol className={styles.columns}>
      {block.bars.map((bar, at) => (
        <li key={`${at}:${bar.label}`} className={styles.column}>
          <span className={styles.srOnly}>{barSaidWords(bar.label, bar.figure, bar.figure ? bar.count : null)}</span>
          <span className={bar.figure ? styles.figure : styles.dot} aria-hidden="true">
            {bar.figure || MAKE_CHART_WORDS.dot}
          </span>
          <span className={styles.plot} aria-hidden="true">
            {bar.figure && <span className={styles.columnFill} style={{ height: `${Math.round(bar.size * 1000) / 10}%` }} />}
          </span>
          <span className={styles.weekLabel} aria-hidden="true">
            {bar.week === null ? bar.label : weekShortWords(bar.week)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Bars({ block }: { block: ChartBlock }) {
  return (
    <>
      {block.heading && <p className={styles.blockHead}>{block.heading}</p>}
      {block.of === 0 ? (
        <p className={styles.none}>{MAKE_CHART_WORDS.noAnswersWeek}</p>
      ) : (
        <ul className={styles.bars}>
          {block.bars.map((bar, at) => (
            <li key={`${at}:${bar.label}`} className={styles.bar}>
              <span className={styles.barLabel}>{bar.label}</span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.fill} style={{ width: `${Math.round(bar.size * 1000) / 10}%` }} />
              </span>
              <span className={styles.barFigure}>{bar.figure}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Panel({ panel, layout, index }: { panel: ChartPanel; layout: ChartModel["layout"]; index: number }) {
  const id = `chart-${index}`;
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.panelHead}>
        <h3 id={id} className={styles.panelTitle}>
          {panel.title}
        </h3>
        <span className={styles.panelCount}>{chartAnswersWords(panel.answers)}</span>
      </div>
      {panel.blocks.map((block, at) =>
        layout === "columns" ? <Columns key={at} block={block} /> : <Bars key={`${block.heading}:${at}`} block={block} />,
      )}
    </section>
  );
}

export default function MakeAChart({
  model,
  who,
  action,
  file,
  fileName,
  line,
  aside = null,
}: {
  model: ChartModel;
  who: ChartWho | null;
  /** The page's own address, for the choices' form. */
  action: string;
  /** The route that makes the file of numbers, without its query. */
  file: string;
  /** The picture's and the file's name, with no ending. */
  fileName: string;
  /** What the picture says it is from: "AGI Strategy check-ins · Everyone who answered · 139 answers". */
  line: string;
  /** Under the choices: a way elsewhere, such as a check-in's way to its programme's check-ins. */
  aside?: ReactNode;
}) {
  const chosen = model.chosen;
  if (!chosen) {
    return (
      <section className={styles.card} aria-labelledby="make-a-chart">
        <h2 id="make-a-chart" className={styles.cardTitle}>
          {MAKE_CHART_WORDS.title}
        </h2>
        <p className={styles.empty}>{MAKE_CHART_WORDS.noQuestions}</p>
        {aside}
      </section>
    );
  }
  const several = model.panels.length > 1;
  const shown = model.panels.slice(0, PANELS_SHOWN);
  const rest = model.panels.slice(PANELS_SHOWN);
  const grid = [styles.panels, model.layout === "bars" ? styles.panelsBars : "", several ? "" : styles.panelsOne].filter(Boolean).join(" ");
  const query = chartQuery(chosen, who ? { name: who.name, value: who.chosen } : null);
  return (
    <div className={styles.maker}>
      <section className={styles.card} aria-labelledby="make-a-chart">
        <h2 id="make-a-chart" className={styles.cardTitle}>
          {MAKE_CHART_WORDS.title}
        </h2>
        <ChartControls action={action} questions={model.questions} shows={model.shows} splits={model.splits} who={who} chosen={chosen} />
        {aside}
      </section>
      <section className={styles.card} aria-labelledby="the-chart">
        <div className={styles.chartHead}>
          <h2 id="the-chart" className={styles.chartTitle}>
            {model.heading}
          </h2>
          {model.answers > 0 && model.scale.words && <p className={styles.scale}>{model.scale.words}</p>}
        </div>
        <p className={styles.question}>{model.title}</p>
        {model.answers === 0 ? (
          <p className={styles.empty}>{MAKE_CHART_WORDS.noAnswers}</p>
        ) : (
          <>
            <div className={grid}>
              {shown.map((panel, index) => (
                <Panel key={panel.key} panel={panel} layout={model.layout} index={index} />
              ))}
            </div>
            {rest.length > 0 && (
              <details className={styles.more}>
                <summary>
                  {showingWords(shown.length, model.panels.length)}
                  <span className={styles.morePress}>{showAllGroupsWords(model.panels.length)}</span>
                </summary>
                <div className={grid}>
                  {rest.map((panel, index) => (
                    <Panel key={panel.key} panel={panel} layout={model.layout} index={index + PANELS_SHOWN} />
                  ))}
                </div>
              </details>
            )}
            <div className={styles.downloads}>
              <DownloadPicture
                fileName={fileName}
                heading={model.heading}
                question={model.title}
                line={line}
                scale={model.scale.words}
                layout={model.layout}
                panels={model.panels}
              />
              <a href={`${file}?${query}`} download className={styles.download}>
                {MAKE_CHART_WORDS.downloadNumbers}
              </a>
            </div>
            <p className={styles.note}>{MAKE_CHART_WORDS.downloadsNote}</p>
          </>
        )}
      </section>
    </div>
  );
}
