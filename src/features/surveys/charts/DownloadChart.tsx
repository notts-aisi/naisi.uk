"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { ChartGroup } from "@/lib/surveys/charts";
import { CHART_WORDS, barShareWords } from "@/lib/surveys/words";
import styles from "./charts.module.css";

/**
 * "DOWNLOAD THE CHART": the question's bars as a picture, drawn
 * in the admin's browser from what the page already holds, and handed over
 * the way the site's other downloads are (a file made in the page, then
 * saved). Its title, its line of how many answered, each bar with its words
 * and figures outside it, in the page's own colours, and nothing else: no
 * name, so nothing is asked of the server and nothing is recorded.
 */

/** The page's colours and type, read when the picture is drawn, so it looks like the card it came from. */
function look() {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  return {
    ground: token("--color-surface", "#1a2238"),
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
const ROW = 44;
const LABEL = 340;
const FIGURE = 150;
const THICK = 14;

/** The picture, on a canvas twice its size so it stays sharp. */
function drawChart(title: string, line: string, groups: ChartGroup[]): HTMLCanvasElement {
  const colours = look();
  const rows = groups.reduce((sum, group) => sum + group.bars.length, 0);
  const heads = groups.filter((group) => group.heading).length;
  const height = PAD + 44 + 30 + 20 + heads * 36 + rows * ROW + groups.length * 12 + 36 + PAD;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.scale(2, 2);
  context.fillStyle = colours.ground;
  context.fillRect(0, 0, WIDTH, height);
  context.textBaseline = "middle";

  let y = PAD + 18;
  context.fillStyle = colours.text;
  context.font = `600 28px ${colours.font}`;
  context.fillText(fitted(context, title, WIDTH - PAD * 2), PAD, y);
  y += 38;
  context.fillStyle = colours.muted;
  context.font = `18px ${colours.font}`;
  context.fillText(fitted(context, line, WIDTH - PAD * 2), PAD, y);
  y += 32;

  const barLeft = PAD + LABEL + 16;
  const barWidth = WIDTH - PAD - FIGURE - 16 - barLeft;
  for (const group of groups) {
    if (group.heading) {
      y += 18;
      context.fillStyle = colours.text;
      context.font = `600 18px ${colours.font}`;
      context.fillText(fitted(context, group.heading, WIDTH - PAD * 2), PAD, y);
      y += 18;
    }
    for (const bar of group.bars) {
      y += ROW / 2;
      context.fillStyle = colours.text;
      context.font = `18px ${colours.font}`;
      context.fillText(fitted(context, bar.label, LABEL), PAD, y);
      // The track, then the bar from the baseline, its end rounded.
      context.fillStyle = colours.track;
      context.beginPath();
      context.roundRect(barLeft, y - THICK / 2, barWidth, THICK, THICK / 2);
      context.fill();
      const length = Math.max(0, Math.min(1, bar.percent / 100)) * barWidth;
      if (length > 0) {
        context.fillStyle = colours.bar;
        context.beginPath();
        context.roundRect(barLeft, y - THICK / 2, Math.max(length, THICK / 2), THICK, [0, THICK / 2, THICK / 2, 0]);
        context.fill();
      }
      context.fillStyle = colours.text;
      context.textAlign = "right";
      context.fillText(barShareWords(bar.count, bar.percent), WIDTH - PAD, y);
      context.textAlign = "left";
      y += ROW / 2;
    }
    y += 12;
  }
  context.fillStyle = colours.muted;
  context.font = `14px ${colours.font}`;
  context.fillText(CHART_WORDS.pictureFrom, PAD, height - PAD + 8);
  return canvas;
}

export default function DownloadChart({ title, line, groups, fileName }: { title: string; line: string; groups: ChartGroup[]; fileName: string }) {
  const hydrated = useHydrated();
  const [failed, setFailed] = useState(false);

  function download() {
    setFailed(false);
    const canvas = drawChart(title, line, groups);
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
      <button type="button" className={styles.action} onClick={download} disabled={!hydrated}>
        {CHART_WORDS.downloadChart}
      </button>
      {failed && (
        <span className={styles.refused} role="alert">
          {CHART_WORDS.pictureFailed}
        </span>
      )}
    </>
  );
}
