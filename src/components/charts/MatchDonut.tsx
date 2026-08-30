"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export interface MatchDonutProps {
  matched: number;
  review: number;
  exception: number;
}

export function MatchDonut({ matched, review, exception }: MatchDonutProps) {
  const total = matched + review + exception;
  const data = [
    { name: "Matched", value: matched, fill: "var(--color-good)" },
    { name: "Review", value: review, fill: "var(--color-warning)" },
    { name: "Exception", value: exception, fill: "var(--color-critical)" },
  ];

  return (
    <div className="relative">
      <ChartContainer
        config={{
          matched: { label: "Matched", color: "var(--color-good)" },
          review: { label: "Review", color: "var(--color-warning)" },
          exception: { label: "Exception", color: "var(--color-critical)" },
        }}
        className="h-[150px] w-full"
      >
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={64} strokeWidth={2} stroke="var(--card)">
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
        <div className="font-heading font-bold text-xl tabular-figures">{total}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">records</div>
      </div>
      <div className="flex justify-center gap-3 mt-1 text-[11px]">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1">
            <span className="size-2" style={{ backgroundColor: d.fill }} />
            <span className="text-muted-foreground">
              {d.name} {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
