"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHead from "@/components/ui/PageHead";
import {
  AdminFilterPill,
  AdminPage,
  AdminLoadingBar,
  AdminListFooter,
  useClientPagination,
} from "@/features/admin/adminList";
import { AdminProblem } from "@/features/admin/adminPanels";
import ProjectCard from "@/features/admin/ProjectCard";
import ProjectForm from "@/features/admin/ProjectForm";
import styles from "@/features/admin/Projects.module.css";
import { useMembers } from "@/features/admin/useMembers";
import { useProjects } from "@/features/admin/useProjects";

/**
 * Projects: the groups of committee work a task can belong to.
 *
 * Under `(admin-only)`, so `requireAdminPage()` in that group's layout is the
 * gate. Reads and writes go client-direct under the admin-only `projects`
 * rule, and the people pickers read the roster the Accounts list reads.
 */
export default function ProjectsAdminPage() {
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { projects, loading, refreshing, error, reload } = useProjects();
  const { users: members } = useMembers();

  const visible = projects.filter((p) => (showArchived ? true : !p.archived));

  const { shown, hasMore, loadMore, total, shownCount } = useClientPagination(visible, 20);

  return (
    <AdminPage wide>
      <PageHead
        crumb="Site settings"
        title="Projects"
        description="The groups of committee work a task can belong to, each with a lead and its members."
        meta={
          !loading && !error ? (
            <span>
              {visible.length} {visible.length === 1 ? "project" : "projects"}
              {showArchived ? ", archived ones included" : ", not counting archived ones"}
            </span>
          ) : undefined
        }
        actions={
          creating ? (
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          ) : (
            <Button onClick={() => setCreating(true)}>New project</Button>
          )
        }
      />

      <div className={styles.column}>
        <div className={styles.filters}>
          <AdminFilterPill pressed={showArchived} onToggle={() => setShowArchived((v) => !v)}>
            Show archived
          </AdminFilterPill>
        </div>

        {creating && <ProjectForm committee={members} onDone={() => setCreating(false)} />}

        {error && <AdminProblem>Couldn&apos;t load: {error.message}</AdminProblem>}

        {loading && (
          <Card padding="md">
            <AdminLoadingBar label="Loading projects…" />
          </Card>
        )}

        {!loading && !error && visible.length === 0 && !creating && (
          <Card padding="md">
            <p className={styles.muted}>
              No projects yet. Press <strong>New project</strong> to make the first one.
            </p>
          </Card>
        )}

        {shown.map((p) => (
          <ProjectCard key={p.id} project={p} committee={members} />
        ))}

        {!loading && !error && total > 0 && (
          <AdminListFooter
            shownCount={shownCount}
            total={total}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onRefresh={reload}
            refreshing={refreshing}
            noun="projects"
          />
        )}
      </div>
    </AdminPage>
  );
}
