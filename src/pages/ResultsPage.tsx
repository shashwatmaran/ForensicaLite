import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import AppShell, { RailSection } from '../components/shell/AppShell';
import Overview from '../components/results/Overview';
import Findings from '../components/results/Findings';
import Timeline from '../components/results/Timeline';
import Records from '../components/results/Records';
import Stats from '../components/results/Stats';
import { useAppContext } from '../context/AppContext';
import { Mono, Notice } from '../components/ui/primitives';
import { formatFileSize, formatNumber } from '../utils/formatters';

/**
 * The report, navigated by section from the rail.
 *
 * Sections rather than one long scroll: the volume facts stay pinned in the
 * rail while you move between findings and records, so context never scrolls
 * out of reach.
 */

type SectionId = 'overview' | 'findings' | 'timeline' | 'records' | 'stats';

const ResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { cases, caseData, storageError, dismissStorageError } = useAppContext();
  const [section, setSection] = useState<SectionId>('overview');

  if (cases.length === 0) {
    return <Navigate to="/" replace />;
  }

  if (!caseData) {
    return <Navigate to="/" replace />;
  }

  const { volume, scan, statistics, findings, files, timeline } = caseData;

  const sections: RailSection[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'findings', label: 'Findings', count: findings.length },
    { id: 'timeline', label: 'Timeline', count: timeline.includedCount },
    { id: 'records', label: 'Records', count: files.includedCount },
    { id: 'stats', label: 'Statistics' },
  ];

  return (
    <AppShell
      sections={sections}
      activeSection={section}
      onSelectSection={(id) => setSection(id as SectionId)}
      railFooter={
        <dl className="space-y-2.5">
          <div>
            <dt className="field-label">Volume</dt>
            <dd className="mt-0.5 text-xs text-ink-100 light:text-ink-900">
              {volume.label ?? 'unlabelled'}
              {volume.driveLetter ? ` (${volume.driveLetter})` : ''}
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <dt className="field-label">Capacity</dt>
              <dd className="mt-0.5 font-mono text-2xs text-ink-300">
                {formatFileSize(volume.totalBytes)}
              </dd>
            </div>
            <div>
              <dt className="field-label">Cluster</dt>
              <dd className="mt-0.5 font-mono text-2xs text-ink-300">
                {formatNumber(volume.bytesPerCluster)} B
              </dd>
            </div>
            <div>
              <dt className="field-label">Slots</dt>
              <dd className="mt-0.5 font-mono text-2xs text-ink-300">
                {formatNumber(volume.mftRecordsTotal)}
              </dd>
            </div>
            <div>
              <dt className="field-label">Deleted</dt>
              <dd
                className={`mt-0.5 font-mono text-2xs ${
                  statistics.fileCounts.deleted > 0 ? 'text-sev-high' : 'text-ink-300'
                }`}
              >
                {formatNumber(statistics.fileCounts.deleted)}
              </dd>
            </div>
          </div>
        </dl>
      }
      topbar={
        <div className="flex min-w-0-fix items-baseline gap-3">
          <button
            onClick={() => navigate('/')}
            className="shrink-0 font-mono text-2xs text-ink-500 transition-colors hover:text-ink-200 light:hover:text-ink-900"
          >
            &larr; cases
          </button>
          <Mono className="truncate text-xs text-ink-50 light:text-ink-900">{scan.caseId}</Mono>
          <span className="shrink-0 text-2xs text-ink-500">
            {volume.label ?? 'unlabelled'}
            {volume.driveLetter ? ` · ${volume.driveLetter}` : ''}
          </span>
        </div>
      }
    >
      <div className="mx-auto max-w-6xl space-y-4">
        {storageError && (
          <Notice tone="warn" onDismiss={dismissStorageError}>
            {storageError}
          </Notice>
        )}

        {section === 'overview' && <Overview data={caseData} />}
        {section === 'findings' && <Findings findings={findings} />}
        {section === 'timeline' && (
          <Timeline timeline={timeline} histogram={statistics.histogram} />
        )}
        {section === 'records' && <Records files={files} />}
        {section === 'stats' && <Stats statistics={statistics} />}
      </div>
    </AppShell>
  );
};

export default ResultsPage;
