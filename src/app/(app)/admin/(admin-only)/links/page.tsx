"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import PageHead from "@/components/ui/PageHead";
import { AdminPage, AdminLoadingBar, AdminListFooter } from "@/features/admin/adminList";
import { AdminPanel, AdminProblem } from "@/features/admin/adminPanels";
import { LinkStatsSummary, PERIOD_WORDS } from "@/features/admin/links/LinkStatsSummary";
import { TrackedLinkForm } from "@/features/admin/links/TrackedLinkForm";
import { TrackedLinkPanel } from "@/features/admin/links/TrackedLinkPanel";
import { KIND_HEADINGS, TrackedLinkTable } from "@/features/admin/links/TrackedLinkTable";
import {
  createTrackedLink,
  ensurePrintedLinks,
  updateTrackedLink,
} from "@/features/admin/links/trackedLinkMutations";
import { useLinkStats } from "@/features/admin/links/useLinkStats";
import { useTrackedLinks } from "@/features/admin/links/useTrackedLinks";
import styles from "@/features/admin/links/links.module.css";
import { useHydrated } from "@/hooks/useHydrated";
import { EMPTY_LINK_STATS, sumLinkStats } from "@/lib/campaign/linkStats";
import { downloadCSV, toCSV } from "@/lib/csv";
import { TRACKED_LINK_TYPES, type TrackedLinkDoc } from "@/lib/firestore/trackedLinks";

const NO_CAMPAIGN = "No campaign";
const PANEL_ID = "selected-short-link";

/**
 * Short links: every `naisi.uk/q/<slug>`, what it is and where it goes.
 *
 * Under `(admin-only)`, so `requireAdminPage()` in that group's layout is the
 * gate and this page writes none of its own. Reads and writes go client-direct
 * under the admin-only `trackedLinks` rule, as the Sources tab does.
 *
 * On load it creates a record for any printed code that does not have one
 * (`ensurePrintedLinks`), so the codes that are already on paper are always
 * here to be repointed and nobody has to remember a seeding step.
 *
 * It is also the dashboard: grouped by campaign, split by kind, with each
 * link's scans and the sign-ups it produced for the chosen period. The two
 * exports are built in the browser and carry counts only, never an address, so
 * they are not files of named people and are not written to the exports log.
 *
 * A link is changed in the card that opens under its table when its row is
 * pressed. It is switched on and off in the row itself, which saves at once:
 * the same write the form makes, with nothing else changed.
 */
export default function LinksAdminPage() {
  const { links, loading, refreshing, error, reload } = useTrackedLinks();
  const numbers = useLinkStats();
  const [creating, setCreating] = useState(false);
  const [seeded, setSeeded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // A switch pressed and not yet read back from the list.
  const [pendingLive, setPendingLive] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const origin = hydrated ? window.location.origin : "https://naisi.uk";
  const host = new URL(origin).host;

  // Once per visit, after the first successful load.
  const ensured = useRef(false);
  useEffect(() => {
    if (loading || error || ensured.current) return;
    ensured.current = true;
    void ensurePrintedLinks(new Set(links.map((link) => link.slug)))
      .then((created) => {
        if (created.length === 0) return;
        setSeeded(created);
        reload();
      })
      .catch(() => {
        // The codes are answered from the printed list until this succeeds,
        // so a failure here costs nothing but the rows. Try again next visit.
        ensured.current = false;
      });
  }, [loading, error, links, reload]);

  const campaigns = useMemo(
    () => [...new Set(links.map((link) => link.campaign).filter(Boolean))].sort(),
    [links],
  );

  const statsOf = (link: TrackedLinkDoc) => numbers.stats.get(link.slug) ?? EMPTY_LINK_STATS;

  // Campaign, then kind, then the busiest link first: the question the page
  // answers is which one worked.
  const groups = useMemo(() => {
    const byCampaign = new Map<string, TrackedLinkDoc[]>();
    for (const link of links) {
      const key = link.campaign || NO_CAMPAIGN;
      byCampaign.set(key, [...(byCampaign.get(key) ?? []), link]);
    }
    const scansOf = (link: TrackedLinkDoc) => numbers.stats.get(link.slug)?.scans ?? 0;
    return [...byCampaign.entries()]
      .map(([name, rows]) => ({
        name,
        totals: sumLinkStats(rows.map((link) => numbers.stats.get(link.slug) ?? EMPTY_LINK_STATS)),
        kinds: TRACKED_LINK_TYPES.map(({ value }) => {
          const ofKind = rows
            .filter((link) => link.type === value)
            .sort((a, b) => scansOf(b) - scansOf(a) || a.slug.localeCompare(b.slug));
          return {
            kind: value,
            rows: ofKind,
            totals: sumLinkStats(ofKind.map((link) => numbers.stats.get(link.slug) ?? EMPTY_LINK_STATS)),
          };
        }).filter((group) => group.rows.length > 0),
      }))
      .sort((a, b) =>
        a.name === NO_CAMPAIGN ? 1 : b.name === NO_CAMPAIGN ? -1 : a.name.localeCompare(b.name),
      );
  }, [links, numbers.stats]);

  const totals = sumLinkStats(links.map(statsOf));
  const byType = TRACKED_LINK_TYPES.map(({ value }) => ({
    label: KIND_HEADINGS[value],
    totals: sumLinkStats(links.filter((link) => link.type === value).map(statsOf)),
    any: links.some((link) => link.type === value),
  })).filter((kind) => kind.any);

  const periodLabel = numbers.range === "all" ? "all-time" : `last-${numbers.range}-days`;
  const selectedLink = selected ? (links.find((link) => link.slug === selected) ?? null) : null;

  function exportTotals() {
    downloadCSV(
      `naisi-links-${periodLabel}.csv`,
      toCSV(
        ["campaign", "kind", "slug", "label", "destination", "live", "scans", "signed_up", "confirmed"],
        links.map((link) => {
          const stats = statsOf(link);
          return [
            link.campaign,
            link.type,
            link.slug,
            link.label,
            link.destination,
            link.active ? "yes" : "no",
            stats.scans,
            stats.signupsStarted,
            stats.signupsConfirmed,
          ];
        }),
      ),
    );
  }

  function exportDaily() {
    downloadCSV(
      `naisi-links-by-day-${periodLabel}.csv`,
      toCSV(
        ["date", "slug", "scans"],
        numbers.dailyRows.map((day) => [day.date, day.slug, day.count]),
      ),
    );
  }

  function select(slug: string) {
    // Pressing the open link again closes it.
    const next = selected === slug ? null : slug;
    setSelected(next);
    if (!next) return;
    // The card opens under the table, which on a long list or a phone is off
    // the screen: bring it into view once it has been drawn.
    window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ block: "nearest" });
    });
  }

  /**
   * Switch a link on or off from its row. The same write the form makes, with
   * every other field passed through as it is stored.
   */
  async function setLive(link: TrackedLinkDoc, next: boolean) {
    setLiveError(null);
    setLiveNote(null);
    setPendingLive((current) => new Map(current).set(link.slug, next));
    try {
      await updateTrackedLink(link.slug, {
        label: link.label,
        destination: link.destination,
        type: link.type,
        campaign: link.campaign,
        active: next,
        countOffsite: link.countOffsite,
      });
      await reload();
      setLiveNote(
        next
          ? `${host}/q/${link.slug} is on.`
          : `${host}/q/${link.slug} is off. It lands on /links until you switch it back on.`,
      );
    } catch (err) {
      setLiveError(
        `Couldn't switch ${host}/q/${link.slug} ${next ? "on" : "off"}: ${
          err instanceof Error ? err.message : "the change was not saved"
        }`,
      );
    } finally {
      setPendingLive((current) => {
        const rest = new Map(current);
        rest.delete(link.slug);
        return rest;
      });
    }
  }

  return (
    <AdminPage wide>
      <PageHead
        crumb="Publicity"
        title="Short links and QR codes"
        description="Each code points at a short address, so you can change where it goes after printing."
        actions={
          creating ? (
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          ) : (
            <Button leading={<PlusMark />} onClick={() => setCreating(true)}>
              New short link
            </Button>
          )
        }
      />

      {creating && (
        <AdminPanel title="New short link">
          <TrackedLinkForm
            link={null}
            campaigns={campaigns}
            origin={origin}
            onSubmit={async (slug, input) => {
              await createTrackedLink(slug, input);
              setCreating(false);
              reload();
            }}
            onCancel={() => setCreating(false)}
          />
        </AdminPanel>
      )}

      <LinkStatsSummary
        range={numbers.range}
        onRange={numbers.setRange}
        totals={totals}
        byType={byType}
        loading={numbers.loading}
        error={numbers.error}
        onExportTotals={exportTotals}
        onExportDaily={exportDaily}
      />

      {seeded.length > 0 && (
        <Notice>
          Added the codes that are already on paper: {seeded.join(", ")}. They were working before
          this and go to the same places now.
        </Notice>
      )}

      {error && <AdminProblem>Couldn&apos;t load: {error.message}</AdminProblem>}

      {loading && (
        <Card padding="md">
          <AdminLoadingBar label="Loading links…" />
        </Card>
      )}

      {liveError && <AdminProblem>{liveError}</AdminProblem>}
      {liveNote && !liveError && <Notice tone="neutral">{liveNote}</Notice>}

      {groups.map((group) => (
        <section key={group.name} className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupHeading}>{group.name}</h2>
            <span className="meta">{PERIOD_WORDS[numbers.range]}</span>
          </div>
          <TrackedLinkTable
            caption={`${group.name}: short links, with scans and sign-ups, ${PERIOD_WORDS[
              numbers.range
            ].toLowerCase()}`}
            totalLabel={group.name === NO_CAMPAIGN ? "All with no campaign" : `All of ${group.name}`}
            kinds={group.kinds}
            totals={group.totals}
            origin={origin}
            statsOf={statsOf}
            loadingNumbers={numbers.loading}
            selected={selected}
            panelId={PANEL_ID}
            pendingLive={pendingLive}
            onSelect={select}
            onLive={setLive}
          />
          {selectedLink && (selectedLink.campaign || NO_CAMPAIGN) === group.name && (
            <div ref={panelRef}>
              <TrackedLinkPanel
                key={selectedLink.slug}
                id={PANEL_ID}
                link={selectedLink}
                campaigns={campaigns}
                origin={origin}
                stats={statsOf(selectedLink)}
                fromDate={numbers.fromDate}
                onSave={async (slug, input) => {
                  await updateTrackedLink(slug, input);
                  reload();
                }}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </section>
      ))}

      {!loading && !error && links.length === 0 && (
        <Card padding="md">
          <p className={styles.hint}>
            No short links yet. Make one before the artwork is final, then print its address.
          </p>
        </Card>
      )}

      {!loading && !error && links.length > 0 && (
        <>
          <p className={styles.note}>
            Phones that block scripts aren’t counted, so real scans are a bit higher. We don’t
            store who scanned. A link is never deleted: switched off, its address lands on /links,
            so it can’t be given to something else by mistake.
          </p>
          <AdminListFooter
            shownCount={links.length}
            total={links.length}
            hasMore={false}
            onLoadMore={() => {}}
            onRefresh={() => {
              reload();
              numbers.reload();
            }}
            refreshing={refreshing}
            noun="links"
          />
        </>
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
