import { useState } from "react";
import { useMyRpe } from "../../api/client";
import { SectionHeading } from "../../components/Card";
import { RangePicker } from "../../components/ReadinessHistory";
import { RpeHistory } from "../../components/RpeHistory";

/** The player's post-training RPE, logged by the coaches after each session. */
export default function MyRpeView() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useMyRpe(days);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionHeading title="My RPE" subtitle="How hard each training session felt (1 very easy – 10 maximal)" />
        <RangePicker days={days} onChange={setDays} />
      </div>
      {isLoading || !data ? (
        <div className="py-16 text-center text-text-dim">Loading…</div>
      ) : (
        <RpeHistory data={data} emptyText="No RPE scores in this period yet. The coaches log them after each training session." />
      )}
    </div>
  );
}
