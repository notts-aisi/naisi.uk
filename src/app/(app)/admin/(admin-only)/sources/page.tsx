"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import PageHead from "@/components/ui/PageHead";
import {
  AdminPage,
  AdminLoadingBar,
  AdminListFooter,
  AdminTable,
  useClientPagination,
} from "@/features/admin/adminList";
import { AdminPanel, AdminProblem } from "@/features/admin/adminPanels";
import { loadSourceSheet } from "@/features/admin/sources/sourceSheetData";
import { createSourceSheet } from "@/features/admin/sources/sourceSheetMutations";
import { useSourceSheets } from "@/features/admin/sources/useSourceSheets";
import styles from "@/features/admin/sources/sources.module.css";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import {
  suggestSourceSlug,
  validateSourceSlug,
  SOURCE_SHEET_LIMITS,
  type SourceSheetDoc,
} from "@/lib/firestore/sourceSheets";

/**
 * Whether a sheet's page is up, in a word. A sheet that was published and
 * then taken down is told apart from one that never was: copies of the
 * material may still be in people's hands.
 */
function StateChip({ sheet }: { sheet: SourceSheetDoc }) {
  if (sheet.publishedAt) return <Chip tone="success">Published</Chip>;
  if (sheet.firstPublishedAt) {
    return (
      <Chip tone="warning" title="It was published once, so copies of the material may be in circulation">
        Unpublished
      </Chip>
    );
  }
  return <Chip tone="neutral">Draft</Chip>;
}

/**
 * The library of source sheets: one for each piece of produced material.
 *
 * Under `(admin-only)`, so `requireAdminPage()` in that group's layout is the
 * gate and this page writes none of its own. Reads and writes go client-direct
 * under the admin-only `sourceSheets` rule, exactly as the Projects tab does.
 */
export default function SourcesAdminPage() {
  const router = useRouter();
  const { sheets, loading, refreshing, error, reload } = useSourceSheets();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { shown, hasMore, loadMore, total, shownCount } = useClientPagination(sheets, 20);

  function onTitleChange(next: string) {
    setTitle(next);
    // The slug follows the title until the admin edits it by hand, and stops
    // following the moment they do. It is printed under a QR code, so it is
    // worth being able to set deliberately.
    if (!slugTouched) setSlug(suggestSourceSlug(next));
  }

  async function onCreate() {
    const cleanTitle = title.trim();
    const cleanSlug = slug.trim();
    if (!cleanTitle) {
      setFormError("Give this source sheet a title.");
      return;
    }
    const slugError = validateSourceSlug(cleanSlug);
    if (slugError) {
      setFormError(slugError);
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      // The slug is the document id, so creating on top of an existing one
      // would overwrite somebody else's entry, including a published one.
      const existing = await loadSourceSheet(cleanSlug);
      if (existing) {
        setFormError(`/sources/${cleanSlug} is already taken. Pick another address.`);
        return;
      }
      await createSourceSheet(cleanSlug, cleanTitle);
      router.push(`/admin/sources/${cleanSlug}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create the source sheet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage wide>
      <PageHead
        crumb="Publicity"
        title="Source sheets"
        description="The sources behind a poster, a flyer or a carousel. The material carries the numbers and a QR code, and the sheet carries the list."
        actions={
          creating ? (
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          ) : (
            <Button leading={<PlusMark />} onClick={() => setCreating(true)}>
              New source sheet
            </Button>
          )
        }
      />

      {creating && (
        <AdminPanel title="New source sheet">
          <div className={styles.createGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Title</span>
              <Input
                value={title}
                maxLength={SOURCE_SHEET_LIMITS.title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Freshers fair poster, September 2026"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Page address</span>
              <Input
                value={slug}
                maxLength={SOURCE_SHEET_LIMITS.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="freshers-fair-2026"
              />
            </label>
          </div>
          <p className={styles.hint}>
            The page will be at <strong>naisi.uk/sources/{slug || "…"}</strong>.
            That address goes on the printed material, so it cannot be changed
            afterwards. Lowercase letters, numbers and hyphens.
          </p>
          {formError && <p className={styles.error}>{formError}</p>}
          <div className={styles.formActions}>
            <Button onClick={onCreate} disabled={busy}>
              {busy ? "Creating…" : "Create source sheet"}
            </Button>
          </div>
        </AdminPanel>
      )}

      {error && <AdminProblem>Couldn&apos;t load: {error.message}</AdminProblem>}

      {loading && (
        <Card padding="md">
          <AdminLoadingBar label="Loading source sheets…" />
        </Card>
      )}

      {!loading && !error && sheets.length === 0 && !creating && (
        <Card padding="md">
          <p className={styles.hint}>
            No source sheets yet. Create one for the next poster or carousel,
            publish it before the material goes to print, then put
            naisi.uk/sources/&lt;address&gt; behind the QR code.
          </p>
        </Card>
      )}

      {shown.length > 0 && (
        <AdminTable caption="Source sheets" minWidth="44rem">
          <thead>
            <tr>
              <th scope="col" style={{ width: "46%" }}>
                Source sheet
              </th>
              <th scope="col">Sources</th>
              <th scope="col">Files</th>
              <th scope="col">Edited</th>
              <th scope="col">Page</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((sheet) => {
              const href = `/admin/sources/${sheet.slug}`;
              return (
                <tr
                  key={sheet.slug}
                  className={styles.row}
                  onClick={(e) => {
                    // A click on the link, or with a key held to open it
                    // elsewhere, is the link's own business.
                    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    if ((e.target as HTMLElement).closest("a, button")) return;
                    router.push(href);
                  }}
                >
                  <td className={styles.titleCell}>
                    <Link href={href} className={styles.title}>
                      {sheet.title}
                    </Link>
                    <span className={styles.slug}>/sources/{sheet.slug}</span>
                  </td>
                  <td data-label="Sources" className={styles.number}>
                    {sheet.items.length}
                  </td>
                  <td data-label="Files">
                    {sheet.image || sheet.file ? (
                      <span className={styles.chips}>
                        {sheet.image && <Chip tone="neutral">Image</Chip>}
                        {sheet.file && <Chip tone="neutral">PDF</Chip>}
                      </span>
                    ) : (
                      <span className={styles.muted}>None</span>
                    )}
                  </td>
                  <td data-label="Edited">
                    {sheet.updatedAt && (
                      <span className={`meta ${styles.date}`}>
                        {formatSiteDate(sheet.updatedAt, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </td>
                  <td data-label="Page" className={styles.stateCell}>
                    <StateChip sheet={sheet} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </AdminTable>
      )}

      {!loading && !error && total > 0 && (
        <AdminListFooter
          shownCount={shownCount}
          total={total}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onRefresh={reload}
          refreshing={refreshing}
          noun="source sheets"
        />
      )}
    </AdminPage>
  );
}

function PlusMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
