import type { PlayerProfile } from "../types";
import { PlayerPhoto } from "./PlayerPhoto";
import { Card } from "./Card";

function age(birthDate: string) {
  const b = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) years--;
  return years;
}

/**
 * Top of a player's page: headshot, squad number, name and the roster profile
 * (position, year, height, weight, hometown, schools...). Facts FAU doesn't
 * publish are simply left out.
 */
export function PlayerProfileHeader({
  name,
  jersey,
  profile,
  subtitle,
  onBack,
  bioLabel = "FAU Athletics bio",
}: {
  name: string;
  jersey?: string | null;
  profile?: PlayerProfile | null;
  subtitle: string;
  onBack?: () => void; // coaches: back to the player list
  bioLabel?: string;
}) {
  const p = profile;
  const height = p?.height_feet ? `${p.height_feet}'${p.height_inches ?? 0}"` : null;
  const heightCm = p?.height_feet ? Math.round((p.height_feet * 12 + (p.height_inches ?? 0)) * 2.54) : null;
  const facts: { label: string; value: string }[] = [
    { label: "Position", value: p?.position_long || p?.position_short || "" },
    { label: "Year", value: p?.academic_year_long || p?.academic_year || "" },
    { label: "Height", value: height ? `${height} (${heightCm} cm)` : "" },
    { label: "Weight", value: p?.weight ? `${p.weight} lbs (${Math.round(p.weight * 0.4536)} kg)` : "" },
    { label: "Age", value: p?.birth_date ? String(age(p.birth_date)) : "" },
    { label: "Hometown", value: p?.hometown ?? "" },
    { label: "Previous school", value: p?.previous_school ?? "" },
    { label: "High school", value: p?.high_school ?? "" },
    { label: "Major", value: p?.major ?? "" },
  ].filter((f) => f.value);

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <PlayerPhoto name={name} url={p?.photo_url} size={112} className="self-center ring-2 ring-owl-red/40 sm:self-start" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-bold leading-tight">
              {jersey && <span className="mr-2 text-owl-red-light">#{jersey}</span>}
              {name}
              {p?.is_captain ? (
                <span className="ml-2 rounded border border-gold/50 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-gold">
                  Captain
                </span>
              ) : null}
            </h2>
            <p className="mt-0.5 text-sm text-text-dim">{subtitle}</p>
          </div>
          {onBack && (
            <button onClick={onBack} className="text-sm text-text-dim hover:text-owl-red">
              ← All players
            </button>
          )}
        </div>
        {facts.length > 0 ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-text-dim">{f.label}</dt>
                <dd className="text-sm font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-text-dim">No profile on this season's fausports.com roster yet.</p>
        )}
        {(p?.instagram || p?.profile_url) && (
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {p.instagram && (
              <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="text-owl-red-light hover:underline">
                Instagram @{p.instagram}
              </a>
            )}
            {p.profile_url && (
              <a href={p.profile_url} target="_blank" rel="noreferrer" className="text-owl-red-light hover:underline">
                {bioLabel} ↗
              </a>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
