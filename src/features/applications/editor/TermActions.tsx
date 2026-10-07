"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import Select from "@/components/ui/Select";
import kit from "@/features/applications/kit/kit.module.css";
import { APPLICATION_LIMITS, PROGRAMME_KINDS, type ProgrammeKind } from "@/lib/applications/model";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { DialogFrame, MoreMenu } from "./controls";
import { createForm, patchForm } from "./editorClient";
import { PlusIcon } from "./Icons";
import shared from "./editor.module.css";

/**
 * The few things an admin starts from the term's pages: a new application
 * form, a new programme on one, and the order the programmes are shown in.
 *
 * Each is a button that opens a short dialog, saves through the form's own
 * route, and then moves on to the thing it made.
 */

const L = APPLICATION_LIMITS;

const KIND_LABEL: Record<ProgrammeKind, string> = {
  fellowship: "A fellowship",
  incubator: "An incubator",
};

function useSaving() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not save.");
      setBusy(false);
    }
  };
  return { busy, problem, run };
}

/** Make an application form, then open it. */
export function NewFormButton() {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const { busy, problem, run } = useSaving();

  return (
    <>
      <button type="button" className={shared.btn} onClick={() => setOpen(true)}>
        <PlusIcon />
        <span>New application form</span>
      </button>
      {open && (
        <DialogFrame
          open
          width="sm"
          title="New application form"
          onClose={() => setOpen(false)}
          actions={
            <>
              <button type="button" className={shared.btn} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={kit.primary}
                disabled={busy || !label.trim()}
                onClick={() =>
                  run(async () => {
                    const created = await createForm(label);
                    router.push(applicationFormPath(created.id));
                  })
                }
              >
                {busy ? "Making it…" : "Make the form"}
              </button>
            </>
          }
        >
          <p className={shared.dialogText}>
            One form for the term. It starts as a draft, and nobody can apply to a draft.
          </p>
          <div className={shared.field}>
            <label htmlFor={`${ids}-label`} className={shared.label}>
              Name
            </label>
            <input
              id={`${ids}-label`}
              type="text"
              className={shared.input}
              value={label}
              placeholder="Autumn 2026"
              maxLength={80}
              onChange={(event) => setLabel(event.target.value)}
            />
            <p className={shared.hint}>The term it is for. Applicants see it at the top of the form.</p>
          </div>
          {problem && (
            <p role="alert" className={shared.problem}>
              {problem}
            </p>
          )}
        </DialogFrame>
      )}
    </>
  );
}

/** Add a programme to a form, then open its settings. */
export function NewProgrammeButton({ roundId }: { roundId: string }) {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [kind, setKind] = useState<ProgrammeKind>("fellowship");
  const { busy, problem, run } = useSaving();

  return (
    <>
      <button type="button" className={shared.btn} onClick={() => setOpen(true)}>
        <PlusIcon />
        <span>New programme</span>
      </button>
      {open && (
        <DialogFrame
          open
          title="New programme"
          onClose={() => setOpen(false)}
          actions={
            <>
              <button type="button" className={shared.btn} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={kit.primary}
                disabled={busy || !name.trim()}
                onClick={() =>
                  run(async () => {
                    const saved = await patchForm(roundId, {
                      addProgramme: { name, shortName: shortName.trim() || name, kind },
                    });
                    const home = applicationFormPath(roundId);
                    router.push(
                      saved.addedProgrammeId
                        ? `${home}/programmes/${saved.addedProgrammeId}/setup`
                        : home,
                    );
                    router.refresh();
                  })
                }
              >
                {busy ? "Adding…" : "Add the programme"}
              </button>
            </>
          }
        >
          <p className={shared.dialogText}>
            It joins the application form with a question set of its own. You name its lead and fill
            in the rest on its Settings tab.
          </p>
          <div className={shared.dialogFields}>
            <div className={shared.field}>
              <label htmlFor={`${ids}-name`} className={shared.label}>
                Name
              </label>
              <input
                id={`${ids}-name`}
                type="text"
                className={shared.input}
                value={name}
                placeholder="AGI Strategy Fellowship"
                maxLength={L.programmeName}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className={shared.field}>
              <label htmlFor={`${ids}-short`} className={shared.label}>
                Short name <span className={shared.optional}>(optional)</span>
              </label>
              <input
                id={`${ids}-short`}
                type="text"
                className={shared.input}
                value={shortName}
                placeholder="AGI Strategy"
                maxLength={L.programmeShortName}
                onChange={(event) => setShortName(event.target.value)}
              />
              <p className={shared.hint}>What rankings, chips and emails call it.</p>
            </div>
            <div className={shared.field}>
              <label htmlFor={`${ids}-kind`} className={shared.label}>
                What it is
              </label>
              <Select
                id={`${ids}-kind`}
                className={shared.select}
                value={kind}
                onChange={(event) => setKind(event.target.value as ProgrammeKind)}
              >
                {PROGRAMME_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {KIND_LABEL[option]}
                  </option>
                ))}
              </Select>
              <p className={shared.hint}>
                Fellowships share one set of general questions. This cannot be changed afterwards.
              </p>
            </div>
            {problem && (
              <p role="alert" className={shared.problem}>
                {problem}
              </p>
            )}
          </div>
        </DialogFrame>
      )}
    </>
  );
}

/**
 * Where one programme sits in the order applicants are shown them. Buttons,
 * not a drag: there are three or four of them.
 */
export function ProgrammeOrderMenu({
  roundId,
  programmeId,
  name,
  order,
}: {
  roundId: string;
  programmeId: string;
  name: string;
  /** Every programme id on the form, in its current order. */
  order: string[];
}) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const at = order.indexOf(programmeId);

  const move = async (by: -1 | 1) => {
    const next = [...order];
    const to = at + by;
    if (at === -1 || to < 0 || to >= next.length) return;
    [next[at], next[to]] = [next[to], next[at]];
    try {
      await patchForm(roundId, { programmeIds: next });
      setProblem(null);
      router.refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not save.");
    }
  };

  return (
    <>
      <MoreMenu
        label={`More for ${name}`}
        actions={[
          { label: "Show it earlier", onSelect: () => void move(-1), disabled: at <= 0 },
          { label: "Show it later", onSelect: () => void move(1), disabled: at === order.length - 1 },
        ]}
      />
      {problem && (
        <span role="alert" className={shared.problem}>
          {problem}
        </span>
      )}
    </>
  );
}
