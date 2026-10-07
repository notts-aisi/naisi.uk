"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import ResponsiveSelect, {
  type ResponsiveSelectOption,
} from "@/components/ui/ResponsiveSelect";
import PersonSelector from "@/components/ui/PersonSelector";
import type { ProjectDoc } from "@/lib/firestore/projects";
import type { UserDoc } from "@/lib/firestore/users";
import { createProject, updateProject } from "./adminMutations";
import { AdminPanel, AdminProblem } from "./adminPanels";
import styles from "./Projects.module.css";

type Props = {
  existing?: ProjectDoc;
  committee: UserDoc[];
  onDone: () => void;
};

export default function ProjectForm({ existing, committee, onDone }: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [leadUid, setLeadUid] = useState(existing?.leadUid ?? "");
  const [memberUids, setMemberUids] = useState<string[]>(existing?.memberUids ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lead must be committee or admin (same gate as before). The previous build
  // also defaulted leadUid to committee[0].uid but that silently picked a lead
  // without the user realising, so the first option is an explicit placeholder.
  const leadOptions = useMemo(
    () =>
      committee
        .filter((m) => m.role === "committee" || m.role === "admin")
        .sort((a, b) =>
          (a.displayName ?? a.email ?? "").localeCompare(b.displayName ?? b.email ?? ""),
        ),
    [committee],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Project needs a name.");
      return;
    }
    if (!leadUid) {
      setError("Pick a lead.");
      return;
    }
    setBusy(true);
    try {
      if (existing) {
        await updateProject(existing.id, { name: name.trim(), leadUid, memberUids });
      } else {
        await createProject({ name: name.trim(), leadUid, memberUids });
      }
      onDone();
    } catch (err) {
      console.error(err);
      setError("That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title={existing ? "Edit project" : "New project"}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <Field id="project-name" label="Name">
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Technical reading group"
            required
          />
        </Field>

        <Field id="project-lead" label="Lead" hint="Committee members and admins only.">
          <ResponsiveSelect
            value={leadUid}
            onChange={setLeadUid}
            options={
              [
                { value: "", label: "Pick a lead" },
                ...leadOptions.map((m) => ({
                  value: m.uid,
                  label: `${m.displayName ?? m.email ?? m.uid}${
                    m.role === "admin" ? " (admin)" : ""
                  }`,
                })),
              ] satisfies ResponsiveSelectOption[]
            }
            ariaLabel="Lead"
          />
        </Field>

        <Field
          id="project-members"
          label="Members"
          hint="Filter by role or search by name. Anybody with an account can be a project member."
        >
          <PersonSelector
            users={committee}
            selected={memberUids}
            onChange={setMemberUids}
            max={50}
            tone="neutral"
            showRoleFilter
          />
        </Field>

        {error && <AdminProblem>{error}</AdminProblem>}

        <div className={styles.formActions}>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : existing ? "Save changes" : "Create project"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </AdminPanel>
  );
}
