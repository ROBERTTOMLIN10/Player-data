import { useState } from "react";
import { Link } from "react-router-dom";
import { useCareDay } from "../api/client";
import { appointmentState, attendanceMark, kindLabel, levelInfo, sideLabel, stageLabel, timeLabel } from "../lib/care";
import { downloadFrom } from "../lib/download";
import { formatDate, formatDateLong } from "../lib/format";
import type { CareDayPlayer, OpenIssue, PlayLevel } from "../types";
import { Card } from "./Card";

const REPORT_ORDER: PlayLevel[] = ["as_tolerated", "limited", "rehab", "out", "full"];

interface Row {
  player: CareDayPlayer;
  issue: OpenIssue | null;
  level: PlayLevel;
}

/**
 * The daily injury report, laid out like the athletic trainer's sheet: grouped by
 * play status, one row per player and injury, with practice and conditioning
 * notes, the latest note, treatment attendance and expected return. General
 * medical issues and physical-exam (PPE) follow-ups follow in their own sections.
 * It's live: built from what the AT enters, so coaches always see the latest.
 */
export function InjuryReport({ date, onOpenPlayer }: { date: string | null; onOpenPlayer: (p: CareDayPlayer) => void }) {
  const { data, isLoading } = useCareDay(date);
  if (isLoading || !data) return <div className="py-16 text-center text-text-dim">Loading report…</div>;

  const injuryRows: Row[] = [];
  const genMed: Row[] = [];
  const ppe: Row[] = [];
  for (const p of data.players) {
    const level = p.availability?.level ?? "full";
    const injuries = p.issues.filter((i) => i.category === "injury");
    for (const i of p.issues.filter((x) => x.category === "gen_med")) genMed.push({ player: p, issue: i, level });
    for (const i of p.issues.filter((x) => x.category === "ppe")) ppe.push({ player: p, issue: i, level });
    if (injuries.length) for (const i of injuries) injuryRows.push({ player: p, issue: i, level });
    // Restricted with nothing logged: still on the report (a player out sick is listed under Gen Med instead).
    else if (level !== "full" && !p.issues.length) injuryRows.push({ player: p, issue: null, level });
  }
  const byDate = (a: Row, b: Row) => String(b.issue?.injury_date ?? "").localeCompare(String(a.issue?.injury_date ?? ""));
  const groups = REPORT_ORDER.map((level) => ({ level, rows: injuryRows.filter((r) => r.level === level).sort(byDate) })).filter((g) => g.rows.length);

  const treatments = data.players.flatMap((p) => p.treatments.filter((t) => t.status !== "declined").map((t) => ({ ...t, name: p.name, player: p })));
  const counts = {
    out: data.players.filter((p) => p.availability?.level === "out").length,
    restricted: data.players.filter((p) => p.availability && ["as_tolerated", "limited", "rehab"].includes(p.availability.level)).length,
    booked: treatments.filter((t) => t.status !== "missed").length,
    came: treatments.filter((t) => t.status === "attended").length,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold sm:text-xl">FAU Men&rsquo;s Soccer Injury Report</h2>
          <p className="text-sm text-text-dim">
            {formatDateLong(data.date)} · live from the athletic trainer&rsquo;s entries
          </p>
        </div>
        <ExcelButton date={data.date} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Out" value={counts.out} tone="text-owl-red-light" />
        <Tile label="Restricted" value={counts.restricted} tone="text-gold" />
        <Tile label="Appointments" value={counts.booked} />
        <Tile label="Came in" value={`${counts.came}/${counts.booked}`} tone="text-teal" />
      </div>

      {treatments.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-dim">Appointments today</div>
          <ul className="divide-y divide-border/60">
            {treatments
              .sort((a, b) => String(a.treat_time ?? "").localeCompare(String(b.treat_time ?? "")))
              .map((t) => (
                <li key={t.id}>
                  <button onClick={() => onOpenPlayer(t.player)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-surface-raised">
                    <span className="w-20 shrink-0 whitespace-nowrap font-semibold tabular-nums">{timeLabel(t.treat_time) || "—"}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-text-dim">
                        {" "}
                        · {kindLabel(t.kind)}
                        {t.reason ? ` · ${t.reason}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-1.5 py-px text-[11px] ${appointmentState(t).chip}`}>{appointmentState(t).label}</span>
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card className="text-sm text-text-dim">Everyone is Full with nothing open. The AT sets play status and logs injuries from each player&rsquo;s panel on the Readiness board.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-dim">
                <th className="px-3 py-2.5 font-medium">Play status</th>
                <th className="sticky left-0 z-10 bg-surface px-3 py-2.5 font-medium shadow-[inset_-1px_0_0_var(--color-border)]">Player</th>
                <th className="px-2 py-2.5 font-medium">Injury date</th>
                <th className="px-2 py-2.5 text-center font-medium">Days</th>
                <th className="px-2 py-2.5 font-medium">Body part / injury</th>
                <th className="px-2 py-2.5 text-center font-medium">Side</th>
                <th className="px-2 py-2.5 font-medium">Practice notes</th>
                <th className="px-2 py-2.5 font-medium">Conditioning</th>
                <th className="px-2 py-2.5 font-medium">Additional notes</th>
                <th className="px-2 py-2.5 text-center font-medium">Attendance</th>
                <th className="px-2 py-2.5 font-medium">Expected return</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) =>
                g.rows.map((r, i) => <ReportRow key={`${r.player.player_id}-${r.issue?.id ?? "x"}`} row={r} first={i === 0} onOpen={onOpenPlayer} />),
              )}
            </tbody>
          </table>
        </Card>
      )}

      {genMed.length > 0 && <SideSection title="Gen Med" rows={genMed} onOpen={onOpenPlayer} />}
      {ppe.length > 0 && <SideSection title="PPE follow-ups" rows={ppe} onOpen={onOpenPlayer} />}
    </div>
  );
}

function ExcelButton({ date }: { date: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadFrom(`/api/care/report.xlsx?date=${date}`, "Injury_Report.xlsx");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build the file.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-raised disabled:opacity-60"
      >
        {busy ? "Building…" : "Download Excel"}
      </button>
      {error && <span className="text-xs text-owl-red-light">{error}</span>}
    </div>
  );
}

function Tile({ label, value, tone = "" }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-text-dim">{label}</div>
      <div className={`mt-0.5 font-display text-xl font-semibold ${tone}`}>{value}</div>
    </Card>
  );
}

function StatusChip({ level }: { level: PlayLevel }) {
  const l = levelInfo(level);
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${l.chip}`}>{l.label}</span>;
}

function ReportRow({ row, first, onOpen }: { row: Row; first: boolean; onOpen: (p: CareDayPlayer) => void }) {
  const { player: p, issue: i, level } = row;
  const a = p.availability;
  const conditioning = [
    ["Bike", a?.bike],
    ["Jogging", a?.jogging],
    ["Running", a?.running],
  ].filter(([, v]) => v) as [string, string][];
  const note = i?.latestLog ? [i.latestLog.notes, i.latestLog.activities].filter(Boolean)[0] : null;
  return (
    <tr className={`group align-top hover:bg-surface-raised ${first ? "border-t-2 border-t-border" : "border-t border-border/60"}`}>
      <td className="px-3 py-2.5">{first ? <StatusChip level={level} /> : null}</td>
      <td className="sticky left-0 z-10 bg-surface px-3 py-2.5 shadow-[inset_-1px_0_0_var(--color-border)] group-hover:bg-surface-raised">
        <button onClick={() => onOpen(p)} className="whitespace-nowrap text-left font-medium hover:text-owl-red-light">
          {p.name}
        </button>
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-text-dim">{i?.injury_date ? formatDate(i.injury_date) : ""}</td>
      <td className="px-2 py-2.5 text-center tabular-nums">{i?.days ?? ""}</td>
      <td className="px-2 py-2.5">
        {i ? (
          <Link to={`/injuries/${i.id}`} className="hover:text-owl-red-light hover:underline">
            {i.description}
          </Link>
        ) : (
          <span className="text-text-dim">—</span>
        )}
        {i && <div className="text-[11px] text-text-dim">{stageLabel(i.stage)}</div>}
      </td>
      <td className="px-2 py-2.5 text-center">{i ? sideLabel(i.side) || "NA" : ""}</td>
      <td className="max-w-[14rem] px-2 py-2.5">{a?.practice_note ?? ""}</td>
      <td className="max-w-[16rem] px-2 py-2.5 text-xs">
        {conditioning.length ? (
          conditioning.map(([k, v]) => (
            <div key={k}>
              <span className="text-text-dim">{k}:</span> {v}
            </div>
          ))
        ) : (
          <span className="text-text-dim">NA</span>
        )}
      </td>
      <td className="max-w-[16rem] px-2 py-2.5 text-xs">{note ?? ""}</td>
      <td className="px-2 py-2.5 text-center font-semibold">
        {(() => {
          const mark = attendanceMark(p.treatments);
          return mark === "Y" || mark === "N" ? mark : <span className="text-xs font-normal text-text-dim">{mark || "NA"}</span>;
        })()}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-text-dim">{i?.expected_return ? formatDate(i.expected_return) : ""}</td>
    </tr>
  );
}

function SideSection({ title, rows, onOpen }: { title: string; rows: Row[]; onOpen: (p: CareDayPlayer) => void }) {
  return (
    <Card className="overflow-x-auto p-0">
      <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-dim">{title}</div>
      <table className="w-full min-w-[640px] text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.issue!.id} className="border-b border-border/60 align-top last:border-0">
              <td className="w-28 px-3 py-2.5">
                <StatusChip level={r.level} />
              </td>
              <td className="px-3 py-2.5">
                <button onClick={() => onOpen(r.player)} className="font-medium hover:text-owl-red-light">
                  {r.player.name}
                </button>
              </td>
              <td className="px-2 py-2.5">
                <Link to={`/injuries/${r.issue!.id}`} className="hover:text-owl-red-light hover:underline">
                  {r.issue!.description}
                </Link>
              </td>
              <td className="px-2 py-2.5">{r.player.availability?.practice_note ?? ""}</td>
              <td className="px-2 py-2.5 text-xs text-text-dim">{r.issue!.latestLog?.notes ?? r.issue!.latestLog?.activities ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
