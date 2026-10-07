import type { Metadata } from "next";
import LegalPolicyPage from "@/components/legal/LegalPolicyPage";
import { linkPreviewImages } from "@/lib/linkPreviewCard";

const TITLE = "Privacy policy";
const DESCRIPTION =
  "How the Nottingham AI Safety Initiative collects, uses, and looks after your personal data.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // No picture of its own, so the card: 1200 by 630, which is the large format.
  openGraph: { title: TITLE, description: DESCRIPTION, type: "article", images: linkPreviewImages() },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: linkPreviewImages() },
};

export default function PrivacyPage() {
  return <LegalPolicyPage policy="privacy" />;
}
