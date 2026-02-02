import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Domain Email Health Checker",
  description: "Check SPF, DMARC, and MX records for domain health.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
