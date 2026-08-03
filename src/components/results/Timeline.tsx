import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import clsx from 'clsx';
import { Collection, HistogramBucket, TimelineEntry, TimelineSource } from '../../types';
import { formatUtc, humanizeSlug } from '../../utils/formatters';
import { useTheme } from '../../context/ThemeContext';
import {
  EmptyState,
  Mono,
  Notice,
  Panel,
  PanelHeader,
  PathText,
  Segmented,
  SegmentedOption,
} from '../ui/primitives';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

/**
 * Volume activity over time, and the super-timeline beneath it.
 *
 * Every row states which artifact it came from. That provenance is the whole
 * point: $SI is writable from user mode, while $FN and the USN journal are
 * kernel-maintained, so two rows with the same timestamp can carry very
 * different evidential weight.
 */

const SOURCE_LABEL: Record<TimelineSource, string> = {
  'mft-si': '$SI',
  'mft-fn': '$FN',
  'usn-journal': 'USN',
};

const SOURCE_TITLE: Record<TimelineSource, string> = {
  'mft-si': '$STANDARD_INFORMATION — writable from user mode',
  'mft-fn': '$FILE_NAME — written by the kernel on create, rename and move',
  'usn-journal': 'USN journal — kernel change record',
};

/** Stacked bars, one series per MACB action. */
const SERIES: { key: keyof HistogramBucket; label: string; dark: string; light: string }[] = [
  { key: 'created', label: 'Created', dark: '#35c08a', light: '#14724a' },
  { key: 'modified', label: 'Modified', dark: '#dcbb45', light: '#a37f11' },
  { key: 'accessed', label: 'Accessed', dark: '#5aa9e6', light: '#2b6ea8' },
  { key: 'deleted', label: 'Deleted', dark: '#f2555a', light: '#c22f34' },
];

const Timeline: React.FC<{
  timeline: Collection<TimelineEntry>;
  histogram: HistogramBucket[];
}> = ({ timeline, histogram }) => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [sourceFilter, setSourceFilter] = useState<TimelineSource | 'all'>('all');

  const grid = dark ? '#1b1f26' : '#e8ebef';
  const tick = dark ? '#6b737f' : '#8f97a3';

  const chartData = useMemo(
    () => ({
      labels: histogram.map((bucket) => bucket.date),
      datasets: SERIES.map((series) => ({
        label: series.label,
        data: histogram.map((bucket) => bucket[series.key] as number),
        backgroundColor: dark ? series.dark : series.light,
        borderWidth: 0,
        borderRadius: 0,
        barPercentage: 0.9,
        categoryPercentage: 0.88,
      })),
    }),
    [histogram, dark]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'top' as const,
          align: 'end' as const,
          labels: {
            color: tick,
            boxWidth: 8,
            boxHeight: 8,
            font: { size: 10 },
            padding: 14,
            usePointStyle: false,
          },
        },
        tooltip: {
          backgroundColor: dark ? '#15181d' : '#ffffff',
          borderColor: dark ? '#262b33' : '#dde1e7',
          borderWidth: 1,
          titleColor: dark ? '#dde1e7' : '#101216',
          bodyColor: dark ? '#b7bec8' : '#363c46',
          titleFont: { size: 11 },
          bodyFont: { size: 11, family: 'ui-monospace, monospace' },
          cornerRadius: 3,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 8,
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: tick, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 16 },
          grid: { display: false },
          border: { color: grid },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: tick, font: { size: 10 }, precision: 0, maxTicksLimit: 6 },
          grid: { color: grid },
          border: { display: false },
        },
      },
    }),
    [tick, grid, dark]
  );

  const entries = useMemo(() => {
    const filtered =
      sourceFilter === 'all'
        ? timeline.entries
        : timeline.entries.filter((entry) => entry.source === sourceFilter);
    return [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [timeline.entries, sourceFilter]);

  const sources: (TimelineSource | 'all')[] = ['all', 'mft-si', 'mft-fn', 'usn-journal'];
  const present = new Set(timeline.entries.map((entry) => entry.source));

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Activity"
          meta={`${histogram.length} day${histogram.length === 1 ? '' : 's'}`}
        />
        <div className="h-64 px-3 py-3">
          {histogram.length > 0 ? (
            <Bar data={chartData} options={options} />
          ) : (
            <EmptyState title="No histogram data in this case file." />
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Super-timeline"
          meta={
            timeline.truncated
              ? `${entries.length} shown · ${timeline.totalCount.toLocaleString()} total`
              : `${entries.length}`
          }
        />

        <div className="flex flex-wrap items-center gap-3 border-b border-ink-800 px-4 py-2.5 light:border-ink-100">
          <Segmented>
            {sources.map((source) => (
              <SegmentedOption
                key={source}
                active={sourceFilter === source}
                onClick={() => setSourceFilter(source)}
              >
                {source === 'all' ? 'All sources' : SOURCE_LABEL[source]}
              </SegmentedOption>
            ))}
          </Segmented>
          {!present.has('usn-journal') && (
            <span className="text-2xs text-ink-500">
              USN journal reconstruction is not implemented yet
            </span>
          )}
        </div>

        {timeline.truncated && (
          <div className="border-b border-ink-800 px-4 py-2.5 light:border-ink-100">
            <Notice>{timeline.inclusionPolicy}</Notice>
          </div>
        )}

        <div className="max-h-[28rem] overflow-y-auto">
          {entries.length === 0 ? (
            <EmptyState title="No entries for this source." />
          ) : (
            <ol>
              {entries.map((entry, index) => (
                <li
                  key={`${entry.recordNumber}-${entry.source}-${entry.action}-${index}`}
                  className="flex items-baseline gap-3 border-b border-ink-850 px-4 py-1.5 last:border-0 hover:bg-ink-850 light:border-ink-50 light:hover:bg-ink-25"
                >
                  <Mono className="shrink-0 text-2xs text-ink-400 light:text-ink-500">
                    {formatUtc(entry.timestamp)}
                  </Mono>
                  <Mono
                    title={SOURCE_TITLE[entry.source]}
                    className={clsx(
                      'w-9 shrink-0 text-2xs',
                      entry.source === 'mft-si' ? 'text-ink-300' : 'text-accent-400'
                    )}
                  >
                    {SOURCE_LABEL[entry.source]}
                  </Mono>
                  <span className="w-24 shrink-0 text-2xs text-ink-200 light:text-ink-800">
                    {humanizeSlug(entry.action)}
                  </span>
                  <span className="min-w-0-fix flex-1">
                    <PathText path={entry.filePath} className="text-2xs" />
                  </span>
                  {entry.recordNumber !== null && (
                    <Mono className="shrink-0 text-2xs text-ink-600">#{entry.recordNumber}</Mono>
                  )}
                  {entry.findingIds.length > 0 && (
                    <span
                      className="shrink-0 font-mono text-2xs text-sev-high"
                      title={`${entry.findingIds.length} finding(s) reference this record`}
                    >
                      !{entry.findingIds.length}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </Panel>
    </div>
  );
};

export default Timeline;
