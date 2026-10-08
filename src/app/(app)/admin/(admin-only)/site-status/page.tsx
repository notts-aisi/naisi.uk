import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import { AdminColumn } from "@/features/admin/adminPanels";
import CoursesConfigPanel from "@/features/admin/CoursesConfigPanel";
import EmailAudiencePanel from "@/features/admin/EmailAudiencePanel";
import SchedulerPanel from "@/features/admin/SchedulerPanel";
import SiteStatusPanel from "@/features/admin/SiteStatusPanel";

export default function SiteStatusAdminPage() {
  return (
    <AdminPage wide>
      <PageHead
        crumb="Site settings"
        title="Site notice and scheduled jobs"
        description="What visitors are being told, who this copy of the site may email, and whether anything that runs on a timer is still going out."
        meta={
          <>
            <span>On this page</span>
            <a href="#site-notice">Site notice</a>
            <a href="#email-audience">Who this site can email</a>
            <a href="#scheduled-jobs">Scheduled jobs</a>
            <a href="#course-settings">Course settings</a>
          </>
        }
      />
      <AdminColumn>
        <SiteStatusPanel />
        {/* Who this copy of the site may email. On the live site it has to say
            everyone, and this is the one place that can be read without sending
            anything. */}
        <EmailAudiencePanel />
        {/* The scheduler answers the other half of "is the site healthy": the
            notice above says what visitors are being told, this says whether
            anything time-based is still going out. */}
        <SchedulerPanel />
        {/* Site-wide operational settings the courses feature reads. Here
            and not under /admin/courses because none of them is course
            content, and the grace period below is a dial on the same scheduler
            the panel above reports on. */}
        <CoursesConfigPanel />
      </AdminColumn>
    </AdminPage>
  );
}
