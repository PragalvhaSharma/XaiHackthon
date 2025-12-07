import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "xAI Recruiter Dashboard",
  description: "AI-powered candidate sourcing and research pipeline"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

