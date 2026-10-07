"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import { AdminLoadingBar, AdminPage } from "@/features/admin/adminList";
import { AdminSection } from "@/features/admin/adminPanels";
import styles from "@/features/admin/TaskTemplates.module.css";
import { useTaskTemplates } from "@/features/tasks/hooks/useTaskTemplates";
import TemplateEditor from "@/features/tasks/components/TemplateEditor";
import { TASK_KIND_LABELS } from "@/lib/firestore/tasks";
import type { TaskTemplate } from "@/lib/firestore/taskTemplates";

type Mode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; template: TaskTemplate };

/**
 * Task templates: the reusable shapes a committee task can start from. The
 * list and the editor share this one address, so the page keeps one heading
 * and the editor opens under it.
 */
export default function TaskTemplatesPage() {
  const { templates, loading } = useTaskTemplates();
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  return (
    <AdminPage wide>
      <PageHead
        crumb="Site settings"
        title="Task templates"
        description="Reusable task structures: a checklist of steps, in order. Committee members pick from these when they make a task."
        actions={
          mode.kind === "list" ? (
            <Button onClick={() => setMode({ kind: "create" })}>New template</Button>
          ) : (
            <Button variant="secondary" onClick={() => setMode({ kind: "list" })}>
              Back to the list
            </Button>
          )
        }
      />

      <div className={styles.column}>
        {mode.kind !== "list" ? (
          <AdminSection
            title={mode.kind === "create" ? "New task template" : `Edit “${mode.template.name}”`}
          >
            <TemplateEditor
              template={mode.kind === "edit" ? mode.template : null}
              onDone={() => setMode({ kind: "list" })}
              onDelete={mode.kind === "edit" ? () => setMode({ kind: "list" }) : undefined}
            />
          </AdminSection>
        ) : loading ? (
          <Card padding="md">
            <AdminLoadingBar label="Loading templates…" />
          </Card>
        ) : templates.length === 0 ? (
          <Card padding="md">
            <p className={styles.muted}>
              No templates yet. Create one, or run <code>scripts/seed-task-templates.mjs</code> to
              seed the defaults (social, event, Instagram).
            </p>
          </Card>
        ) : (
          <ul className={styles.list}>
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => setMode({ kind: "edit", template: t })}
                >
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{t.name}</span>
                    {t.description && <span className={styles.rowSub}>{t.description}</span>}
                  </span>
                  <span className={styles.rowMeta}>
                    {t.kind && <Chip tone="neutral">{TASK_KIND_LABELS[t.kind]}</Chip>}
                    <span className={styles.rowCount}>
                      {t.subtasks.length} step{t.subtasks.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <svg
                    className={styles.chevron}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminPage>
  );
}
