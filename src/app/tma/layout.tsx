import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "AI Office",
  description: "Управление AI-агентами",
};

export default function TmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      {children}
    </>
  );
}
