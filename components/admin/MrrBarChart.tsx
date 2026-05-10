"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface PlanBar {
  name: string;
  value: number;
}

const COLORS: Record<string, string> = {
  Free: "#94a3b8",
  Starter: "#4f46e5",
  Growth: "#10b981",
};

export function MrrBarChart({ data }: { data: PlanBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickFormatter={(v) => `$${v}`}
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
          formatter={(v) => [`$${Number(v).toLocaleString()}`, "MRR"]}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={COLORS[d.name] ?? "#cbd5e1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
