import React, { useState } from 'react';
import clsx from 'clsx';
import { loadCaseFile } from '../../utils/caseLoader';
import { CaseFile } from '../../types';
import { Button, Notice } from '../ui/primitives';

/**
 * Case file input. Drop, browse, or load the bundled sample.
 *
 * The sample matters more than it looks: it lets the report be explored without
 * running a scan, which is the difference between a demo that works and one
 * that depends on hardware being present.
 */

const FileUpload: React.FC<{ onUpload: (data: CaseFile) => void; compact?: boolean }> = ({
  onUpload,
  compact = false,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const handleContent = (content: string) => {
    const { data, error: loadError } = loadCaseFile(content);
    if (data) {
      setError(null);
      onUpload(data);
    } else {
      setError(loadError ?? 'Unexpected error reading the case file.');
    }
  };

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError(`Expected a .json case file — got "${file.name}".`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => handleContent(event.target?.result as string);
    reader.onerror = () => setError('Could not read the selected file.');
    reader.readAsText(file);
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const response = await fetch(`${base}/samples/sample-case.json`);
      if (!response.ok) throw new Error(`sample returned HTTP ${response.status}`);
      handleContent(await response.text());
    } catch (err) {
      setError(
        `Could not load the bundled sample — ${err instanceof Error ? err.message : 'unknown error'}`
      );
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const files = Array.from(event.dataTransfer.files);
          if (files.length > 0) handleFile(files[0]);
        }}
        className={clsx(
          'rounded border border-dashed transition-colors',
          compact ? 'px-4 py-4' : 'px-5 py-8',
          dragOver
            ? 'border-accent-500 bg-accent-500/5'
            : 'border-ink-700 light:border-ink-200'
        )}
      >
        <div
          className={clsx(
            'flex flex-wrap items-center gap-x-4 gap-y-3',
            compact ? 'justify-between' : 'flex-col text-center'
          )}
        >
          <div className={compact ? 'min-w-0-fix' : ''}>
            <p className="text-xs text-ink-200 light:text-ink-800">
              Drop a case file, or browse
            </p>
            <p className="mt-1 font-mono text-2xs text-ink-500">
              JSON produced by checkup &middot; schema v1
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label>
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const files = event.target.files;
                  if (files && files.length > 0) handleFile(files[0]);
                }}
                className="hidden"
              />
              <span className="inline-flex cursor-pointer items-center rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-500 light:bg-accent-700 light:hover:bg-accent-600">
                Choose file
              </span>
            </label>
            <Button onClick={handleLoadSample} disabled={loadingSample}>
              {loadingSample ? 'Loading…' : 'Load sample'}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Notice tone="warn" onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}
    </div>
  );
};

export default FileUpload;
