import React from 'react';
import { 
  BarChart, Bar, PieChart, Pie, LineChart, Line, ScatterChart, Scatter, 
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend, ZAxis 
} from 'recharts';

interface ChartVisualsProps {
  data: any[];
  scatterData?: any[];
  isActive: boolean;
  type: 'bar' | 'pie' | 'donut' | 'line' | 'scatter';
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(20, 24, 39, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.15)',
        padding: '12px',
        borderRadius: '8px',
        color: '#fff',
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)'
      }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{label || payload[0]?.payload?.name}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: entry.color || 'var(--text-main)' }}>
            {entry.name && entry.name !== 'value' && entry.name !== 'y' ? `${entry.name}: ` : ''} 
            {entry.value?.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const ChartVisuals: React.FC<ChartVisualsProps> = ({ data, scatterData, isActive, type }) => {
  if (!isActive) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Awaiting Connection...
      </div>
    );
  }

  const hasData = type === 'scatter' ? (scatterData && scatterData.length > 0) : (data && data.length > 0);
  if (!hasData) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
        <div style={{ animation: 'pulse 1.5s infinite' }}>Insufficient Data for Analysis</div>
      </div>
    );
  }

  const renderChart = () => {
    switch (type) {
      case 'pie':
      case 'donut':
        return (
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="bottom" height={36} iconType="circle" />
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={type === 'donut' ? 60 : 0}
              outerRadius={90}
              paddingAngle={type === 'donut' ? 3 : 0}
              dataKey="value"
              stroke="none"
              animationDuration={1500}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        );

      case 'line':
        return (
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}`} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }} />
            <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={4} dot={{ r: 4, fill: '#fff' }} activeDot={{ r: 8 }} animationDuration={1500} />
          </LineChart>
        );

      case 'scatter':
        if (!scatterData || scatterData.length === 0) return <div style={{color:'var(--text-muted)', textAlign:'center', paddingTop:'15%'}}>Need 2 numeric columns for Scatter</div>;
        return (
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" dataKey="x" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
            <YAxis type="number" dataKey="y" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
            <ZAxis type="category" dataKey="name" name="Item" />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter name="Distribution" data={scatterData} fill="var(--accent-hover)" animationDuration={1500}>
              {scatterData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Scatter>
          </ScatterChart>
        );

      case 'bar':
      default:
        return (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-hover)" stopOpacity={1}/>
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.3}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}`} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} animationDuration={1500}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill="url(#colorBar)" />
              ))}
            </Bar>
          </BarChart>
        );
    }
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {renderChart()}
    </ResponsiveContainer>
  );
};

export default ChartVisuals;
