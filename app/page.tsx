import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DashboardShell />
    </Suspense>
  );
}
