"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { ChartPanel } from "@/lib/surveys/chart";
import { MAKE_CHART_WORDS, chartAnswersWords, weekShortWords } from "@/lib/surveys/chartWords";
import styles from "./chart.module.css";

/**
 * "DOWNLOAD THE CHART": every chart on the page, the ones behind "Show all"
 * included, as one picture, drawn in the admin's browser from what the page
 * already holds and saved the way the site's other made-in-the-page files
 * are. Its question, what it shows, its scale, each chart with its name and
 * its bars or columns in the page's own colours, the figures outside them,
 * and nothing else: no name, so nothing is asked of the server and nothing is
 * recorded.
 */

/** The page's colours and type, read when the picture is drawn, so it looks like the card it came from. */
function look() {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  return {
    ground: token("--color-surface", "#1a2238"),
    line: token("--color-border", "#2a3350"),
    strong: token("--color-border-strong", "#3a4566"),
    text: token("--color-text", "#e6eaf2"),
    muted: token("--color-text-muted", "#8b94ac"),
    track: token("--color-surface-hover", "#222b44"),
    bar: token("--color-accent", "#6a82ff"),
    font: getComputedStyle(document.body).fontFamily || "sans-serif",
  };
}

/** `text` cut to fit `width`, with an ellipsis when it had to be. */
function fitted(context: CanvasRenderingContext2D, text: string, width: number): string {
  if (context.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

const WIDTH = 1200;
const PAD = 48;
const GAP = 20;
const PANEL_PAD = 18;
const PANEL_HEAD = 44;
/** Columns by week: the figures' row, the plot and the weeks' row. */
const FIGURES = 26;
const PLOT = 150;
const WEEKS = 30;
/** Bars: a block's heading, and each bar's words over its track. */
const BLOCK_HEAD = 30;
const BAR_ROW = 46;
const THICK = 12;

type Look = ReturnType<typeof look>;

function panelHeight(panel: ChartPanel, layout: "columns" | "bars"): number {
  if (layout === "columns") return PANEL_HEAD + FIGURES + PLOT + WEEKS + PANEL_PAD;
  let height = PANEL_HEAD;
  for (const block of panel.blocks) {
    if (block.heading) height += BLOCK_HEAD;
    height += block.of === 0 ? BAR_ROW / 2 : block.bars.length * BAR_ROW;
  }
  return height + PANEL_PAD;
}

function drawColumns(context: CanvasRenderingContext2D, colours: Look, panel: ChartPanel, x: number, y: number, width: number) {
  const bars = panel.blocks[0]?.bars ?? [];
  const inner = width - PANEL_PAD * 2;
  const slot = bars.length > 0 ? inner / bars.length : inner;
  const base = y + PANEL_HEAD + FIGURES + PLOT;
  context.strokeStyle = colours.strong;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + PANEL_PAD, base + 0.5);
  context.lineTo(x + width - PANEL_PAD, base + 0.5);
  context.stroke();
  context.textAlign = "center";
  bars.forEach((bar, at) => {
    const middle = x + PANEL_PAD + slot * at + slot / 2;
    context.font = `15px ${colours.font}`;
    context.fillStyle = bar.figure ? colours.text : colours.muted;
    context.fillText(bar.figure || MAKE_CHART_WORDS.dot, middle, y + PANEL_HEAD + FIGURES / 2);
    if (bar.figure) {
      const thick = Math.min(slot * 0.7, 36);
      const height = Math.max(2, bar.size * PLOT);
      context.fillStyle = colours.bar;
      context.beginPath();
      context.roundRect(middle - thick / 2, base - height, thick, height, [4, 4, 0, 0]);
      context.fill();
    }
    context.font = `14px ${colours.font}`;
    context.fillStyle = colours.muted;
    context.fillText(bar.week === null ? bar.label : weekShortWords(bar.week), middle, base + WEEKS / 2 + 2);
  });
  context.textAlign = "left";
}

function drawBars(context: CanvasRenderingContext2D, colours: Look, panel: ChartPanel, x: number, y: number, width: number) {
  const left = x + PANEL_PAD;
  const inner = width - PANEL_PAD * 2;
  const figure = 70;
  let at = y + PANEL_HEAD;
  for (const block of panel.blocks) {
    if (block.heading) {
      context.font = `600 15px ${colours.font}`;
      context.fillStyle = colours.text;
      context.fillText(fitted(context, block.heading, inner), left, at + BLOCK_HEAD / 2 + 2);
      at += BLOCK_HEAD;
    }
    if (block.of === 0) {
      context.font = `14px ${colours.font}`;
      context.fillStyle = colours.muted;
      context.fillText(MAKE_CHART_WORDS.noAnswersWeek, left, at + BAR_ROW / 4);
      at += BAR_ROW / 2;
      continue;
    }
    for (const bar of block.bars) {
      context.font = `14px ${colours.font}`;
      context.fillStyle = colours.text;
      context.fillText(fitted(context, bar.label, inner), left, at + 12);
      const trackY = at + 26;
      const trackWidth = inner - figure - 10;
      context.fillStyle = colours.track;
      context.beginPath();
      context.roundRect(left, trackY, trackWidth, THICK, THICK / 2);
      context.fill();
      const length = bar.size * trackWidth;
      if (length > 0) {
        context.fillStyle = colours.bar;
        context.beginPath();
        context.roundRect(left, trackY, Math.max(length, THICK / 2), THICK, THICK / 2);
        context.fill();
      }
      context.fillStyle = colours.text;
      context.textAlign = "right";
      context.fillText(bar.figure, left + inner, trackY + THICK / 2);
      context.textAlign = "left";
      at += BAR_ROW;
    }
  }
}

/** The picture, on a canvas twice its size so it stays sharp. */
function drawPicture(input: PictureInput): HTMLCanvasElement {
  const colours = look();
  const { panels, layout } = input;
  const across = Math.max(1, Math.min(panels.length, layout === "columns" ? 4 : 3));
  const panelWidth = (WIDTH - PAD * 2 - GAP * (across - 1)) / across;
  const rows: ChartPanel[][] = [];
  for (let at = 0; at < panels.length; at += across) rows.push(panels.slice(at, at + across));
  const rowHeights = rows.map((row) => Math.max(...row.map((panel) => panelHeight(panel, layout))));
  const top = PAD + 34 + 30 + 28 + 18;
  const height = top + rowHeights.reduce((sum, each) => sum + each + GAP, 0) + 30 + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.scale(2, 2);
  context.fillStyle = colours.ground;
  context.fillRect(0, 0, WIDTH, height);
  context.textBaseline = "middle";

  let y = PAD + 16;
  context.fillStyle = colours.text;
  context.font = `600 28px ${colours.font}`;
  context.fillText(fitted(context, input.heading, WIDTH - PAD * 2), PAD, y);
  y += 34;
  context.font = `18px ${colours.font}`;
  context.fillText(fitted(context, input.question, WIDTH - PAD * 2), PAD, y);
  y += 30;
  context.fillStyle = colours.muted;
  context.font = `16px ${colours.font}`;
  context.fillText(fitted(context, [input.line, input.scale].filter(Boolean).join(" · "), WIDTH - PAD * 2), PAD, y);

  y = top;
  rows.forEach((row, index) => {
    row.forEach((panel, column) => {
      const x = PAD + column * (panelWidth + GAP);
      context.strokeStyle = colours.line;
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(x + 0.5, y + 0.5, panelWidth - 1, rowHeights[index] - 1, 10);
      context.stroke();
      context.fillStyle = colours.text;
      context.font = `600 16px ${colours.font}`;
      context.fillText(fitted(context, panel.title, panelWidth - PANEL_PAD * 2 - 90), x + PANEL_PAD, y + PANEL_HEAD / 2 + 4);
      context.fillStyle = colours.muted;
      context.font = `14px ${colours.font}`;
      context.textAlign = "right";
      context.fillText(chartAnswersWords(panel.answers), x + panelWidth - PANEL_PAD, y + PANEL_HEAD / 2 + 4);
      context.textAlign = "left";
      if (layout === "columns") drawColumns(context, colours, panel, x, y, panelWidth);
      else drawBars(context, colours, panel, x, y, panelWidth);
    });
    y += rowHeights[index] + GAP;
  });

  context.fillStyle = colours.muted;
  context.font = `14px ${colours.font}`;
  context.fillText(MAKE_CHART_WORDS.pictureFrom, PAD, height - PAD + 8);
  return canvas;
}

type PictureInput = {
  /** "Average by week, by group". */
  heading: string;
  /** The question's own words. */
  question: string;
  /** "AGI Strategy check-ins · Everyone who answered · 139 answers". */
  line: string;
  /** "Same 1 to 5 scale in every chart · a dot is a week with no answers". */
  scale: string;
  layout: "columns" | "bars";
  panels: ChartPanel[];
};

export default function DownloadPicture({ fileName, ...input }: PictureInput & { fileName: string }) {
  const hydrated = useHydrated();
  const [failed, setFailed] = useState(false);

  function download() {
    setFailed(false);
    const canvas = drawPicture(input);
    canvas.toBlob((blob) => {
      if (!blob) {
        setFailed(true);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <>
      <button type="button" className={styles.download} onClick={download} disabled={!hydrated}>
        {MAKE_CHART_WORDS.downloadChart}
      </button>
      {failed && (
        <span className={styles.refused} role="alert">
          {MAKE_CHART_WORDS.pictureFailed}
        </span>
      )}
    </>
  );
}
