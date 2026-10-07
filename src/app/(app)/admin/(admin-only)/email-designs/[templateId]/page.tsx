import { notFound } from "next/navigation";
import { AdminPage } from "@/features/admin/adminList";
import EmailDesignEditor from "@/features/admin/emailDesigns/EmailDesignEditor";
import {
  isTemplateId,
  type TemplateId,
} from "@/lib/firestore/applicationEmails";

export const dynamic = "force-dynamic";

/**
 * One sign-up email. The editor draws the page's head: the email's own name,
 * with the way back to the list in the crumb above it.
 */
export default async function EmailDesignDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  if (!isTemplateId(templateId)) notFound();

  return (
    <AdminPage wide>
      <EmailDesignEditor templateId={templateId as TemplateId} />
    </AdminPage>
  );
}
