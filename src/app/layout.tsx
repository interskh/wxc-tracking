import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Webpage Tracker",
  description: "Track new posts from web pages",
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
