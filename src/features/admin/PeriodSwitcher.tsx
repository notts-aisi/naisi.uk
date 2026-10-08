"use client";

import ResponsiveSelect, {
  type ResponsiveSelectOption,
} from "@/components/ui/ResponsiveSelect";
import styles from "./PeriodSwitcher.module.css";

/**
 * Which year the counts, the import, the table and the export are all about.
 *
 * SEPARATE FROM THE CURRENT POINTER, on purpose. `config/membership` decides
 * which year every badge on the site reads; this decides which year an admin
 * is LOOKING at. Conflating them is how somebody re-badges the whole society
 * while meaning to check last year's list, so the switcher never writes. The
 * console beside it says out loud when the year on show is not the current
 * one.
 */

export type PeriodOption = {
  id: string;
  year: string;
  label: string;
};

export default function PeriodSwitcher({
  periods,
  value,
  currentPeriodId,
  onChange,
  disabled,
}: {
  periods: PeriodOption[];
  value: string;
  currentPeriodId: string | null;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  if (periods.length === 0) return null;
  return (
    <div className={styles.wrap} data-testid="membership-period-switcher">
      <label className={styles.field} htmlFor="membership-period">
        <span className={styles.fieldLabel}>Year</span>
        <ResponsiveSelect
          id="membership-period"
          value={value}
          onChange={onChange}
          disabled={disabled}
          ariaLabel="Year"
          options={periods.map<ResponsiveSelectOption>((period) => ({
            value: period.id,
            label:
              period.id === currentPeriodId
                ? `${period.label || period.year} (current)`
                : period.label || period.year,
          }))}
        />
      </label>
    </div>
  );
}
