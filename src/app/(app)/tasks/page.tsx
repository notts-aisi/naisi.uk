"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/auth/AuthProvider";
import { useProjects } from "@/features/admin/useProjects";
import TaskDetailModal from "@/features/tasks/components/TaskDetailModal";
import TaskList from "@/features/tasks/components/TaskList";
import { useTaskRoster } from "@/features/tasks/hooks/useTaskRoster";
import { useTasks } from "@/features/tasks/hooks/useTasks";
import { createTask } from "@/features/tasks/taskMutations";
import { isOverdue } from "@/lib/firestore/tasks";
import styles from "./tasks.module.css";

type Tab = "due-soon" | "all-open" | "completed";

export default function MyWorkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get("task");

  const { user, role } = useAuth();
  const { tasks, loading } = useTasks(user ? { completerUid: user.uid, includeArchived: false } : {});
  const { projects } = useProjects();
  // Names of people on the viewer's own tasks. Members + non-SU committee
  // cannot read the `users` collection, so this comes from a scoped route.
  const { users } = useTaskRoster();

  const [tab, setTab] = useState<Tab>("due-soon");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);

  const { dueSoon, allOpen, completed } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done");
    const sortedDueSoon = [...open].sort((a, b) => {
      const ao = isOverdue(a) ? 0 : 1;
      const bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
    return {
      dueSoon: sortedDueSoon,
      allOpen: open,
      completed: tasks.filter((t) => t.status === "done"),
    };
  }, [tasks]);

  function openTask(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", id);
    router.replace(`/tasks?${params.toString()}`);
  }
  function closeTask() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const qs = params.toString();
    router.replace(qs ? `/tasks?${qs}` : "/tasks");
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickTitle.trim() || !user) return;
    setQuickBusy(true);
    try {
      await createTask({
        title: quickTitle.trim(),
        source: "personal",
        completerUids: [user.uid],
        visibility: "assignees-only",
      });
      setQuickTitle("");
    } catch (err) {
      console.error(err);
    } finally {
      setQuickBusy(false);
    }
  }

  if (!user || !role) return null;

  const visible = tab === "due-soon" ? dueSoon : tab === "all-open" ? allOpen : completed;

  return (
    <div>
      <div className={styles.header}>
        <Badge tone="accent">My work</Badge>
        <h1 className={styles.title}>Your tasks</h1>
        <p className={styles.subtitle}>
          Everything assigned to you: committee work, fellowship reminders, and your own to-dos.
        </p>
      </div>

      <Card padding="md" className={styles.quickAdd}>
        <form onSubmit={handleQuickAdd} className={styles.quickAddForm}>
          <Input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Quick add: a personal task for you"
            maxLength={120}
            style={{ flex: 1 }}
          />
          <Button type="submit" disabled={!quickTitle.trim() || quickBusy}>
            {quickBusy ? "Adding…" : "Add"}
          </Button>
        </form>
      </Card>

      <div role="tablist" className={styles.tabs}>
        <TabButton active={tab === "due-soon"} onClick={() => setTab("due-soon")} count={dueSoon.length}>
          Due soon
        </TabButton>
        <TabButton active={tab === "all-open"} onClick={() => setTab("all-open")} count={allOpen.length}>
          All open
        </TabButton>
        <TabButton active={tab === "completed"} onClick={() => setTab("completed")} count={completed.length}>
          Completed
        </TabButton>
      </div>

      {loading ? (
        <p className={styles.loading}>Loading tasks…</p>
      ) : (
        <TaskList
          tasks={visible}
          projects={projects}
          users={users}
          onOpenTask={openTask}
          showQuickComplete={tab !== "completed"}
          emptyMessage={
            tab === "completed" ? "Nothing completed yet." : "You're all caught up."
          }
        />
      )}

      {openTaskId && (
        <TaskDetailModal
          key={openTaskId}
          taskId={openTaskId}
          viewerUid={user.uid}
          viewerRole={role}
          projects={projects}
          users={users}
          initialTask={visible.find((t) => t.id === openTaskId) ?? null}
          onClose={closeTask}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
    >
      {children}
      <span className={styles.tabCount}>{count}</span>
    </button>
  );
}
