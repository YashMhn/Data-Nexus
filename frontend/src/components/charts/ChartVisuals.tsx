import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { ChartType, ScatterDatum, SeriesPoint } from '../../types';

interface ChartVisualsProps {
  type: ChartType;
  series: SeriesPoint[];
  points: ScatterDatum[];
}

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f59e0b',
  '#3b82f6',
];

// Recharts injects these; every field is optional because we render the
// element ourselves with no props.
interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: { name?: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

function formatValue(value: number | string | undefined): string {
  if (typeof value === 'number') return numberFormat.format(value);
  return value ?? '';
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const heading = label ?? payload[0]?.payload?.name ?? '';
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{heading}</p>
      {payload.map((entry, index) => (
        <p
          key={index}
          className="chart-tooltip__value"
          style={{ color: entry.color ?? 'var(--text-main)' }}
        >
          {entry.name && entry.name !== 'value' && entry.name !== 'y'
            ? `${entry.name}: `
            : ''}
          {formatValue(entry.value)}
        </p>
      ))}
    </div>
  );
};

const Placeholder = ({ children }: { children: string }) => (
  <div className="chart-placeholder">{children}</div>
);

const ChartVisuals = ({ type, series, points }: ChartVisualsProps) => {
  if (type === 'scatter') {
    if (points.length === 0) {
      return <Placeholder>No plottable points for these two columns.</Placeholder>;
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 16, bottom: 16, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            type="number"
            dataKey="x"
            stroke="#94a3b8"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="number"
            dataKey="y"
            stroke="#94a3b8"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <ZAxis type="category" dataKey="name" name="Item" />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter name="Distribution" data={points} fill={COLORS[1]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (series.length === 0) {
    return <Placeholder>No values to chart for this selection.</Placeholder>;
  }

  if (type === 'pie' || type === 'donut') {
    // A slice cannot represent a negative contribution to a whole, and
    // recharts renders those as an inverted wedge. Drop them and say so.
    const positive = series.filter((point) => point.value > 0);
    if (positive.length === 0) {
      return (
        <Placeholder>
          Pie charts need positive values; try a bar chart for this column.
        </Placeholder>
      );
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="bottom" height={36} iconType="circle" />
          <Pie
            data={positive}
            cx="50%"
            cy="50%"
            innerRadius={type === 'donut' ? '55%' : 0}
            outerRadius="80%"
            paddingAngle={type === 'donut' ? 3 : 0}
            dataKey="value"
            nameKey="name"
            stroke="none"
          >
            {positive.map((point, index) => (
              <Cell key={point.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            stroke="#94a3b8"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={COLORS[0]}
            strokeWidth={3}
            dot={{ r: 3, fill: '#fff' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={series} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
        <defs>
          {/* SVG ids are document-global; namespace it so a second chart
              cannot silently steal this gradient. */}
          <linearGradient id="dataNexusBarFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity={1} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.05)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          stroke="#94a3b8"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="url(#dataNexusBarFill)" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ChartVisuals;
