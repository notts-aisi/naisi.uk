import DeliverabilityDashboard from "@/features/admin/DeliverabilityDashboard";
import EmailAudiencePanel from "@/features/admin/EmailAudiencePanel";

export default function DeliverabilityAdminPage() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "60rem",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-8)",
      }}
    >
      {/* Read before the send log below: a row marked Held is this panel's
          answer applied to one message. */}
      <EmailAudiencePanel />
      <DeliverabilityDashboard />
    </div>
  );
}
