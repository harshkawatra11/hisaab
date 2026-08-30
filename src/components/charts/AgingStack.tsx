"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatCompactINR } from "@/lib/money";

export interface AgingRow {
  bucket: string;
  amountPaise: number;
}

const BUCKET_COLORS: Record<string, string> = {
  "0-7d": "var(--color-good)",
  "8-15d": "var(--color-warning)",
  "16-30d": "var(--color-serious)",
  "30d+": "var(--color-critical)",
};

export function AgingStack({ data }: { data: AgingRow[] }) {
  return (
    <ChartContainer config={{ amountPaise: { label: "Outstanding" } }} className="h-[190px] w-full">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          fontSize={11}
          tickFormatter={(v: number) => formatCompactINR(v)}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCompactINR(Number(value))} />} />
        <Bar dataKey="amountPaise" radius={[2, 2, 0, 0]}>
          {data.map((row) => (
            <Cell key={row.bucket} fill={BUCKET_COLORS[row.bucket] ?? "var(--color-chart-1)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
