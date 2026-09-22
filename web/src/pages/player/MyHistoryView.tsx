import { useState } from "react";
import { useMyReadinessHistory } from "../../api/client";
import { SectionHeading } from "../../components/Card";
import { RangePicker, ReadinessHistory } from "../../components/ReadinessHistory";

export default function MyHistoryView() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useMyReadinessHistory(days);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionHeading title="My Readiness" subtitle="Your check-ins over time" />
        <RangePicker days={days} onChange={setDays} />
      </div>
      {isLoading || !data ? (
        <div className="py-16 text-center text-text-dim">Loading…</div>
      ) : (
        <ReadinessHistory history={data} emptyText="No check-ins in this period yet." />
      )}
    </div>
  );
}
