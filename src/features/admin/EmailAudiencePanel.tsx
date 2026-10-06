import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { EMAIL_AUDIENCE_ENV, EVERYONE, resolveEmailAudience } from "@/lib/email/audience";

/**
 * Who this copy of the site can email, said out loud.
 *
 * The rule lives in `src/lib/email/audience.ts` and is applied by
 * `sendEmail()`. This panel only reads the same answer back, so an admin can
 * see it without sending anything: on the live site it must say everyone, and
 * anywhere else it must not.
 *
 * A Server Component on purpose. The answer comes from the server's own
 * environment, and nothing about it is sent to the browser except the
 * sentence below.
 */
export default function EmailAudiencePanel() {
  const audience = resolveEmailAudience(process.env);

  let badge: { tone: "success" | "neutral" | "warning" | "danger"; label: string };
  let sentence: string;

  if (audience.mode === "everyone" && audience.because === "production") {
    badge = { tone: "success", label: "Everyone" };
    sentence = "This is the live site, and it emails everyone it is asked to.";
  } else if (audience.mode === "everyone") {
    badge = { tone: "neutral", label: "This machine only" };
    sentence =
      "Every email is handed to the mail catcher on this machine. Nothing leaves it.";
  } else if (audience.because === "not-everyone") {
    badge = { tone: "danger", label: "Held" };
    sentence =
      `This is the live site and it is holding its own email. Members are getting nothing. ` +
      `Set ${EMAIL_AUDIENCE_ENV} to ${EVERYONE} on the live backend, then roll out.`;
  } else if (audience.because === "not-production") {
    badge = { tone: "warning", label: "Nobody" };
    sentence =
      `The setting says ${EVERYONE}, and this is not the live site, so it was refused. ` +
      "Every email is held. List the addresses that may receive instead.";
  } else if (audience.allow.size > 0) {
    const listed = Array.from(audience.allow).sort().join(", ");
    badge = { tone: "neutral", label: audience.allow.size === 1 ? "1 address" : `${audience.allow.size} addresses` };
    sentence = `Only ${listed}. An email to anyone else is held, and shows as Held on the Deliverability tab.`;
  } else {
    badge = { tone: "neutral", label: "Nobody" };
    sentence =
      "This copy of the site has no audience setting, so every email is held. " +
      "Held emails show on the Deliverability tab.";
  }

  return (
    <Card padding="md">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-1)",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ fontSize: "var(--text-lg)" }}>Who this site can email</h3>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p
        style={{
          color: badge.tone === "danger" ? "var(--color-danger)" : "var(--color-text-muted)",
          fontSize: "var(--text-sm)",
          margin: 0,
          overflowWrap: "anywhere",
        }}
      >
        {sentence}
      </p>
    </Card>
  );
}
