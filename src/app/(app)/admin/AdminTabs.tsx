"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { usePendingCount } from "@/features/admin/usePendingCount";
import { useCollaboratorCount } from "@/features/admin/useCollaboratorCount";
import { useCourseApplicationCount } from "@/features/courses/useCourseApplicationCount";
import {
  ADMIN_SECTIONS,
  adminPageFor,
  adminSectionFor,
  type AdminPage,
  type AdminTabAccess,
} from "@/layout/appNav";
import styles from "./AdminTabs.module.css";

// The layout imports the type from here, as it always has.
export type { AdminTabAccess } from "@/layout/appNav";

/**
 * The head of every admin page: the name of the section somebody is in, and a
 * strip of that section's pages.
 *
 * The admin area used to be one strip of seventeen tabs. It is now four
 * sections (People, Programmes, Publicity, Site settings), each reached from
 * the sidebar, and the strip shows only the pages of the section the address
 * belongs to. The sections and their pages are data in `src/layout/appNav.ts`,
 * which the sidebar reads too, so the entry lit in the sidebar and the strip
 * drawn here cannot disagree about where a page lives.
 *
 * `access` comes from the server layout, which has already read the session, so
 * the strip stays in step with the gates that actually decide
 * (`requireAdminPage()`, `requireCourseAuthorPage()`,
 * `requireAdmissionsPage()`, `requireMembershipPage()`) instead of being a
 * second client-side opinion that could drift from them. Every page is listed
 * only for the callers its own gate would let in.
 *
 * Somebody who can open one page of a section and no other (a course drafter,
 * whoever looks after SU membership) gets that page's name as the heading and
 * no strip: a strip of one is a promise of more.
 */
export default function AdminTabs({ access }: { access: AdminTabAccess }) {
  const pathname = usePathname();
  const pendingCount = usePendingCount();
  const collaboratorCount = useCollaboratorCount();
  const courseApplicationCount = useCourseApplicationCount();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // The section the address belongs to. An address in no section (a page added
  // without a place here, which tests/app-frame.test.mjs fails) falls back to
  // the first section the caller can open something in, so the head still
  // offers a way around.
  const section = useMemo(
    () =>
      adminSectionFor(pathname) ??
      ADMIN_SECTIONS.find((s) => s.pages.some((p) => p.visible(access))) ??
      ADMIN_SECTIONS[0],
    [pathname, access],
  );
  const pages = useMemo(
    () => section.pages.filter((page) => page.visible(access)),
    [section, access],
  );
  const activePage = adminPageFor(section, pathname);

  // `?? 0` for courses: that hook reports an unknown count as null (see its
  // doc comment), and a count that hasn't been measured renders as no count.
  const countFor = (page: AdminPage): number =>
    page.count === "joinRequests"
      ? pendingCount
      : page.count === "collaborators"
        ? collaboratorCount
        : page.count === "courseApplications"
          ? (courseApplicationCount ?? 0)
          : 0;

  // On the horizontal strip pull the current page into view, so somebody
  // landing on a page late in a long section does not have to scroll the strip
  // to find it.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  // Close the phone's picker once navigation lands on a new route.
  // Render-phase derived reset (not a setState-in-effect): the pattern in
  // Dropdown.tsx.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (menuOpen) setMenuOpen(false);
  }

  const single = pages.length === 1 ? pages[0] : null;
  const activeCount = activePage ? countFor(activePage) : 0;

  return (
    <div className={styles.head}>
      <h1 className={styles.title}>{single ? single.label : section.label}</h1>

      {!single && pages.length > 0 && (
        <>
          {/* Desktop and tablet: the strip (it scrolls inside itself, see the
              stylesheet). */}
          <nav className={styles.tabs} aria-label={`${section.label} pages`}>
            {pages.map((page) => {
              const active = page === activePage;
              const count = countFor(page);
              return (
                <Link
                  key={page.href}
                  href={page.href}
                  ref={active ? activeRef : undefined}
                  className={`${styles.tab} ${active ? styles.active : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span>{page.label}</span>
                  {count > 0 && <span className={styles.count}>{count}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Phone: one button naming the page, which opens the section's
              pages as a list. */}
          <button
            type="button"
            className={styles.mobileTrigger}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="admin-section-menu"
            onClick={() => setMenuOpen(true)}
          >
            <span className={styles.mobileTriggerLabel}>
              <span className={`meta ${styles.mobileTriggerHint}`}>Page</span>
              <span className={styles.mobileTriggerValue}>
                {activePage?.label ?? section.label}
              </span>
            </span>
            {activeCount > 0 && <span className={styles.count}>{activeCount}</span>}
            <svg className={styles.mobileChevron} viewBox="0 0 12 8" aria-hidden="true">
              <path
                d="M1 1.5L6 6.5L11 1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <Drawer
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            id="admin-section-menu"
            ariaLabel={`${section.label} pages`}
          >
            <div className={styles.sheet}>
              <div className={styles.sheetHead}>
                <h2 className={styles.sheetTitle}>{section.label}</h2>
                <button
                  type="button"
                  className={styles.sheetClose}
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close this list"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <ul className={styles.sheetList}>
                {pages.map((page) => {
                  const active = page === activePage;
                  const count = countFor(page);
                  return (
                    <li key={page.href}>
                      <Link
                        href={page.href}
                        className={`${styles.sheetItem} ${active ? styles.sheetItemActive : ""}`}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                      >
                        <span>{page.label}</span>
                        {count > 0 && <span className={styles.count}>{count}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Drawer>
        </>
      )}
    </div>
  );
}
