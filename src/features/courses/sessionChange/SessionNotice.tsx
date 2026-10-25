import type { CSSProperties } from "react";
import type { OverviewSessionNotice } from "@/app/api/courses/runs/[runId]/overview/route";
import { londonDateKey } from "@/lib/courses/weekPlan";
import {
  noticeCancelledLine,
  noticeHeading,
  noticeKeepPaceLine,
  noticePushedLine,
} from "@/lib/courses/sessionChange/words";

/**
 * "No session tonight" (wk-changes): a cancelled evening, why, and what to do
 * instead, on the programme page of the people it is for and on their
 * facilitators' group page.
 *
 * Every word is from records: the date, the reason the group was given, and
 * the session that comes next. "Tonight" and "today" are worked out from the
 * clock against the date in London, so the heading becomes the evening's own
 * on the day.
 *
 * Styled inline, from the theme's tokens, like the group page it also sits
 * on: a warning card 16px inside a 12px corner, its heading in the display
 * face at 19px beside the triangle, two 15px lines under it. Nothing in it
 * changes with the width of the screen.
 */

const noticeStyle: CSSProperties = {
  padding: 16,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-warning-soft)",
  border: "1px solid var(--color-warning-line)",
  minWidth: 0,
};

const headStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 };

const iconStyle: CSSProperties = { display: "inline-flex", flex: "none", color: "var(--color-warning)" };

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: "1.1875rem",
  lineHeight: 1.25,
  letterSpacing: "-0.01em",
  color: "var(--color-text)",
};

const lineStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-ui)",
  lineHeight: 1.5,
  color: "var(--color-text)",
  overflowWrap: "anywhere",
};

export default function SessionNotice({ notice, now = new Date() }: { notice: OverviewSessionNotice; now?: Date }) {
  const today = londonDateKey(now);
  return (
    <section style={noticeStyle} role="status">
      <div style={headStyle}>
        <span style={iconStyle} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4l9 16H3z" />
            <path d="M12 10v4M12 17v.5" />
          </svg>
        </span>
        <h3 style={headingStyle}>{noticeHeading(notice.dateKey, notice.startTimeLocal, today)}</h3>
      </div>
      <p style={lineStyle}>{noticeCancelledLine(notice.dateKey, notice.reason)}</p>
      <p style={{ ...lineStyle, marginTop: 8 }}>
        {notice.kind === "cancelled"
          ? noticeKeepPaceLine(notice.weekNumber, notice.next)
          : noticePushedLine(notice.weekNumber, notice.next?.dateKey ?? "")}
      </p>
    </section>
  );
}
