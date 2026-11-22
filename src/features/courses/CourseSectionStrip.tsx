"use client";

import { useEffect, useState } from "react";
import { SECTIONS_LABEL, type CourseSection } from "@/lib/courses/coursePage/words";
import page from "./coursePages.module.css";

/**
 * The strip of a course page's sections down its side: each a jump to its
 * card on the same page, the one being read marked. Below the large-screen
 * breakpoint it is a row above the cards that scrolls inside itself.
 *
 * Which one is being read: of the cards inside the band near the top of the
 * window, the one highest on the page (the cards are not in the strip's
 * order). Until anything has been seen, the first. Nothing is stored.
 */
export default function CourseSectionStrip({
  sections,
}: {
  sections: readonly { id: CourseSection; label: string }[];
}) {
  const [current, setCurrent] = useState<CourseSection | null>(sections[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;
    const inBand = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id);
          else inBand.delete(entry.target.id);
        }
        let highest: HTMLElement | null = null;
        for (const element of elements) {
          if (!inBand.has(element.id)) continue;
          if (!highest || element.getBoundingClientRect().top < highest.getBoundingClientRect().top) highest = element;
        }
        const top: HTMLElement | null = highest;
        const found = top ? sections.find((section) => section.id === top.id) : undefined;
        if (found) setCurrent(found.id);
      },
      { rootMargin: "-15% 0px -55% 0px" },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className={page.strip} aria-label={SECTIONS_LABEL}>
      <ul className={page.stripList}>
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={section.id === current ? `${page.stripLink} ${page.stripCurrent}` : page.stripLink}
              aria-current={section.id === current ? "true" : undefined}
              onClick={() => setCurrent(section.id)}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
