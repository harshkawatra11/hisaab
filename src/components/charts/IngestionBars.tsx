"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export interface IngestionRow {
  source: string;
  matched: number;
  review: number;
  exception: number;
}

export function IngestionBars({ data }: { data: IngestionRow[] }) {
  return (
    <ChartContainer
      config={{
        matched: { label: "Matched", color: "var(--color-good)" },
        review: { label: "Review", color: "var(--color-warning)" },
        exception: { label: "Exception", color: "var(--color-critical)" },
      }}
      className="h-[190px] w-full"
    >
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 0 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis type="category" dataKey="source" tickLine={false} axisLine={false} fontSize={11} width={56} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="matched" stackId="a" fill="var(--color-good)" radius={0} />
        <Bar dataKey="review" stackId="a" fill="var(--color-warning)" radius={0} />
        <Bar dataKey="exception" stackId="a" fill="var(--color-critical)" radius={[0, 2, 2, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
