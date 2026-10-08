import { notFound } from "next/navigation";
import { AdminPage } from "@/features/admin/adminList";
import CourseEmailDesignEditor from "@/features/admin/emailDesigns/CourseEmailDesignEditor";
import {
  isCourseTemplateId,
  type CourseTemplateId,
} from "@/lib/firestore/courseEmails";

export const dynamic = "force-dynamic";

/**
 * Course email templates live one segment deeper than the application ones
 * (`/admin/email-designs/course/[templateId]`) so the two id spaces can't
 * collide: a static `course` segment beats the sibling `[templateId]` route.
 * Admin gating is the `(admin-only)` group's layout.
 *
 * The editor draws the page's head: the email's own name, with the way back
 * to the list in the crumb above it.
 */
export default async function CourseEmailDesignDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  if (!isCourseTemplateId(templateId)) notFound();

  return (
    <AdminPage wide>
      <CourseEmailDesignEditor templateId={templateId as CourseTemplateId} />
    </AdminPage>
  );
}
