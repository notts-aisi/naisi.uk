"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Modal from "@/components/ui/Modal";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import { CheckIcon, MoreIcon } from "./Icons";
import styles from "./editor.module.css";

/**
 * The small controls the committee's application editor is built from: the
 * chip, the switch with its label on the left, the tick box, the saved line,
 * the menu under a More button, and the frame every dialog shares.
 *
 * Each one is a real form control with a visible label, or a button with an
 * accessible name.
 */

export function Chip({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: "neutral" | "accent" | "live";
  dot?: boolean;
  children: ReactNode;
}) {
  const toneClass = tone === "accent" ? styles.chipAccent : tone === "live" ? styles.chipLive : "";
  return (
    <span className={`${styles.chip} ${toneClass}`}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * A switch with its label and note on the left and the track on the right.
 * A native checkbox underneath, so a keyboard and a screen reader get one.
 */
export function Toggle({
  label,
  note,
  checked,
  disabled,
  onChange,
}: {
  label: ReactNode;
  note?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`${styles.switch} ${disabled ? styles.switchOff : ""}`}>
      <span className={styles.switchText}>
        {label}
        {note && <span className={styles.switchNote}>{note}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className={styles.switchInput}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchKnob} />
      </span>
    </label>
  );
}

export function Tick({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        className={styles.checkInput}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.checkBox} aria-hidden="true">
        <CheckIcon size={14} weight={3} />
      </span>
      <span className={styles.checkLabel}>{label}</span>
    </label>
  );
}

export type SaveState = "saved" | "saving" | "waiting" | "problem";

/**
 * The line that says whether what is on screen has been stored. It is a
 * status region, so a change is announced without taking focus.
 */
export function SavedStatus({ state, problem }: { state: SaveState; problem?: string | null }) {
  if (state === "problem" || state === "waiting") {
    return (
      <span role="status" className={`${styles.status} ${styles.statusProblem}`}>
        {problem ?? "Not saved yet."}
      </span>
    );
  }
  return (
    <span role="status" className={styles.status}>
      {state === "saved" && (
        <span className={styles.statusTick}>
          <CheckIcon size={16} />
        </span>
      )}
      {state === "saved" ? "Saved" : "Saving…"}
    </span>
  );
}

export type MenuAction = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  careful?: boolean;
};

/**
 * A button with a short menu under it. Escape and a press outside close it,
 * and focus goes back to the button it came from.
 *
 * `label` names the button for assistive technology when what it shows is an
 * icon, or needs more context than its own words give ("Add a reviewer").
 */
export function MenuButton({
  label,
  className,
  children,
  actions,
  placement = "above",
  align = "right",
  disabled,
  empty,
}: {
  label: string;
  className: string;
  children: ReactNode;
  actions: MenuAction[];
  placement?: "above" | "below";
  /** Which edge of the button the menu lines up with. */
  align?: "left" | "right";
  disabled?: boolean;
  /** What the menu says when it has nothing to offer. */
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (anchor.current && !anchor.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className={styles.menuAnchor} ref={anchor}>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
      >
        {children}
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-label={label}
          className={`${styles.menu} ${placement === "below" ? styles.menuBelow : ""} ${align === "left" ? styles.menuFromLeft : ""}`}
        >
          {actions.length === 0 && empty && (
            <li role="none" className={styles.menuEmpty}>
              {empty}
            </li>
          )}
          {actions.map((action) => (
            <li key={action.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={`${styles.menuItem} ${action.careful ? styles.menuItemCareful : ""}`}
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  button.current?.focus();
                  action.onSelect();
                }}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/** The three dots: a menu of the less common things to do with one item. */
export function MoreMenu({
  label,
  actions,
  placement = "above",
  disabled,
}: {
  /** The button's accessible name: "More for question 1". */
  label: string;
  actions: MenuAction[];
  placement?: "above" | "below";
  disabled?: boolean;
}) {
  return (
    <MenuButton
      label={label}
      className={`${styles.btn} ${styles.btnIcon}`}
      actions={actions}
      placement={placement}
      disabled={disabled}
    >
      <MoreIcon />
    </MenuButton>
  );
}

/**
 * The frame every dialog here shares. The site's Modal renders outside the
 * page, so the kit's wrapper is repeated inside it: without that the dialog
 * would lose the metadata font and the colours the screens add.
 */
export function DialogFrame({
  open,
  title,
  onClose,
  children,
  actions,
  width = "md",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
  width?: "sm" | "md";
}) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel={title} width={width}>
      <ApplicationsRoot className={styles.page}>
        <div className={styles.dialog}>
          <h2 className={styles.dialogTitle}>{title}</h2>
          {children}
          <div className={styles.dialogActions}>{actions}</div>
        </div>
      </ApplicationsRoot>
    </Modal>
  );
}
