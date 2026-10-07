import { Space_Mono } from "next/font/google";

/**
 * Space Mono, for metadata only: dates, durations, eyebrow labels and table
 * headers on the application system's screens.
 *
 * Declared here and not in the root layout, so the font is loaded by the
 * routes that render `ApplicationsRoot` and by no other page on the site.
 */
export const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});
