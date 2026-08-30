"use client";

import { Bar, ComposedChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatCompactINR } from "@/lib/money";

export interface InOutRow {
  date: string;
  inflowPaise: number;
  outflowPaise: number;
  balancePaise: number;
}

export function InOutBars({ data }: { data: InOutRow[] }) {
  return (
    <ChartContainer
      config={{
        inflowPaise: { label: "Inflow", color: "var(--color-good)" },
        outflowPaise: { label: "Outflow", color: "var(--color-critical)" },
        balancePaise: { label: "Balance", color: "var(--color-chart-1)" },
      }}
      className="h-[200px] w-full"
    >
      <ComposedChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} minTickGap={24} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tickLine={false} axisLine={false} width={52} fontSize={11} tickFormatter={(v: number) => formatCompactINR(v)} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCompactINR(Number(value))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="inflowPaise" fill="var(--color-good)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="outflowPaise" fill="var(--color-critical)" radius={[2, 2, 0, 0]} />
        <Line dataKey="balancePaise" type="monotone" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
