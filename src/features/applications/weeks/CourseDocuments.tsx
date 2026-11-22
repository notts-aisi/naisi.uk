"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Chip from "@/components/ui/Chip";
import GuideLoader from "@/features/courses/GuideLoader";
import FacilitatorGuideLoader from "@/features/courses/facilitatorGuide/FacilitatorGuideLoader";
import { useHydrated } from "@/hooks/useHydrated";
import type { CourseDocumentRow, CourseDocuments as Documents } from "@/lib/courses/weeksTab/documents";
import {
  DOCUMENTS_ADMINS,
  DOCUMENTS_LEAD,
  DOCUMENTS_LEDE_ADMIN,
  DOCUMENTS_TITLE,
  DOCUMENT_LOAD,
  DOCUMENT_REPLACE,
  documentLine,
} from "@/lib/courses/weeksTab/words";
import styles from "./weeks.module.css";
import own from "./weekSettings.module.css";

/**
 * "COURSE DOCUMENTS", first on a programme's Weeks tab: one row a document,
 * each saying whose it is and whether (and when) it is loaded, and Load or
 * Replace, which opens today's paste for it under the row: the run editor's
 * card for Start here and the Glossary (`GuideLoader`), the facilitator
 * guide's card for the Handbook and Printables (`FacilitatorGuideLoader`, on
 * that one place). Each card sends its own route, which decides who may. For
 * an admin; the programme's lead is drawn one line and no row
 * (`loadCourseDocuments`). Nothing here writes.
 */
export default function CourseDocuments({ runId, courseId, documents }: { runId: string; courseId: string; documents: Documents }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [open, setOpen] = useState<CourseDocumentRow["key"] | null>(null);
  if (!documents.admin) {
    return (
      <section className={styles.card} aria-label={DOCUMENTS_TITLE}>
        <p className={styles.muted}>{DOCUMENTS_LEAD}</p>
      </section>
    );
  }
  return (
    <section className={styles.card} aria-labelledby="course-documents-title">
      <div className={own.headRow}>
        <h2 id="course-documents-title" className={styles.subheading}>
          {DOCUMENTS_TITLE}
        </h2>
        <Chip tone="neutral">{DOCUMENTS_ADMINS}</Chip>
      </div>
      <p className={styles.muted}>{DOCUMENTS_LEDE_ADMIN}</p>
      <ul className={own.landed}>
        {documents.rows.map((row) => (
          <li key={row.key} className={own.documentRow}>
            <div className={own.reading}>
              <div className={own.readingText}>
                <p className={own.readingName}>{row.name}</p>
                <p className={styles.muted}>{documentLine(row.whose, row.loaded, row.loadedOn)}</p>
              </div>
              <button
                type="button"
                className={styles.button}
                aria-expanded={open === row.key}
                onClick={() => setOpen(open === row.key ? null : row.key)}
                disabled={!hydrated}
              >
                {row.loaded ? DOCUMENT_REPLACE : DOCUMENT_LOAD}
              </button>
            </div>
            {open === row.key &&
              (row.whose === "run" ? (
                <GuideLoader runId={runId} doc={row.key === "glossary" ? "glossary" : "start-here"} onSaved={() => router.refresh()} />
              ) : (
                <FacilitatorGuideLoader courseId={courseId} slots={[{ key: row.key, label: row.name, loaded: row.title }]} />
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
