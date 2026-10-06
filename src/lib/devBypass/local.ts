import type { BypassAPI } from "./types";

/**
 * Committed inert stub.
 *
 * Production builds use this file as-is: every method returns null and
 * `isActive` is false. Every bypass branch in production code becomes a
 * no-op, so an accidental `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` on a deployed
 * backend cannot activate the bypass: the activation logic isn't here.
 */
export const bypass: BypassAPI = {
  isActive: false,
  getAuthUser: () => null,
  getAuthSnapshot: () => null,
  getServerUser: () => null,
  getUsers: () => null,
  getProjects: () => null,
  getTasks: () => null,
  getTask: () => null,
};
