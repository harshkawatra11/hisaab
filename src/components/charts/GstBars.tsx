"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatCompactINR } from "@/lib/money";

export function GstBars({ outputPaise, inputPaise }: { outputPaise: number; inputPaise: number }) {
  const data = [
    { label: "Output GST", value: outputPaise, fill: "var(--color-chart-2)" },
    { label: "Input GST", value: inputPaise, fill: "var(--color-chart-3)" },
  ];
  return (
    <ChartContainer config={{ value: { label: "GST" } }} className="h-[140px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
        <CartesianGrid horizontal={false} strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: number) => formatCompactINR(v)} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={72} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCompactINR(Number(value))} />} />
        <Bar dataKey="value" radius={[0, 2, 2, 0]}>
          {data.map((row) => (
            <Cell key={row.label} fill={row.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
