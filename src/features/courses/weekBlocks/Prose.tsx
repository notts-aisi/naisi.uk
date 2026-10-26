import type { ReactNode } from "react";
import { safeLinkUrl, type Prose as ProseData, type Run, type TableCell } from "@/lib/courses/weekBlocks/prose";

/**
 * RICH TEXT OF A WEEK WRITTEN AS BLOCKS, DRAWN (`src/lib/courses/weekBlocks/
 * prose.ts`): paragraphs, lists, tables and code, each run a text node, made
 * bold or italic by an element, and a link only when its address passes
 * `safeLinkUrl` again here, where it is drawn. Nothing is ever handed to
 * `dangerouslySetInnerHTML`: this is the boundary between whatever a week's
 * Markdown held and the page. Code is drawn exactly as written, in a `pre`,
 * every space and line kept.
 *
 * No hooks and no browser API, so a server page and a page in the browser
 * draw the same elements from the same data. The one renderer of a week's
 * prose: the member's week page and the public course pages both use it.
 */

type LinkProps = { linkClassName?: string };

/** One line of runs. */
export function Runs({ runs, linkClassName }: { runs: readonly Run[] } & LinkProps) {
  return (
    <>
      {runs.map((run, index) => (
        <RunView key={index} run={run} linkClassName={linkClassName} />
      ))}
    </>
  );
}

function RunView({ run, linkClassName }: { run: Run } & LinkProps) {
  let node: ReactNode = run.text;
  if (run.italic) node = <em>{node}</em>;
  if (run.bold) node = <strong>{node}</strong>;
  const href = run.href ? safeLinkUrl(run.href) : null;
  if (!href) return <>{node}</>;
  // An address in running text opens beside the page, as every source does;
  // a mail address opens the mail program.
  return href.startsWith("mailto:") ? (
    <a href={href} className={linkClassName}>
      {node}
    </a>
  ) : (
    <a href={href} className={linkClassName} target="_blank" rel="noopener noreferrer">
      {node}
    </a>
  );
}

type Props = {
  prose: ProseData;
  /** On the wrapper. */
  className?: string;
  /** On each paragraph. */
  paragraphClassName?: string;
  /** On each list. */
  listClassName?: string;
  /** On the box around each table, which scrolls sideways on its own when the table is wider than the page. */
  tableClassName?: string;
  /** On each block of code. */
  codeClassName?: string;
} & LinkProps;

function Cells({ cells, as, linkClassName }: { cells: readonly TableCell[]; as: "th" | "td" } & LinkProps) {
  return (
    <>
      {cells.map((cell, index) =>
        as === "th" ? (
          <th key={index} scope="col">
            <Runs runs={cell.runs} linkClassName={linkClassName} />
          </th>
        ) : (
          <td key={index}>
            <Runs runs={cell.runs} linkClassName={linkClassName} />
          </td>
        ),
      )}
    </>
  );
}

/** Paragraphs, lists, tables and code, in order. Nothing at all for empty prose. */
export default function Prose({
  prose,
  className,
  paragraphClassName,
  listClassName,
  tableClassName,
  codeClassName,
  linkClassName,
}: Props) {
  if (prose.length === 0) return null;
  return (
    <div className={className}>
      {prose.map((paragraph, index) => {
        switch (paragraph.type) {
          case "p":
            return (
              <p key={index} className={paragraphClassName}>
                <Runs runs={paragraph.runs} linkClassName={linkClassName} />
              </p>
            );
          case "ul":
          case "ol": {
            const items = paragraph.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Runs runs={item.runs} linkClassName={linkClassName} />
              </li>
            ));
            return paragraph.type === "ol" ? (
              <ol key={index} className={listClassName}>
                {items}
              </ol>
            ) : (
              <ul key={index} className={listClassName}>
                {items}
              </ul>
            );
          }
          case "table":
            return (
              <div key={index} className={tableClassName}>
                <table>
                  <thead>
                    <tr>
                      <Cells cells={paragraph.header} as="th" linkClassName={linkClassName} />
                    </tr>
                  </thead>
                  <tbody>
                    {paragraph.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <Cells cells={row.cells} as="td" linkClassName={linkClassName} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <pre key={index} className={codeClassName}>
                <code>{paragraph.text}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
