import React, { useRef, useState } from 'react';

interface FileUploadPanelProps {
  onUploadSuccess: (data: any) => void;
}

const FileUploadPanel: React.FC<FileUploadPanelProps> = ({ onUploadSuccess }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
      } else {
        onUploadSuccess(result);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to upload file. Is the backend running?");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ marginTop: '24px' }}>
      <h2 style={{ fontSize: '1.25rem', margin: '0 0 16px 0', fontWeight: 500 }}>Or Upload CSV</h2>
      
      <input 
        type="file" 
        accept=".csv"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        style={{
          width: '100%', padding: '12px', borderRadius: '8px',
          border: '1px dashed var(--accent)', background: 'rgba(99, 102, 241, 0.1)',
          color: 'var(--accent)', fontWeight: 600, fontSize: '0.95rem',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
        }}
      >
        {isUploading ? (
          <span style={{ animation: 'pulse 1.5s infinite' }}>Analyzing CSV with Pandas...</span>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Select CSV File
          </>
        )}
      </button>

      {filename && !isUploading && !error && (
        <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }}></div>
          Loaded: {filename}
        </div>
      )}

      {error && (
        <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default FileUploadPanel;
