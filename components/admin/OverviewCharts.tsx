"use client";

// Recharts wrappers for the admin overview. Lives in its own client file so
// the page itself stays a server component and only ships chart JS when an
// admin actually visits /admin.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface DayPoint {
  date: string;
  value: number;
}

const INDIGO = "#4f46e5";
const EMERALD = "#10b981";

export function GrowthLineChart({
  data,
  color = INDIGO,
}: {
  data: DayPoint[];
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickFormatter={(v) => v.slice(5)}
        />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "#0f172a",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "#cbd5e1" }}
          itemStyle={{ color: "#fff" }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface PlanSlice {
  name: string;
  value: number;
}

const PLAN_COLORS: Record<string, string> = {
  Free: "#94a3b8",
  Starter: INDIGO,
  Growth: EMERALD,
};

export function PlanDonutChart({ data }: { data: PlanSlice[] }) {
  // Recharts can't render a donut from all-zero data — show an empty state.
  if (data.every((d) => d.value === 0)) {
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">
        No users yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
        >
          {data.map((slice) => (
            <Cell key={slice.name} fill={PLAN_COLORS[slice.name] ?? "#cbd5e1"} />
          ))}
        </Pie>
        <Legend
          verticalAlign="bottom"
          height={24}
          iconSize={10}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            background: "#0f172a",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "#cbd5e1" }}
          itemStyle={{ color: "#fff" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
