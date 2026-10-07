import { AdminPage } from "@/features/admin/adminList";
import DeliverabilityDashboard from "@/features/admin/DeliverabilityDashboard";
import EmailAudiencePanel from "@/features/admin/EmailAudiencePanel";

/**
 * Email delivery. The dashboard draws the page's head, because Refresh lives
 * there and is its own state. The card that says who this copy of the site
 * may email is a Server Component, so it is made here and handed in.
 */
export default function DeliverabilityAdminPage() {
  return (
    <AdminPage wide>
      <DeliverabilityDashboard audience={<EmailAudiencePanel />} />
    </AdminPage>
  );
}
