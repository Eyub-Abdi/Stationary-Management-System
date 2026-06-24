import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from '@/lib/constants';
import { compactNumber, currency } from '@/lib/utils';

const axisStyle = { fontSize: 11, fill: 'rgb(var(--c-outline))', fontFamily: 'JetBrains Mono' };

function ChartTooltip({ active, payload, label, valueFormatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 shadow-lg">
      {label && <p className="mb-1 text-[12px] font-semibold text-on-surface">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-2 text-[12px] text-on-surface-variant">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}:{' '}
          <span className="font-semibold text-on-surface">
            {valueFormatter ? valueFormatter(p.value) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export function AreaTrendChart({
  data,
  xKey,
  yKey,
  color = CHART_COLORS[0],
  height = 220,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${yKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey={xKey} tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => compactNumber(Number(v))}
        />
        <Tooltip content={<ChartTooltip valueFormatter={(v: number) => currency(v)} />} />
        <Area
          type="monotone"
          dataKey={yKey}
          name="Revenue"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#grad-${yKey})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MiniBarChart({
  data,
  xKey,
  yKey,
  color = CHART_COLORS[0],
  height = 220,
  valueFormatter,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey={xKey} tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => compactNumber(Number(v))}
        />
        <Tooltip
          cursor={{ fill: 'rgb(var(--c-surface-container) / 0.6)' }}
          content={<ChartTooltip valueFormatter={valueFormatter ?? ((v: number) => currency(v))} />}
        />
        <Bar dataKey={yKey} name="Value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  height = 200,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="64%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip valueFormatter={(v: number) => currency(v)} />} />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {/* Constrain to the donut hole (inner radius is 64%) so long totals
              never bleed out onto the surrounding ring. */}
          <div
            className="flex flex-col items-center gap-0.5 text-center leading-tight"
            style={{ maxWidth: Math.round(height * 0.58) }}
          >
            {centerLabel && (
              <span className="text-[10px] uppercase tracking-wide text-on-surface-variant">
                {centerLabel}
              </span>
            )}
            {centerValue && (
              <span className="break-words font-mono-data text-body-lg font-bold leading-tight text-on-surface">
                {centerValue}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
