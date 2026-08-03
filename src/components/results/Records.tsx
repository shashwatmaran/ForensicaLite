import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Collection, MftFile, NtfsTimestamp, NtfsTimestamps } from '../../types';
import {
  formatFileSize,
  formatNumber,
  formatRecoveryConfidence,
  formatUtc,
} from '../../utils/formatters';
import {
  EmptyState,
  Mono,
  Notice,
  Panel,
  PanelHeader,
  PathText,
  Segmented,
  SegmentedOption,
  Tag,
} from '../ui/primitives';

/**
 * The MFT record browser.
 *
 * A dense grid, because the job is scanning hundreds of rows for the one that
 * matters. Each row expands into the record's full detail — most importantly
 * the $SI/$FN timestamp comparison, which is where timestomping becomes
 * visible.
 */

type SortField = 'recordNumber' | 'fileName' | 'size' | 'modified' | 'status';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 25;

const alternateStreams = (file: MftFile) => file.streams.filter((s) => s.name !== '');
const defaultStream = (file: MftFile) => file.streams.find((s) => s.name === '');

/**
 * True when a $SI timestamp is earlier than its $FN counterpart.
 *
 * $FN is written only by the kernel on create, rename and move, so $SI
 * preceding it cannot arise from normal activity — it means $SI was written
 * backwards. Compared as BigInt because FILETIME values exceed the exact
 * integer range of a double, and Number() would quietly lose precision.
 */
const isBackdated = (si: NtfsTimestamp, fn: NtfsTimestamp | undefined): boolean => {
  if (!fn) return false;
  try {
    return BigInt(si.filetime) < BigInt(fn.filetime);
  } catch {
    return false;
  }
};

const MACB_ROWS: { key: keyof NtfsTimestamps; label: string; macb: string }[] = [
  { key: 'created', label: 'Created', macb: 'B' },
  { key: 'modified', label: 'Modified', macb: 'M' },
  { key: 'mftModified', label: 'MFT modified', macb: 'C' },
  { key: 'accessed', label: 'Accessed', macb: 'A' },
];

const decodeResident = (base64: string): string | null => {
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
};

const RecordDetail: React.FC<{ file: MftFile }> = ({ file }) => {
  const ads = alternateStreams(file);
  const recovered = file.recovery?.residentContentBase64
    ? decodeResident(file.recovery.residentContentBase64)
    : null;

  return (
    <div className="border-t border-ink-800 bg-ink-950/40 light:border-ink-100 light:bg-ink-25">
      <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr] lg:divide-x lg:divide-ink-800 lg:light:divide-ink-100">
        <div className="px-4 py-3">
          <p className="eyebrow mb-2">
            Timestamps &mdash; $STANDARD_INFORMATION vs $FILE_NAME
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left">
              <thead>
                <tr className="text-2xs text-ink-500">
                  <th className="w-32 pb-1.5 pr-3 font-normal">MACB</th>
                  <th className="pb-1.5 pr-3 font-normal">$SI · user-writable</th>
                  <th className="pb-1.5 font-normal">$FN · kernel-only</th>
                </tr>
              </thead>
              <tbody>
                {MACB_ROWS.map(({ key, label, macb }) => {
                  const si = file.standardInfo[key];
                  const fn = file.fileNameInfo?.[key];
                  const backdated = isBackdated(si, fn);

                  return (
                    <tr key={key} className="border-t border-ink-850 light:border-ink-50">
                      <th
                        scope="row"
                        className="whitespace-nowrap py-1.5 pr-3 text-xs font-normal text-ink-300 light:text-ink-600"
                      >
                        <Mono className="mr-2 text-ink-600">{macb}</Mono>
                        {label}
                      </th>
                      <td className="py-1.5 pr-3">
                        <Mono
                          className={clsx(
                            'text-xs',
                            backdated
                              ? 'text-sev-critical'
                              : 'text-ink-100 light:text-ink-900'
                          )}
                        >
                          {formatUtc(si.iso)}
                        </Mono>
                        {backdated && (
                          <span className="ml-2 text-micro font-semibold uppercase text-sev-critical">
                            precedes $FN
                          </span>
                        )}
                      </td>
                      <td className="py-1.5">
                        <Mono className="text-xs text-ink-400 light:text-ink-500">
                          {fn ? formatUtc(fn.iso) : '—'}
                        </Mono>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!file.fileNameInfo && (
            <p className="mt-2 text-2xs text-ink-500">
              No $FILE_NAME timestamps on this record, so no cross-check is possible.
            </p>
          )}
        </div>

        <div className="space-y-4 px-4 py-3">
          <div>
            <p className="eyebrow mb-2">Record</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                ['MFT record', `#${file.recordNumber}`],
                ['Sequence', String(file.sequenceNumber)],
                ['Parent', file.parentRecordNumber !== null ? `#${file.parentRecordNumber}` : '—'],
                ['Allocated', formatNumber(file.allocatedSize)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="field-label">{label}</dt>
                  <dd className="mt-0.5 font-mono text-xs text-ink-100 light:text-ink-900">
                    {value}
                  </dd>
                </div>
              ))}
              <div className="col-span-2">
                <dt className="field-label">Attributes</dt>
                <dd className="mt-0.5 font-mono text-xs text-ink-100 light:text-ink-900">
                  {file.attributes.length > 0 ? file.attributes.join(' · ') : '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="eyebrow mb-2">Streams · {file.streams.length}</p>
            <ul className="space-y-1.5">
              {file.streams.map((stream, index) => (
                <li key={index}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Mono className="text-xs text-ink-100 light:text-ink-900">
                      {stream.name === '' ? '$DATA' : `:${stream.name}`}
                    </Mono>
                    {stream.name !== '' && (
                      <span className="text-micro font-semibold uppercase text-sev-high">ads</span>
                    )}
                    <span className="text-2xs text-ink-500">
                      {formatFileSize(stream.size)} · {stream.residency}
                    </span>
                  </div>
                  {stream.hash && (
                    <p className="mt-0.5 break-all font-mono text-micro text-ink-600">
                      {stream.hash.value}
                      <span className="ml-1.5 text-ink-500">({stream.hash.scope})</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {file.recovery && (
            <div>
              <p className="eyebrow mb-2">Recovery</p>
              <p className="text-xs text-ink-100 light:text-ink-900">
                {formatRecoveryConfidence(file.recovery.confidence)}
              </p>
              <p className="mt-1 text-2xs leading-relaxed text-ink-400 light:text-ink-500">
                {file.recovery.reason}
              </p>
              {file.recovery.dataRuns.length > 0 && (
                <p className="mt-1.5 font-mono text-micro text-ink-500">
                  runs:{' '}
                  {file.recovery.dataRuns
                    .map((run) => `${run.startCluster}+${run.clusterCount}`)
                    .join('  ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {recovered !== null && (
        <div className="border-t border-ink-800 px-4 py-3 light:border-ink-100">
          <p className="eyebrow mb-2">
            Recovered content &mdash; {ads.length > 0 ? 'resident stream' : 'from MFT record'}
          </p>
          <pre className="max-h-52 overflow-auto rounded border border-ink-800 bg-ink-950 p-3 font-mono text-xs leading-relaxed text-accent-300 light:border-ink-100 light:bg-ink-25 light:text-accent-800">
            {recovered}
          </pre>
        </div>
      )}
    </div>
  );
};

const HeaderCell: React.FC<{
  field: SortField;
  sortField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
  children: React.ReactNode;
}> = ({ field, sortField, direction, onSort, className, children }) => (
  <th className={clsx('pb-2 pt-2 font-normal', className)}>
    <button
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-1 text-2xs uppercase tracking-wide text-ink-500 transition-colors hover:text-ink-200 light:hover:text-ink-900"
    >
      {children}
      <span className="font-mono text-micro">
        {sortField === field ? (direction === 'asc' ? '▲' : '▼') : ''}
      </span>
    </button>
  </th>
);

const Records: React.FC<{ files: Collection<MftFile> }> = ({ files }) => {
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('recordNumber');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'all' | 'active' | 'deleted'>('all');
  const [onlyAds, setOnlyAds] = useState(false);
  const [onlyFindings, setOnlyFindings] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matched = files.entries.filter((file) => {
      const matchesQuery =
        needle === '' ||
        file.fileName.toLowerCase().includes(needle) ||
        (file.filePath ?? '').toLowerCase().includes(needle);
      const matchesStatus = status === 'all' || file.status === status;
      const matchesAds = !onlyAds || alternateStreams(file).length > 0;
      const matchesFindings = !onlyFindings || file.findingIds.length > 0;
      return matchesQuery && matchesStatus && matchesAds && matchesFindings;
    });

    const value = (file: MftFile): string | number => {
      switch (sortField) {
        case 'recordNumber':
          return file.recordNumber;
        case 'fileName':
          return file.fileName.toLowerCase();
        case 'size':
          return file.size;
        case 'modified':
          return file.standardInfo.modified.iso;
        case 'status':
          return file.status;
      }
    };

    return [...matched].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av === bv) return a.recordNumber - b.recordNumber;
      const ascending = av > bv ? 1 : -1;
      return direction === 'asc' ? ascending : -ascending;
    });
  }, [files.entries, query, status, onlyAds, onlyFindings, sortField, direction]);

  useEffect(() => {
    setPage(1);
    setExpanded(null);
  }, [query, status, onlyAds, onlyFindings]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setDirection('asc');
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="MFT records"
        meta={
          files.truncated
            ? `${formatNumber(files.includedCount)} of ${formatNumber(files.totalCount)}`
            : formatNumber(files.includedCount)
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-2.5 light:border-ink-100">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="filter by name or path"
          className="w-56 rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-xs text-ink-100 placeholder:text-ink-600 focus:border-accent-600 focus:outline-none light:border-ink-200 light:bg-white light:text-ink-900 light:placeholder:text-ink-300"
        />

        <Segmented>
          {(['all', 'active', 'deleted'] as const).map((option) => (
            <SegmentedOption
              key={option}
              active={status === option}
              onClick={() => setStatus(option)}
            >
              {option}
            </SegmentedOption>
          ))}
        </Segmented>

        <Segmented>
          <SegmentedOption active={onlyAds} onClick={() => setOnlyAds((prev) => !prev)}>
            hidden streams
          </SegmentedOption>
          <SegmentedOption active={onlyFindings} onClick={() => setOnlyFindings((prev) => !prev)}>
            has findings
          </SegmentedOption>
        </Segmented>

        <span className="ml-auto font-mono text-2xs text-ink-500">
          {formatNumber(filtered.length)} match{filtered.length === 1 ? '' : 'es'}
        </span>
      </div>

      {files.truncated && (
        <div className="border-b border-ink-800 px-4 py-2.5 light:border-ink-100">
          <Notice>{files.inclusionPolicy}</Notice>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No records match the current filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="border-b border-ink-800 light:border-ink-100">
              <tr>
                <th className="w-6" />
                <HeaderCell
                  field="recordNumber"
                  sortField={sortField}
                  direction={direction}
                  onSort={handleSort}
                  className="w-16 pr-3"
                >
                  MFT
                </HeaderCell>
                <HeaderCell
                  field="fileName"
                  sortField={sortField}
                  direction={direction}
                  onSort={handleSort}
                  className="pr-3"
                >
                  Name
                </HeaderCell>
                <HeaderCell
                  field="size"
                  sortField={sortField}
                  direction={direction}
                  onSort={handleSort}
                  className="w-24 pr-3"
                >
                  Size
                </HeaderCell>
                <HeaderCell
                  field="modified"
                  sortField={sortField}
                  direction={direction}
                  onSort={handleSort}
                  className="w-52 pr-3"
                >
                  $SI modified
                </HeaderCell>
                <HeaderCell
                  field="status"
                  sortField={sortField}
                  direction={direction}
                  onSort={handleSort}
                  className="w-20 pr-4"
                >
                  Status
                </HeaderCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((file) => {
                const ads = alternateStreams(file);
                const stream = defaultStream(file);
                const open = expanded === file.recordNumber;

                return (
                  <React.Fragment key={file.recordNumber}>
                    <tr
                      onClick={() => setExpanded(open ? null : file.recordNumber)}
                      className={clsx(
                        'cursor-pointer border-b border-ink-850 transition-colors light:border-ink-50',
                        open
                          ? 'bg-ink-850 light:bg-ink-25'
                          : 'hover:bg-ink-850 light:hover:bg-ink-25'
                      )}
                    >
                      <td className="pl-3 font-mono text-2xs text-ink-600">{open ? '−' : '+'}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-ink-500">
                        {file.recordNumber}
                      </td>
                      <td className="min-w-0-fix py-2 pr-3">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={clsx(
                              'truncate text-xs',
                              file.isDirectory
                                ? 'text-accent-300 light:text-accent-700'
                                : 'text-ink-50 light:text-ink-900'
                            )}
                          >
                            {file.fileName}
                          </span>
                          {file.isDirectory && <Tag>dir</Tag>}
                          {ads.length > 0 && (
                            <span
                              title={`${ads.length} alternate data stream(s)`}
                              className="font-mono text-micro font-semibold uppercase text-sev-high"
                            >
                              ads{ads.length > 1 ? `·${ads.length}` : ''}
                            </span>
                          )}
                          {file.findingIds.length > 0 && (
                            <span
                              title={`${file.findingIds.length} finding(s)`}
                              className="font-mono text-micro text-sev-critical"
                            >
                              !{file.findingIds.length}
                            </span>
                          )}
                        </div>
                        <PathText path={file.filePath} className="mt-0.5 text-micro" />
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-ink-300 light:text-ink-600">
                        {formatFileSize(file.size)}
                        {stream?.residency === 'resident' && (
                          <span
                            title="Stored inside the MFT record — survives deletion intact"
                            className="ml-1.5 text-micro uppercase text-accent-400"
                          >
                            res
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-ink-400 light:text-ink-500">
                        {formatUtc(file.standardInfo.modified.iso)}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={clsx(
                            'text-2xs',
                            file.status === 'deleted'
                              ? 'text-sev-high'
                              : 'text-ink-400 light:text-ink-500'
                          )}
                        >
                          {file.status}
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <RecordDetail file={file} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-ink-800 px-4 py-2.5 light:border-ink-100">
          <span className="font-mono text-2xs text-ink-500">
            page {currentPage} / {totalPages}
          </span>
          <Segmented>
            <SegmentedOption
              active={false}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              prev
            </SegmentedOption>
            <SegmentedOption
              active={false}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              next
            </SegmentedOption>
          </Segmented>
        </div>
      )}
    </Panel>
  );
};

export default Records;
