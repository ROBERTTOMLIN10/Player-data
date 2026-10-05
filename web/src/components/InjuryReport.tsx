import { useState } from "react";
import { Link } from "react-router-dom";
import { useCareDay, useIssues } from "../api/client";
import { attendanceMark, categoryLabel, levelInfo, sideLabel, stageLabel } from "../lib/care";
import { downloadFrom } from "../lib/download";
import { formatDate, formatDateLong } from "../lib/format";
import type { CareDayPlayer, Issue, OpenIssue, PlayLevel } from "../types";
import { Card } from "./Card";
import { Segmented } from "./SeasonStats";

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
 * It's the squad's summary for the day (from the AT's entries and the Pre/Post
 * practice decisions), with the season's injury history underneath.
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

  // Where the squad is at for the day.
  const counts = {
    available: data.players.filter((p) => !p.availability || p.availability.level === "full").length,
    restricted: data.players.filter((p) => p.availability && ["as_tolerated", "limited", "rehab"].includes(p.availability.level)).length,
    out: data.players.filter((p) => p.availability?.level === "out").length,
    injuries: data.players.reduce((n, p) => n + p.issues.filter((i) => i.category === "injury").length, 0),
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold sm:text-xl">FAU Men&rsquo;s Soccer Injury Report</h2>
          <p className="text-sm text-text-dim">
            {formatDateLong(data.date)} · where the squad is at, from the AT&rsquo;s entries and today&rsquo;s Pre/Post practice decisions
          </p>
        </div>
        <ExcelButton date={data.date} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Available" value={`${counts.available}/${data.players.length}`} tone="text-teal" />
        <Tile label="Restricted" value={counts.restricted} tone="text-gold" />
        <Tile label="Out" value={counts.out} tone="text-owl-red-light" />
        <Tile label="Open injuries" value={counts.injuries} />
      </div>

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
      <InjuryHistory />
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

/** Every injury and issue reported this season: when, how long, and whether they're back. */
function InjuryHistory() {
  const { data } = useIssues(true);
  const [show, setShow] = useState<"all" | "recovered" | "open">("all");
  if (!data) return null;
  const rows = data.issues
    .filter((i) => (show === "all" ? true : show === "recovered" ? Boolean(i.closed_at) : !i.closed_at))
    .sort((a, b) => String(b.injury_date ?? b.created_at).localeCompare(String(a.injury_date ?? a.created_at)));
  const recovered = data.issues.filter((i) => i.closed_at).length;
  const daysOut = (i: Issue) => {
    const from = i.injury_date ?? i.created_at.slice(0, 10);
    const to = i.closed_at ?? data.today;
    return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
  };
  return (
    <Card className="overflow-x-auto p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="font-display text-base font-semibold">Injury history</h3>
          <p className="text-xs text-text-dim">
            {data.issues.length} reported · {recovered} recovered · {data.issues.length - recovered} open
          </p>
        </div>
        <Segmented
          value={show}
          options={[
            { key: "all", label: "All" },
            { key: "open", label: "Open" },
            { key: "recovered", label: "Recovered" },
          ]}
          onChange={setShow}
          label="Show"
        />
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-text-dim">Nothing here yet.</p>
      ) : (
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-dim">
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-2 py-2 font-medium">Injury / issue</th>
              <th className="px-2 py-2 text-center font-medium">Side</th>
              <th className="px-2 py-2 font-medium">Reported</th>
              <th className="px-2 py-2 font-medium">Back</th>
              <th className="px-2 py-2 text-center font-medium">Days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="border-b border-border/60 last:border-0 hover:bg-surface-raised">
                <td className="whitespace-nowrap px-3 py-2 font-medium">{i.player_name}</td>
                <td className="px-2 py-2">
                  <Link to={`/injuries/${i.id}`} className="hover:text-owl-red-light hover:underline">
                    {i.description}
                  </Link>
                  {i.category !== "injury" && <span className="ml-1.5 rounded border border-border px-1 text-[10px] uppercase text-text-dim">{categoryLabel(i.category)}</span>}
                </td>
                <td className="px-2 py-2 text-center">{sideLabel(i.side) || ""}</td>
                <td className="whitespace-nowrap px-2 py-2 text-text-dim">{i.injury_date ? formatDate(i.injury_date) : formatDate(i.created_at.slice(0, 10))}</td>
                <td className="whitespace-nowrap px-2 py-2">
                  {i.closed_at ? (
                    <span className="text-teal">{formatDate(i.closed_at)}</span>
                  ) : (
                    <span className="text-gold">Open · {stageLabel(i.stage)}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{daysOut(i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
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
