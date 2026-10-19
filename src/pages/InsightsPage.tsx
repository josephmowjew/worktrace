import { useState } from "react";
import { SegmentedTabs } from "../components/ui/SegmentedTabs";
import { DashboardPage } from "./DashboardPage";
import { FrictionPage } from "./FrictionPage";

export function InsightsPage() {
  const [view, setView] = useState<"overview" | "patterns">("overview");
  return <div className="space-y-5"><SegmentedTabs items={[{ id: "overview", label: "Overview" }, { id: "patterns", label: "Patterns & blockers" }]} value={view} onChange={setView} />{view === "overview" ? <DashboardPage /> : <FrictionPage />}</div>;
}
