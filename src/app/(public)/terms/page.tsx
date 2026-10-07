import type { Metadata } from "next";
import LegalPolicyPage from "@/components/legal/LegalPolicyPage";
import { linkPreviewImages } from "@/lib/linkPreviewCard";

const TITLE = "Terms of service";
const DESCRIPTION =
  "The terms you agree to when you use the Nottingham AI Safety Initiative website.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // No picture of its own, so the card: 1200 by 630, which is the large format.
  openGraph: { title: TITLE, description: DESCRIPTION, type: "article", images: linkPreviewImages() },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: linkPreviewImages() },
};

export default function TermsPage() {
  return <LegalPolicyPage policy="terms" />;
}
