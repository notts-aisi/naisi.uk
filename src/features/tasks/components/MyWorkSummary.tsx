"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { useAuth } from "@/auth/AuthProvider";
import { useProjects } from "@/features/admin/useProjects";
import { isOverdue, type TaskDoc } from "@/lib/firestore/tasks";
import { useTaskRoster } from "../hooks/useTaskRoster";
import { useTasks } from "../hooks/useTasks";
import TaskDetailModal from "./TaskDetailModal";
import DueDateBadge from "./DueDateBadge";
import styles from "./MyWorkSummary.module.css";

/**
 * The member's own open tasks, on Home: one card, the late ones first.
 *
 * It renders NOTHING for somebody with no open task, which is most members
 * most of the time: the card is for a person who has been given something to
 * do (a worksheet, a week's reading mirrored from their programme, a
 * committee job), and an empty one is noise on a page that is otherwise about
 * their programme. The whole list is always one click away, at /tasks.
 *
 * A row opens the task where it stands, in the same window the task board
 * uses, so marking something done from Home is the same act as anywhere else.
 */

/** Rows past this are one scroll too many on a summary card; /tasks has all. */
const MAX_ROWS = 5;

export default function MyWorkSummary() {
  const { user, role } = useAuth();
  const { tasks } = useTasks(user ? { completerUid: user.uid } : {});
  const { projects } = useProjects();
  // Names of people on the viewer's own tasks, via a scoped route. Members and
  // non-SU committee cannot read the `users` collection directly.
  const { users } = useTaskRoster();
  const [openId, setOpenId] = useState<string | null>(null);

  const open = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const overdue = useMemo(() => open.filter((t) => isOverdue(t)), [open]);
  // Late first, then by the day each is due, then the ones with no day.
  const rows = useMemo(() => {
    const byDue = (a: TaskDoc, b: TaskDoc) => {
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    };
    return [...overdue.sort(byDue), ...open.filter((t) => !isOverdue(t)).sort(byDue)].slice(
      0,
      MAX_ROWS,
    );
  }, [open, overdue]);

  if (!user || !role || open.length === 0) return null;

  return (
    <section className={styles.card} aria-labelledby="home-my-work">
      <div className={styles.head}>
        <h2 id="home-my-work" className={styles.title}>
          My work
        </h2>
        <Badge tone={overdue.length > 0 ? "warning" : "neutral"}>
          {overdue.length > 0 ? `${overdue.length} late` : `${open.length} open`}
        </Badge>
        <Link href="/tasks" className={styles.viewAll}>
          All my work
        </Link>
      </div>

      <ul className={styles.list} role="list">
        {rows.map((task) => (
          <li key={task.id}>
            <button type="button" className={styles.row} onClick={() => setOpenId(task.id)}>
              <span className={styles.name}>{task.title}</span>
              <DueDateBadge dueDate={task.dueDate} />
            </button>
          </li>
        ))}
      </ul>

      {openId && (
        <TaskDetailModal
          key={openId}
          taskId={openId}
          viewerUid={user.uid}
          viewerRole={role}
          projects={projects}
          users={users}
          initialTask={tasks.find((t) => t.id === openId) ?? null}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}
