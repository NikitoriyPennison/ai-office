import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Office — Stream",
};

export default function StreamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
