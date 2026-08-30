"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatCompactINR } from "@/lib/money";

export interface CashFlowPoint {
  date: string;
  actualPaise: number | null;
  forecastPaise: number | null;
}

export function CashFlowChart({
  data,
  shortfallDate,
}: {
  data: CashFlowPoint[];
  shortfallDate?: string | null;
}) {
  const shortfallPoint = shortfallDate ? data.find((d) => d.date === shortfallDate) : undefined;

  return (
    <ChartContainer
      config={{
        actualPaise: { label: "Actual", color: "var(--color-chart-1)" },
        forecastPaise: { label: "Forecast", color: "var(--color-chart-1)" },
      }}
      className="h-[220px] w-full"
    >
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          fontSize={11}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          fontSize={11}
          tickFormatter={(v: number) => formatCompactINR(v)}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => formatCompactINR(Number(value))} />}
        />
        <Line
          dataKey="actualPaise"
          type="monotone"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        <Line
          dataKey="forecastPaise"
          type="monotone"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          connectNulls={false}
        />
        {shortfallPoint && (
          <ReferenceDot
            x={shortfallPoint.date}
            y={shortfallPoint.forecastPaise ?? 0}
            r={5}
            fill="var(--color-critical)"
            stroke="var(--card)"
            strokeWidth={2}
          />
        )}
      </LineChart>
    </ChartContainer>
  );
}
