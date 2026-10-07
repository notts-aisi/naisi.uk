"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import type { ProjectDoc } from "@/lib/firestore/projects";
import type { UserDoc } from "@/lib/firestore/users";
import { AdminMoreMenu } from "./adminList";
import ProjectForm from "./ProjectForm";
import { deleteProject, setProjectArchived } from "./adminMutations";
import styles from "./Projects.module.css";

type Props = {
  project: ProjectDoc;
  committee: UserDoc[];
};

/**
 * One project: its name, its lead and who is on it. Edit is beside it; what
 * is done rarely (archiving it, deleting it) is behind the "more" button, and
 * each still asks first.
 */
export default function ProjectCard({ project, committee }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const lead = useMemo(
    () => committee.find((m) => m.uid === project.leadUid),
    [committee, project.leadUid],
  );
  const members = useMemo(
    () => committee.filter((m) => project.memberUids.includes(m.uid)),
    [committee, project.memberUids],
  );

  if (editing) {
    return <ProjectForm existing={project} committee={committee} onDone={() => setEditing(false)} />;
  }

  async function toggleArchive() {
    const verb = project.archived ? "Unarchive" : "Archive";
    if (!window.confirm(`${verb} "${project.name}"?`)) return;
    setBusy(true);
    try {
      await setProjectArchived(project.id, !project.archived);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Permanently delete "${project.name}"? This can't be undone. Any tasks linked to it will lose their project reference.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteProject(project.id);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
    // On success the list drops the card the next time it is read.
  }

  return (
    <article className={project.archived ? `${styles.card} ${styles.cardArchived}` : styles.card}>
      <div className={styles.cardMain}>
        <div className={styles.titleRow}>
          <h2 className={styles.name}>{project.name}</h2>
          {project.archived && <Chip tone="neutral">Archived</Chip>}
        </div>
        <p className={styles.sub}>
          Lead: {lead?.displayName ?? lead?.email ?? "nobody yet"} · {members.length} member
          {members.length === 1 ? "" : "s"}
        </p>
        {members.length > 0 && (
          <div className={styles.members}>
            {members.map((m) => (
              <Chip key={m.uid} tone="neutral">
                {m.displayName ?? m.email}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <div className={styles.cardActions}>
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </Button>
        <AdminMoreMenu
          label={`More for ${project.name}`}
          items={[
            {
              key: "archive",
              label: project.archived ? "Unarchive" : "Archive",
              note: project.archived
                ? "Puts it back in the list people pick from."
                : "Takes it out of the list people pick from. Its tasks keep it.",
              disabled: busy,
              onSelect: () => void toggleArchive(),
            },
            {
              key: "delete",
              label: "Delete project…",
              note: "For good. Tasks linked to it lose their project.",
              careful: true,
              disabled: busy,
              onSelect: () => void handleDelete(),
            },
          ]}
        />
      </div>
    </article>
  );
}
