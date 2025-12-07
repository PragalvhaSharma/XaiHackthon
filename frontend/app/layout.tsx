import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recruiter Agent Lab",
  description: "Persuade the AI recruiter and win your interview slot."
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

