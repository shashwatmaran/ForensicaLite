import { RecoveryConfidence, Severity } from '../types';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 bytes';

  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const formatNumber = (num: number): string => new Intl.NumberFormat().format(num);

/**
 * Timestamps are rendered in UTC, always, with the zone stated explicitly.
 * Local-time rendering is a genuine hazard in forensic work: a reader in a
 * different zone than the examiner will silently draw wrong conclusions about
 * event ordering across a case.
 */
export const formatUtc = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'invalid timestamp';

  const pad = (n: number, width = 2) => String(n).padStart(width, '0');

  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}` +
    `.${pad(date.getUTCMilliseconds(), 3)} UTC`
  );
};

/** Date only, UTC — for grouping and axis labels. */
export const formatUtcDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'invalid date';
  return date.toISOString().slice(0, 10);
};

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
};

/** Most severe first — the order findings should always be presented in. */
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

interface SeverityStyle {
  /** Text colour for icons and headings. */
  text: string;
  /** Pill/badge background. */
  badge: string;
  /** Card background plus left accent border. */
  card: string;
}

const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  critical: {
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-600 text-white',
    card: 'bg-red-50 dark:bg-red-950/20 border-l-red-600',
  },
  high: {
    text: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-500 text-white',
    card: 'bg-orange-50 dark:bg-orange-950/20 border-l-orange-500',
  },
  medium: {
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500 text-white',
    card: 'bg-amber-50 dark:bg-amber-950/20 border-l-amber-500',
  },
  low: {
    text: 'text-sky-600 dark:text-sky-400',
    badge: 'bg-sky-500 text-white',
    card: 'bg-sky-50 dark:bg-sky-950/20 border-l-sky-500',
  },
  info: {
    text: 'text-slate-600 dark:text-slate-400',
    badge: 'bg-slate-500 text-white',
    card: 'bg-slate-50 dark:bg-slate-800/40 border-l-slate-500',
  },
};

export const getSeverityStyle = (severity: Severity): SeverityStyle =>
  SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info;

const RECOVERY_LABELS: Record<RecoveryConfidence, string> = {
  full: 'Fully recoverable',
  partial: 'Partially recoverable',
  'metadata-only': 'Metadata only',
};

export const formatRecoveryConfidence = (confidence: RecoveryConfidence): string =>
  RECOVERY_LABELS[confidence] ?? confidence;

const RECOVERY_STYLES: Record<RecoveryConfidence, string> = {
  full: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/30',
  partial: 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/30',
  'metadata-only': 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
};

export const getRecoveryStyle = (confidence: RecoveryConfidence): string =>
  RECOVERY_STYLES[confidence] ?? RECOVERY_STYLES['metadata-only'];

/** "timestomp" -> "Timestomp", "alternate-data-stream" -> "Alternate data stream" */
export const humanizeSlug = (slug: string): string => {
  const spaced = slug.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
