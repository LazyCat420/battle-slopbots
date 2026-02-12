import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BattleBots: AI Arena",
  description:
    "Design battle robots with AI! Describe your bot, let an LLM build it, and watch it fight in a 2D top-down arena.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
