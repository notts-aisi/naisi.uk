import { AdminPage } from "@/features/admin/adminList";
import SubscriptionsTable from "@/features/admin/SubscriptionsTable";
import AudiencePreview from "@/features/audience/AudiencePreview";

/**
 * The mailing list: who gets which emails. The table of every row, and the
 * head of the page with its counts, are the client component's, because both
 * are drawn from the rows it reads. Below them, closed until opened, the
 * picker every message to chosen people will share: who some tags would
 * reach, with nothing to send.
 */
export default function SubscriptionsAdminPage() {
  return (
    <AdminPage wide>
      <SubscriptionsTable />
      <AudiencePreview />
    </AdminPage>
  );
}
