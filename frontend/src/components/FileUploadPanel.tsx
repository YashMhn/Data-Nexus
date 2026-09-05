import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ApiError, ACCEPTED_EXTENSIONS, uploadDataset, validateFile } from '../api';
import type { DatasetSummary } from '../types';

interface FileUploadPanelProps {
  onUploaded: (summary: DatasetSummary) => void;
  currentFilename: string | null;
}

const FileUploadPanel = ({ onUploaded, currentFilename }: FileUploadPanelProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const problem = validateFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      onUploaded(await uploadDataset(file));
    } catch (uploadError) {
      // A non-2xx response is a failure, not a payload. Surface it instead of
      // rendering a green "Loaded" state over an empty dashboard.
      setError(
        uploadError instanceof ApiError
          ? uploadError.message
          : 'Upload failed. Please try again.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="glass-panel">
      <h2 className="panel-title">Data Source</h2>

      <input
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        ref={fileInputRef}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear the input so re-selecting the same file fires onChange again.
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      <div
        className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <button
          type="button"
          className="dropzone__button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <span className="pulse">Analysing with pandas…</span>
          ) : (
            <>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Select a file
            </>
          )}
        </button>
        <p className="dropzone__hint">
          or drop a {ACCEPTED_EXTENSIONS.join(' / ')} file here
        </p>
      </div>

      {currentFilename && !isUploading && !error && (
        <p className="status-line status-line--ok">
          <span className="status-dot status-dot--ok" />
          Loaded: {currentFilename}
        </p>
      )}

      {error && (
        <p className="status-line status-line--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default FileUploadPanel;
