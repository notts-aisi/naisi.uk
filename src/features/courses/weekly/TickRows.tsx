"use client";

import type { ReactNode } from "react";
import { youtubeIdFromUrl } from "@/lib/firestore/newsletterBlocks";
import type { CourseWeekDoc, Material } from "@/lib/firestore/courses";
import type { ProgressItemKind } from "@/lib/firestore/courseProgress";
import { doneItemWords, openItemWords } from "@/lib/courses/memberPageWords";
import styles from "./weekly.module.css";

/**
 * A WEEK'S READINGS, EACH WITH ITS TICK (boards st-programme, wk-week-phone,
 * wk-home-phone): a real checkbox in a 44px target, the title, what kind of
 * thing it is and how long it takes, and the way to open it.
 *
 * The rows draw; ticking is the caller's, through `useMaterialTicks`, so
 * every page that ticks writes the same record the same way.
 */

export type TickItem = {
  id: string;
  kind: ProgressItemKind;
  title: string;
  /** "Reading", "Video", "Link", "Note"; null for a checklist item. */
  chip: string | null;
  minutes: number | null;
  /** A source's time in words ("About 35 minutes"), on a week written as blocks; absent otherwise. */
  time?: string | null;
  /** Who wrote it, or a line on why it is here. */
  source: string | null;
  /** Only an address that parses as a web address. */
  href: string | null;
  /** A note's own words, or a checklist item's detail. */
  body: string | null;
  optional: boolean;
};

const KIND_LABEL: Record<Material["type"], string> = {
  reading: "Reading",
  video: "Video",
  link: "Link",
  note: "Note",
};

/** Only http and https are links: a stored address is checked again where it is drawn. */
function safeHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A video's address to open: the address stored, or YouTube's for a bare id. */
function videoHref(raw: string): string | null {
  const direct = safeHttpUrl(raw);
  if (direct) return direct;
  const id = youtubeIdFromUrl(raw);
  return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : null;
}

/** The rows of a week: its materials, then (on the week page) its checklist. */
export function tickItemsOf(week: Pick<CourseWeekDoc, "materials" | "checklist">, withChecklist: boolean): TickItem[] {
  const materials: TickItem[] = week.materials.map((m) => ({
    id: m.id,
    kind: "material",
    title: m.title || "Untitled",
    chip: KIND_LABEL[m.type],
    minutes: m.estimatedMinutes && m.estimatedMinutes > 0 ? m.estimatedMinutes : null,
    source: m.type === "reading" ? (m.author?.trim() || null) : m.type === "link" ? (m.description?.trim() || null) : null,
    href: m.type === "note" ? null : m.type === "video" ? videoHref(m.url) : safeHttpUrl(m.url),
    body: m.type === "note" ? m.body.trim() || null : null,
    optional: m.optional === true,
  }));
  if (!withChecklist) return materials;
  const checklist: TickItem[] = week.checklist.map((c) => ({
    id: c.id,
    kind: "checklist",
    title: c.title || "Untitled",
    chip: null,
    minutes: null,
    source: null,
    href: null,
    body: c.detail?.trim() || null,
    optional: false,
  }));
  return [...materials, ...checklist];
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function ArrowUpRight({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.icon}>
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

type Props = {
  items: TickItem[];
  isDone: (id: string) => boolean;
  /** Somebody taking part: the boxes work. Otherwise they are not drawn. */
  canTick: boolean;
  /** Whether boxes are drawn at all (a learner whose enrolment has ended sees them, read only). */
  showTicks: boolean;
  onTick: (kind: ProgressItemKind, id: string, next: boolean) => void;
  /** "word": "Open ↗" (the programme home); "icon": the arrow alone (Home, the week page). */
  open: "word" | "icon";
  /** Show who wrote each reading (the week page). */
  withSource?: boolean;
  /** Drawn under one row: the week page's reflections on a reading. */
  extra?: (item: TickItem) => ReactNode;
  /**
   * Steps to tick (a block week's checklist, board wk-week6-phone): each step's
   * words in the body's weight, the same ticked or not, the box beside the
   * first line of a step that runs to several.
   */
  steps?: boolean;
};

export default function TickRows({ items, isDone, canTick, showTicks, onTick, open, withSource = false, extra, steps = false }: Props) {
  return (
    <ul className={styles.ticks} role="list">
      {items.map((item) => {
        const done = isDone(item.id);
        return (
          <li key={item.id} className={steps ? `${styles.tickRow} ${styles.stepRow}` : styles.tickRow}>
            {showTicks && (
              <label className={styles.tickBox}>
                <input
                  type="checkbox"
                  className={styles.tickInput}
                  checked={done}
                  disabled={!canTick}
                  aria-label={doneItemWords(item.title)}
                  onChange={(event) => onTick(item.kind, item.id, event.currentTarget.checked)}
                />
                <span className={styles.tickMark} aria-hidden="true">
                  {done && <Check />}
                </span>
              </label>
            )}
            <div className={styles.tickBody}>
              <p className={steps ? styles.stepTitle : done ? styles.tickTitleDone : styles.tickTitle}>{item.title}</p>
              {(item.chip || item.optional || item.minutes || item.time || (withSource && item.source)) && (
                <p className={styles.tickMeta}>
                  {item.chip && <span className={styles.kindChip}>{item.chip}</span>}
                  {item.optional && <span className={styles.kindChip}>Optional</span>}
                  {item.minutes && <span className={styles.minutes}>{item.minutes} min</span>}
                  {!item.minutes && item.time && <span className={styles.minutes}>{item.time}</span>}
                  {withSource && item.source && <span className={styles.source}>{item.source}</span>}
                </p>
              )}
              {item.body && <p className={styles.noteBody}>{item.body}</p>}
              {extra?.(item)}
            </div>
            {item.href &&
              (open === "word" ? (
                <a className={styles.openWord} href={item.href} target="_blank" rel="noopener noreferrer">
                  Open
                  <span className={styles.srOnly}> {item.title}</span>
                  <ArrowUpRight size={16} />
                </a>
              ) : (
                <a
                  className={styles.openIcon}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={openItemWords(item.title)}
                >
                  <ArrowUpRight />
                </a>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
