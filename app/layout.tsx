import type { Metadata } from "next";
import "./globals.css";
import "./diagnosis.css";
import "./fraction-bar.css";
import "./lesson-pack.css";

export const metadata: Metadata = {
  title: "Chalk — the next lesson is hiding in the mistake",
  description: "Teacher-approved, self-verified fraction interventions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
