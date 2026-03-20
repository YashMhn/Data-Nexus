import React, { useState } from 'react';

interface DBConnectionPanelProps {
  onConnect: (credentials: any) => void;
  status: 'disconnected' | 'connecting' | 'connected';
}

const DBConnectionPanel: React.FC<DBConnectionPanelProps> = ({ onConnect, status }) => {
  const [dbType, setDbType] = useState('postgres');
  const [host, setHost] = useState('localhost:5432');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect({ dbType, host, username, password });
  };

  return (
    <div className="glass-panel">
      <h2 style={{ fontSize: '1.25rem', margin: '0 0 20px 0', fontWeight: 500 }}>Data Source</h2>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Engine</label>
          <select 
            value={dbType} 
            onChange={e => setDbType(e.target.value)}
            disabled={status !== 'disconnected'}
            style={{ 
              background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--panel-border)',
              padding: '10px 12px', borderRadius: '8px', outline: 'none',
              fontFamily: 'inherit', transition: 'border-color 0.2s'
            }}
          >
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="sqlite">SQLite (Local)</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Host / Path</label>
          <input 
            type="text" 
            value={host}
            onChange={e => setHost(e.target.value)}
            disabled={status !== 'disconnected'}
            style={{ 
              background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--panel-border)',
              padding: '10px 12px', borderRadius: '8px', outline: 'none',
              fontFamily: 'inherit'
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Username</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={status !== 'disconnected'}
              style={{ 
                background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--panel-border)',
                padding: '10px 12px', borderRadius: '8px', outline: 'none',
                fontFamily: 'inherit', width: '100%'
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={status !== 'disconnected'}
              style={{ 
                background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--panel-border)',
                padding: '10px 12px', borderRadius: '8px', outline: 'none',
                fontFamily: 'inherit', width: '100%'
              }}
            />
          </div>
        </div>

        <button 
          type="submit" 
          disabled={status !== 'disconnected'}
          style={{
            marginTop: '8px', padding: '12px', borderRadius: '8px',
            border: 'none', background: status === 'connected' ? 'var(--success)' : 'var(--accent)',
            color: '#fff', fontWeight: 600, fontSize: '0.95rem',
            cursor: status === 'disconnected' ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s ease',
            boxShadow: status === 'disconnected' ? '0 4px 15px var(--accent-glow)' : 'none'
          }}
        >
          {status === 'disconnected' ? 'Connect Database' : 
           status === 'connecting' ? 'Connecting...' : 'Connected'}
        </button>
      </form>
    </div>
  );
};

export default DBConnectionPanel;
