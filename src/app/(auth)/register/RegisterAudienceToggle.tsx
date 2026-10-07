"use client";

import { motion } from "motion/react";
import styles from "./registerSignIn.module.css";

export type RegisterAudience = "member" | "collaborator";

const OPTIONS: { value: RegisterAudience; label: string; title: string }[] = [
  {
    value: "member",
    label: "Student / staff",
    title: "Current University of Nottingham students and staff",
  },
  {
    value: "collaborator",
    label: "External collaborator",
    title: "Researchers and partners outside the University of Nottingham",
  },
];

/**
 * Controlled audience toggle for the unified /register entry. Local-state
 * driven (no route change) so flipping it morphs the form in place rather than
 * triggering a page transition. The active pill is a shared-layout `motion.span`
 * (`layoutId`), so it slides fluidly between the two segments.
 */
export default function RegisterAudienceToggle({
  value,
  onChange,
}: {
  value: RegisterAudience;
  onChange: (next: RegisterAudience) => void;
}) {
  return (
    <div className={styles.toggleBlock}>
      <p className={styles.toggleLabel}>Registering as</p>
      <div
        role="radiogroup"
        aria-label="Choose whether you're a University of Nottingham member or an external collaborator"
        className={styles.toggle}
      >
        {OPTIONS.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={opt.title}
              onClick={() => onChange(opt.value)}
              className={styles.toggleOption}
              style={{ color: active ? "var(--color-on-accent)" : "var(--color-text-muted)" }}
            >
              {active && (
                <motion.span
                  layoutId="register-audience-pill"
                  aria-hidden="true"
                  className={styles.togglePill}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className={styles.toggleText}>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
