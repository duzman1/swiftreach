"use client";

// Recharts wrappers for the analytics page. Lives in its own client file so
// the parent page can stay lean and we only ship recharts JS to /analytics.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

interface DayPoint {
  date: string;
  value: number;
}

const WHATSAPP = "#25D366";
const INDIGO = "#4f46e5";
const RED = "#ef4444";
const SLATE = "#64748b";

export function VolumeLineChart({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: SLATE }}
          tickFormatter={(v) => (typeof v === "string" ? v.slice(5) : "")}
        />
        <YAxis tick={{ fontSize: 11, fill: SLATE }} allowDecimals={false} />
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
          stroke={WHATSAPP}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function OptOutLineChart({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: SLATE }}
          tickFormatter={(v) => (typeof v === "string" ? v.slice(5) : "")}
        />
        <YAxis tick={{ fontSize: 11, fill: SLATE }} allowDecimals={false} />
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
          stroke={RED}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface FunnelBar {
  name: string;
  value: number;
  color?: string;
}

export function FunnelChart({ data }: { data: FunnelBar[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 48, left: 56, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: SLATE }}
          allowDecimals={false}
          domain={[0, max]}
        />
        <YAxis
          dataKey="name"
          type="category"
          tick={{ fontSize: 12, fill: "#0f172a", fontWeight: 500 }}
          width={56}
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
          formatter={(v) => [`${Number(v).toLocaleString()}`, "Count"]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? INDIGO} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
