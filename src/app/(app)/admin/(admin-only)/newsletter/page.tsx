import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import EmailPipeTest from "@/features/admin/EmailPipeTest";
import NewsletterTable from "@/features/admin/NewsletterTable";

export default function NewsletterAdminPage() {
  return (
    <AdminPage wide>
      <PageHead
        crumb="Site settings"
        title="Newsletter recipients"
        description="Everyone who has opted in from their profile. People choose for themselves: pull the list to send a newsletter, and change nobody’s choice here."
      />
      <EmailPipeTest />
      <NewsletterTable />
    </AdminPage>
  );
}
