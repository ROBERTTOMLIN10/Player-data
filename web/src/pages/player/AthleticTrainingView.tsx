import { SectionHeading } from "../../components/Card";
import { AthleticTrainingPanel } from "../../components/AthleticTraining";

/** The player's Athletic Training tab: everything between them and the AT in one place. */
export default function AthleticTrainingView() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
      <SectionHeading title="Athletic Training" subtitle="Your play status, appointments and messages with the athletic trainer" />
      <AthleticTrainingPanel />
    </div>
  );
}
