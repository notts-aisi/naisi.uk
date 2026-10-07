"use client";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { TaskDoc } from "@/lib/firestore/tasks";
import type { ProjectDoc } from "@/lib/firestore/projects";
import type { UserDoc } from "@/lib/firestore/users";
import TaskCard from "./TaskCard";
import { setTaskStatus } from "../taskMutations";
import styles from "./TaskList.module.css";

type Props = {
  tasks: TaskDoc[];
  projects: ProjectDoc[];
  users: UserDoc[];
  onOpenTask: (id: string) => void;
  /** If true, shows a 'Mark complete' one-click action inline on each row (for reminders). */
  showQuickComplete?: boolean;
  emptyMessage?: string;
};

export default function TaskList({
  tasks,
  projects,
  users,
  onOpenTask,
  showQuickComplete,
  emptyMessage,
}: Props) {
  if (tasks.length === 0) {
    return (
      <Card padding="md">
        <p className={styles.empty}>{emptyMessage ?? "Nothing here yet."}</p>
      </Card>
    );
  }

  return (
    <div className={styles.list}>
      {tasks.map((task) => (
        <div key={task.id} className={styles.item}>
          <TaskCard task={task} projects={projects} users={users} onOpen={onOpenTask} />
          {showQuickComplete && task.status !== "done" && (
            <div className={styles.quickComplete}>
              <Button
                size="sm"
                variant="secondary"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await setTaskStatus(task, "done");
                  } catch (err) {
                    console.error(err);
                  }
                }}
              >
                Mark done
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
