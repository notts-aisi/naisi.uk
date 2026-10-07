import PageHead from "@/components/ui/PageHead";
import { MaintenanceNotice } from "@/features/admin/AdminLockUI";
import ProfileForm from "@/features/profile/ProfileForm";
import { PushSettings } from "@/features/pwa/PushSettings";
import { PushDeviceProvider } from "@/features/pwa/pushDevice";
import styles from "./profile.module.css";

export default function ProfilePage() {
  return (
    <div className={styles.page}>
      <PageHead title="Profile" description="Your details and the emails you get from us." />
      {/* One probe of this browser's push state, read by both children: the
          form's Push column (disabled with a hint when this device cannot
          receive anything) and the per-device section below it. */}
      <PushDeviceProvider>
        <ProfileForm />
        {/* Per-device push opt-in. Renders nothing until VAPID keys are
            provisioned (docs/pwa.md) and on browsers without push. The
            account-level answers are the grid's Push column, inside the form
            above, so nothing here is unreachable for want of the right
            hardware. */}
        <PushSettings />
      </PushDeviceProvider>
      {/* Shows a notice while an admin is editing this member's details. */}
      <MaintenanceNotice />
    </div>
  );
}
