import { AdminPage } from "@/features/admin/adminList";
import SubscriptionsTable from "@/features/admin/SubscriptionsTable";

/**
 * The mailing list: who gets which emails. The table of every row, and the
 * head of the page with its counts, are the client component's, because both
 * are drawn from the rows it reads.
 */
export default function SubscriptionsAdminPage() {
  return (
    <AdminPage wide>
      <SubscriptionsTable />
    </AdminPage>
  );
}
