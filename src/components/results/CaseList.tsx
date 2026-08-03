import React from 'react';
import clsx from 'clsx';
import { CaseFile } from '../../types';
import { SEVERITY_ORDER, formatFileSize, formatNumber, formatUtc } from '../../utils/formatters';
import { Button, EmptyState, Mono, Panel, PanelHeader, severityBg } from '../ui/primitives';

/**
 * Open cases, as rows rather than cards.
 *
 * Cases are records to compare, not products to browse — a table lets you read
 * two scans of the same volume side by side, which is the actual use for
 * keeping more than one open.
 */

const CaseRow: React.FC<{
  caseFile: CaseFile;
  onOpen: () => void;
  onClose: () => void;
}> = ({ caseFile, onOpen, onClose }) => {
  const { scan, volume, statistics, findings } = caseFile;

  return (
    <tr className="group border-b border-ink-850 transition-colors last:border-0 hover:bg-ink-850 light:border-ink-50 light:hover:bg-ink-25">
      <td className="py-2.5 pl-4 pr-3">
        <button onClick={onOpen} className="text-left">
          <Mono className="text-xs text-ink-50 light:text-ink-900">{scan.caseId}</Mono>
          <span className="mt-0.5 block text-2xs text-ink-500">
            {formatUtc(scan.completedAt)}
          </span>
        </button>
      </td>

      <td className="py-2.5 pr-3">
        <span className="text-xs text-ink-200 light:text-ink-800">
          {volume.label ?? 'unlabelled'}
        </span>
        <span className="mt-0.5 block font-mono text-2xs text-ink-500">
          {volume.driveLetter ?? 'image'} &middot; {formatFileSize(volume.totalBytes)} &middot;{' '}
          {formatNumber(volume.bytesPerCluster)} B/clus
        </span>
      </td>

      <td className="py-2.5 pr-3 text-right font-mono text-xs text-ink-300 light:text-ink-600">
        {formatNumber(statistics.fileCounts.total)}
      </td>

      <td className="py-2.5 pr-3 text-right font-mono text-xs">
        <span
          className={
            statistics.fileCounts.deleted > 0
              ? 'text-sev-high'
              : 'text-ink-400 light:text-ink-500'
          }
        >
          {formatNumber(statistics.fileCounts.deleted)}
        </span>
      </td>

      <td className="py-2.5 pr-3">
        <div className="flex items-center justify-end gap-2.5">
          {findings.length === 0 ? (
            <span className="text-2xs text-ink-500">none</span>
          ) : (
            SEVERITY_ORDER.map((severity) => {
              const count = statistics.findingsBySeverity[severity] ?? 0;
              if (count === 0) return null;
              return (
                <span key={severity} className="inline-flex items-center gap-1" title={severity}>
                  <span className={clsx('h-2.5 w-0.5', severityBg(severity))} aria-hidden />
                  <span className="font-mono text-2xs text-ink-300">{count}</span>
                </span>
              );
            })
          )}
        </div>
      </td>

      <td className="py-2.5 pr-4">
        <div className="flex items-center justify-end gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button onClick={onOpen}>Open</Button>
          <Button onClick={onClose} className="text-ink-500 hover:text-sev-critical">
            Close
          </Button>
        </div>
      </td>
    </tr>
  );
};

const CaseList: React.FC<{
  cases: CaseFile[];
  onSelectCase: (caseId: string) => void;
  onRemoveCase: (caseId: string) => void;
}> = ({ cases, onSelectCase, onRemoveCase }) => {
  if (cases.length === 0) {
    return (
      <Panel>
        <PanelHeader title="Cases" meta="0" />
        <EmptyState
          title="No cases open."
          detail="Open a case file produced by the analyzer, or load the bundled sample to explore the report without running a scan."
        />
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader title="Cases" meta={formatNumber(cases.length)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left">
          <thead className="border-b border-ink-800 light:border-ink-100">
            <tr className="text-2xs uppercase tracking-wide text-ink-500">
              <th className="py-2 pl-4 pr-3 font-normal">Case</th>
              <th className="py-2 pr-3 font-normal">Volume</th>
              <th className="py-2 pr-3 text-right font-normal">Records</th>
              <th className="py-2 pr-3 text-right font-normal">Deleted</th>
              <th className="py-2 pr-3 text-right font-normal">Findings</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {cases.map((caseFile) => (
              <CaseRow
                key={caseFile.scan.caseId}
                caseFile={caseFile}
                onOpen={() => onSelectCase(caseFile.scan.caseId)}
                onClose={() => onRemoveCase(caseFile.scan.caseId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

export default CaseList;
