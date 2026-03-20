import { useState, useEffect, lazy, Suspense } from 'react';
import './index.css';
import 'leaflet/dist/leaflet.css';
import DBConnectionPanel from './components/DBConnectionPanel';
import FileUploadPanel from './components/FileUploadPanel';

// Lazy-load heavy visualization libraries for code-splitting
const ChartVisuals = lazy(() => import('./components/charts/ChartVisuals'));
const SpatialMapVisual = lazy(() => import('./components/spatial/SpatialMapVisual'));

const TabButton = ({ active, label, onClick }: any) => (
  <button 
    onClick={onClick}
    style={{
      background: active ? 'var(--accent)' : 'transparent',
      color: active ? '#fff' : 'var(--text-muted)',
      border: active ? '1px solid var(--accent-hover)' : '1px solid transparent',
      padding: '4px 12px',
      borderRadius: '20px',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: active ? 600 : 400,
      transition: 'all 0.2s'
    }}
  >
    {label}
  </button>
);

function App() {
  const [dbStatus, setDbStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [spatialData, setSpatialData] = useState<any[] | undefined>(undefined);
  const [metrics, setMetrics] = useState<any>(null);
  const [axisConfigs, setAxisConfigs] = useState<Record<string, { x: string, y: string, agg: string }>>({});
  const [rawData, setRawData] = useState<any[]>([]);
  const [strCols, setStrCols] = useState<string[]>([]);
  const [numCols, setNumCols] = useState<string[]>([]);
  const AGG_METHODS = ['sum', 'average', 'max', 'min', 'count'];
  
  // Multi-select state
  const WIDGETS = [
    { id: 'map', label: 'Spatial Map' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'bar', label: 'Bar Chart' },
    { id: 'line', label: 'Line Chart' },
    { id: 'pie', label: 'Pie Chart' },
    { id: 'donut', label: 'Donut Chart' },
    { id: 'scatter', label: 'Scatter Plot' }
  ];
  const [activeWidgets, setActiveWidgets] = useState<string[]>(['metrics', 'map', 'bar']);

  const toggleWidget = (id: string) => {
    setActiveWidgets(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]);
  };

  // Auto-fetch mock data from backend when DB-connected (not from file upload)
  useEffect(() => {
    if (dbStatus === 'connected' && !spatialData && rawData.length === 0) {
      fetch('http://localhost:8000/api/data/bar-chart')
        .then(res => res.json())
        .catch(err => console.error("Failed to fetch data:", err));
    }
  }, [dbStatus, spatialData, rawData]);

  const handleConnect = async (credentials: any) => {
    setDbStatus('connecting');
    // Simulate connection delay to backend
    setTimeout(() => {
      console.log('Connected to backend with:', credentials);
      setDbStatus('connected');
    }, 1200);
  };

  const handleUploadSuccess = (uploadData: any) => {
    setDbStatus('connected');
    
    // Always wipe slate clean for new uploads
    setSpatialData(uploadData.spatial && uploadData.spatial.length > 0 ? uploadData.spatial : []);
    setMetrics(uploadData.metrics || null);
    setRawData(uploadData.raw_data || []);
    setStrCols(uploadData.str_cols || []);
    setNumCols(uploadData.num_cols || []);
    
    // Setup isolated independent configurations for each chart view
    const initialConfigs: Record<string, { x: string, y: string, agg: string }> = {};
    const bestNumCols = uploadData.meaningful_num_cols?.length > 0 ? uploadData.meaningful_num_cols : uploadData.num_cols || [];
    const dX = uploadData.str_cols?.[0] || '';
    const dY = bestNumCols[0] || '';
    const scX = bestNumCols.length > 1 ? bestNumCols[1] : bestNumCols[0] || dX;
    ['bar', 'line', 'pie', 'donut', 'scatter'].forEach(t => {
      initialConfigs[t] = { x: t === 'scatter' ? scX : dX, y: dY, agg: 'sum' };
    });
    setAxisConfigs(initialConfigs);
  };

  const getDerivedData = (type: string, colX: string, colY: string, aggMethod: string = 'sum') => {
    if (!rawData.length || !colX || !colY) return [];
    if (type === 'scatter') {
       return rawData.slice(0, 200).map((row: any, i: number) => ({
         x: parseFloat(row[colX]) || 0,
         y: parseFloat(row[colY]) || 0,
         name: String(row[strCols[0] || ''] || `Point ${i}`)
       }));
    } else {
       // Group by X column
       const groups: Record<string, number[]> = {};
       rawData.forEach((row: any) => {
         const key = String(row[colX] ?? 'Unknown').substring(0, 20);
         const val = parseFloat(row[colY]);
         if (!groups[key]) groups[key] = [];
         if (!isNaN(val)) groups[key].push(val);
       });
       
       // Aggregate based on selected method
       return Object.entries(groups)
         .map(([name, values]) => {
           let value = 0;
           switch (aggMethod) {
             case 'sum': value = values.reduce((a, b) => a + b, 0); break;
             case 'average': value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0; break;
             case 'max': value = values.length > 0 ? Math.max(...values) : 0; break;
             case 'min': value = values.length > 0 ? Math.min(...values) : 0; break;
             case 'count': value = values.length; break;
             default: value = values.reduce((a, b) => a + b, 0);
           }
           return { name, value: Math.round(value * 100) / 100 };
         })
         .sort((a, b) => b.value - a.value)
         .slice(0, 15);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar for Controls */}
      <aside className="sidebar">
        <DBConnectionPanel onConnect={handleConnect} status={dbStatus} />
        <FileUploadPanel onUploadSuccess={handleUploadSuccess} />
        
        {/* We can add more controls here later */}
        <div className="glass-panel" style={{ marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontWeight: 500 }}>Insights</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            {dbStatus === 'connected' 
              ? "Connection verified. Analyzing spatial trends and monthly aggregation." 
              : "Connect to a database engine to stream insights."}
          </p>
        </div>
      </aside>

      {/* Main Dashboard Area */}
      <main className="dashboard-main">
        <header className="dashboard-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <h1>Data Nexus</h1>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', 
              background: 'var(--panel-bg)', padding: '8px 16px', 
              borderRadius: '20px', border: '1px solid var(--panel-border)'
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: dbStatus === 'connected' ? 'var(--success)' : 
                            dbStatus === 'connecting' ? 'orange' : 'var(--danger)',
                boxShadow: `0 0 10px ${dbStatus === 'connected' ? 'var(--success)' : 'transparent'}`
              }}></div>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {dbStatus === 'connected' ? 'Live Stream' : 'Offline'}
              </span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '24px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '6px 12px' }}>Active Widgets:</span>
            {WIDGETS.map(w => (
              <TabButton 
                key={w.id} 
                active={activeWidgets.includes(w.id)} 
                label={w.label} 
                onClick={() => toggleWidget(w.id)} 
              />
            ))}
          </div>
        </header>

        <div className="dashboard-grid">
          
          {/* Dynamically Render Active Widgets */}
          
          {activeWidgets.includes('metrics') && (
            <div className="glass-panel resizable full-width" style={{ minHeight: '200px', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <h3 style={{ margin: '0 0 16px', fontWeight: 500, alignSelf: 'flex-start', width: '100%' }}>Dataset Metrics</h3>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                 {metrics ? (
                   <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '32px' }}>
                     <div>
                       <div style={{ fontSize: '3rem', color: 'var(--text-main)', fontWeight: 600, textShadow: '0 0 20px var(--accent-glow)', lineHeight: 1.1 }}>
                         {metrics.total_rows.toLocaleString()}
                       </div>
                       <div>Total Rows Vectorized</div>
                     </div>
                     <div>
                       <div style={{ fontSize: '2rem', color: 'var(--text-main)', fontWeight: 500, marginTop: '8px' }}>{metrics.columns_count}</div>
                       <div style={{ fontSize: '0.85rem' }}>Dimensions</div>
                     </div>
                     {metrics.top_category && metrics.top_category !== "N/A" && (
                       <div>
                         <div style={{ fontSize: '2rem', color: 'var(--accent-hover)', fontWeight: 500, marginTop: '8px' }}>{metrics.top_category}</div>
                         <div style={{ fontSize: '0.85rem' }}>Top Category</div>
                       </div>
                     )}
                   </div>
                 ) : dbStatus === 'connected' ? (
                   "Calculating via Vectors..."
                 ) : (
                   "Awaiting Data..."
                 )}
              </div>
            </div>
          )}

          {activeWidgets.includes('map') && (
            <div className="glass-panel resizable">
              <h3 style={{ margin: '0 0 16px', fontWeight: 500 }}>Geospatial Distribution</h3>
              <div style={{ flex: 1, position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
                <Suspense fallback={<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading Map...</div>}>
                  <SpatialMapVisual isActive={dbStatus === 'connected'} externalData={spatialData} />
                </Suspense>
              </div>
            </div>
          )}

          {['bar', 'line', 'pie', 'donut', 'scatter'].map(chartType => {
            if (!activeWidgets.includes(chartType)) return null;
            
            const config = axisConfigs[chartType] || { x: '', y: '', agg: 'sum' };
            const curX = config.x;
            const curY = config.y;
            const curAgg = config.agg || 'sum';
            const subtitle = metrics && curX && curY ? (chartType === 'scatter' ? `Plotting '${curY}' vs '${curX}'` : `'${curX}' by ${curAgg} of '${curY}'`) : null;
            const derived = getDerivedData(chartType, curX, curY, curAgg);

            const setAxis = (field: 'x'|'y'|'agg', val: string) => {
              setAxisConfigs(prev => ({ ...prev, [chartType]: { ...prev[chartType], [field]: val } }));
            };
            
            const selectStyle = { background: 'var(--bg-color)', color: '#fff', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '4px 8px', fontSize: '0.8rem', outline: 'none', maxWidth: '150px' };
            
            return (
              <div key={chartType} className="glass-panel resizable">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ minWidth: '120px' }}>
                    <h3 style={{ margin: '0 0 4px', fontWeight: 500, textTransform: 'capitalize' }}>{chartType} Analysis</h3>
                    {subtitle ? (
                      <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: 'var(--accent-hover)' }}>{subtitle}</p>
                    ) : (
                      <div style={{ marginBottom: '12px' }}></div>
                    )}
                  </div>
                  
                  {/* Axis + Aggregation Selectors */}
                  {strCols.length > 0 && numCols.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <select value={curX} onChange={e => setAxis('x', e.target.value)} style={selectStyle}>
                        {strCols.concat(chartType === 'scatter' ? numCols : []).map(c => <option key={c} value={c}>{c} (X)</option>)}
                      </select>
                      <select value={curAgg} onChange={e => setAxis('agg', e.target.value)} style={selectStyle}>
                        {AGG_METHODS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                      </select>
                      <select value={curY} onChange={e => setAxis('y', e.target.value)} style={selectStyle}>
                        {numCols.map(c => <option key={c} value={c}>{c} (Y)</option>)}
                      </select>
                    </div>
                  )}
                </div>
                
                <div style={{ flex: 1, position: 'relative' }}>
                  <Suspense fallback={<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading Chart...</div>}>
                    <ChartVisuals type={chartType as any} data={chartType === 'scatter' ? [] : derived} scatterData={chartType === 'scatter' ? derived : []} isActive={dbStatus === 'connected'} />
                  </Suspense>
                </div>
              </div>
            );
          })}
          
        </div>
      </main>
    </div>
  );
}

export default App;
