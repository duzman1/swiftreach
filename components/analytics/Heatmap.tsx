"use client";

// 7×24 "best time to send" grid. Cells are colored by read rate — empty
// cells render as a dim slash to distinguish "no data" from "0% read".

interface Cell {
  sent: number;
  read: number;
  rate: number | null;
}

interface Props {
  grid: Cell[][];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function colorFor(rate: number | null): string {
  if (rate == null) return "bg-zinc-100";
  if (rate >= 75) return "bg-emerald-600";
  if (rate >= 50) return "bg-emerald-500";
  if (rate >= 30) return "bg-emerald-400";
  if (rate >= 15) return "bg-emerald-300";
  if (rate > 0) return "bg-emerald-200";
  return "bg-zinc-200";
}

function labelHour(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

export function Heatmap({ grid }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] border-separate border-spacing-[2px]">
        <thead>
          <tr>
            <th className="w-9" />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="font-normal text-zinc-500 px-0.5 min-w-[18px]">
                {h % 3 === 0 ? labelHour(h) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, dow) => (
            <tr key={dow}>
              <th className="font-medium text-zinc-600 text-right pr-2 align-middle">
                {WEEKDAYS[dow]}
              </th>
              {row.map((cell, hr) => (
                <td
                  key={hr}
                  className={`w-[18px] h-[18px] rounded ${colorFor(cell.rate)}`}
                  title={
                    cell.rate == null
                      ? `${WEEKDAYS[dow]} ${labelHour(hr)}: no sends`
                      : `${WEEKDAYS[dow]} ${labelHour(hr)}: ${cell.read}/${cell.sent} read (${cell.rate}%)`
                  }
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-zinc-500">
        <span>Low</span>
        <span className="w-4 h-3 rounded bg-emerald-200" />
        <span className="w-4 h-3 rounded bg-emerald-300" />
        <span className="w-4 h-3 rounded bg-emerald-400" />
        <span className="w-4 h-3 rounded bg-emerald-500" />
        <span className="w-4 h-3 rounded bg-emerald-600" />
        <span>High</span>
        <span className="ml-3 inline-flex items-center gap-1">
          <span className="w-4 h-3 rounded bg-zinc-100" /> No data
        </span>
      </div>
    </div>
  );
}
