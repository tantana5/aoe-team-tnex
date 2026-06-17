import type { Metadata } from "next";
import "./globals.css";
import NavBar from "./components/NavBar";

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
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
