import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Office",
  description: "Визуальный офис для AI-агентов",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "AI Office",
    description: "Визуальный офис для AI-агентов",
    type: "website",
    locale: "ru_RU",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body className="antialiased min-h-screen bg-[#0f1117] text-[#e4e6f0]">
        <ClientErrorBoundary>{children}</ClientErrorBoundary>
      </body>
    </html>
  );
}
