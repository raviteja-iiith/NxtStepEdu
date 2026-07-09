import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import CapacitorProvider from "@/components/CapacitorProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1E3A8A',
};

export const metadata: Metadata = {
  title: "NxtStepEdu — School Management",
  description: "A comprehensive multi-tenant School ERP for Indian K-12 schools.",
  keywords: ["school erp", "school management", "education", "attendance", "fee management"],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NxtStepEdu',
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        <CapacitorProvider />
        {children}
      </body>
    </html>
  );
}
