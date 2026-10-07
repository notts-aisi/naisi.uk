import type { CSSProperties, ReactNode } from "react";
import styles from "./programme.module.css";

export type FactRow = {
  label: string;
  value: ReactNode;
  /** A second, quieter line under the answer. */
  note?: ReactNode;
};

type Props = {
  rows: FactRow[];
  /** How wide the label column is. The longest label decides it. */
  labelWidth?: string;
};

/** Rows of a small label and its answer, each under a hairline. */
export default function FactRows({ rows, labelWidth }: Props) {
  if (rows.length === 0) return null;
  const style = labelWidth ? ({ "--row-label": labelWidth } as CSSProperties) : undefined;
  return (
    <dl className={styles.rows} style={style}>
      {rows.map((row) => (
        <div key={row.label} className={styles.row}>
          <dt className={`meta ${styles.rowLabel}`}>{row.label}</dt>
          <dd className={styles.rowValue}>
            {row.value}
            {row.note ? <span className={styles.rowNote}>{row.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
