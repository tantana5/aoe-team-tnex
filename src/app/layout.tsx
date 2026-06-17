import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Team AOE TNEX",
  description: "Chia 2 team từ điểm Google Sheet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
