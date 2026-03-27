"use client";

import { ErrorBoundary } from "./ErrorBoundary";
import type { ReactNode } from "react";

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
