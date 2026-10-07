"use client";

import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import { LinksPageEditor } from "@/features/admin/links/LinksPageEditor";

/**
 * The editor for what the public /links page says.
 *
 * Under `(admin-only)`, so `requireAdminPage()` in that group's layout is the
 * gate and this page writes none of its own. It reads and writes one document
 * client-direct under the admin-only `linksPage` rule.
 */
export default function LinksPageContentAdminPage() {
  return (
    <AdminPage wide>
      <PageHead
        crumb="Publicity"
        title="The /links page"
        description="What people see at naisi.uk/links, where most printed QR codes land."
        meta={
          <a href="/links" target="_blank" rel="noopener noreferrer">
            Open /links in a new tab
          </a>
        }
      />
      <LinksPageEditor />
    </AdminPage>
  );
}
