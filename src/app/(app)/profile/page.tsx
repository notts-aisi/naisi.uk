import PageHead from "@/components/ui/PageHead";
import { MaintenanceNotice } from "@/features/admin/AdminLockUI";
import KairosSetting from "@/features/kairos/KairosSetting";
import ProfileForm from "@/features/profile/ProfileForm";
import ProfileSection from "@/features/profile/ProfileSection";
import { PushSettings } from "@/features/pwa/PushSettings";
import { PushDeviceProvider } from "@/features/pwa/pushDevice";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { kairosChoicesOf } from "@/lib/kairos/choice";
import { sharesWithKairos } from "@/lib/kairos/model";
import { KAIROS_SETTING_WORDS } from "@/lib/kairos/words";
import styles from "./profile.module.css";

/**
 * Whether the signed-in person's details go to Kairos, read for them alone
 * through the choice's one reader, or null when there is nobody to read for.
 */
async function kairosShared(): Promise<boolean | null> {
  const user = await getCurrentUser();
  const db = getAdminDb();
  if (!user || !db) return null;
  return sharesWithKairos((await kairosChoicesOf(db, [user.uid])).get(user.uid));
}

export default async function ProfilePage() {
  const shared = await kairosShared();
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
      {/* The Kairos choice every programme survey's form ends with, on the
          same record, so it can be changed here at any time. */}
      {shared !== null && (
        <ProfileSection
          headingId="kairos-heading"
          title={KAIROS_SETTING_WORDS.heading}
          description={KAIROS_SETTING_WORDS.description}
        >
          <KairosSetting shared={shared} />
        </ProfileSection>
      )}
      {/* Shows a notice while an admin is editing this member's details. */}
      <MaintenanceNotice />
    </div>
  );
}
