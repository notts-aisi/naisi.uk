import type { User } from "firebase/auth";
import type { Role, SessionUser } from "@/lib/firebase/session";
import type { UserPermissions, UserDoc } from "@/lib/firestore/users";
import type { ProjectDoc } from "@/lib/firestore/projects";
import type { TaskDoc, TaskSource } from "@/lib/firestore/tasks";

export type BypassedTasksQuery = {
  projectId?: string;
  completerUid?: string;
  source?: TaskSource;
  visibility?: "committee" | "assignees-only";
  includeArchived?: boolean;
};

export type BypassAuthSnapshot = {
  role: Role;
  permissions: UserPermissions;
  suRecognised: boolean;
};

/**
 * Optional dev-only auth bypass. The committed `bypass` export (in
 * `./local`) is inert: every method returns null and `isActive` is false,
 * so production-code bypass branches are no-ops in deployed builds.
 *
 * Bypass cedes to any real Firebase Auth session: AuthProvider,
 * getCurrentUser, and proxy.ts consult these methods only when there is
 * no real signed-in user.
 */
export type BypassAPI = {
  /** True iff the bypass is active. False in the committed stub. */
  isActive: boolean;
  /** Client-side fake Firebase User for AuthProvider fallback. */
  getAuthUser: () => User | null;
  /** Role + permissions + suRecognised snapshot to pair with getAuthUser. */
  getAuthSnapshot: () => BypassAuthSnapshot | null;
  /** Server-side fake SessionUser for getCurrentUser fallback. */
  getServerUser: () => SessionUser | null;
  /** Admin members fixture list, or null when bypass is off. */
  getUsers: () => UserDoc[] | null;
  /** Projects fixture list, or null when bypass is off. */
  getProjects: () => ProjectDoc[] | null;
  /** Filtered tasks fixture list, or null when bypass is off. */
  getTasks: (query: BypassedTasksQuery) => TaskDoc[] | null;
  /** Single task by ID. Null when bypass off OR id not in fixtures. */
  getTask: (taskId: string) => TaskDoc | null;
};
