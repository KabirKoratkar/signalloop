import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalLoop — Autonomous outbound experiments",
  description:
    "An autonomous growth scientist that learns who wants your product and what makes them respond.",
  openGraph: {
    title: "SignalLoop — Autonomous outbound experiments",
    description:
      "Turn every reply into tomorrow’s strategy—inside a hard safety boundary.",
    images: [
      {
        url: "/og-signalloop.png",
        width: 1731,
        height: 909,
        alt: "SignalLoop learning loop social card",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SignalLoop — Autonomous outbound experiments",
    description:
      "Turn every reply into tomorrow’s strategy—inside a hard safety boundary.",
    images: ["/og-signalloop.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
