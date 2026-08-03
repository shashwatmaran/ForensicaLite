/**
 * The interface vocabulary.
 *
 * Every surface, label and severity marker in the report comes from here, so
 * density and colour stay consistent instead of drifting per component. Colour
 * is reserved for severity — a coloured pixel anywhere else would dilute it.
 */

import React from 'react';
import clsx from 'clsx';
import { Severity } from '../../types';

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export const Panel: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => <section className={clsx('panel', className)}>{children}</section>;

export const PanelHeader: React.FC<{
  title: string;
  /** Right-aligned counter or status, kept quiet. */
  meta?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, meta, children }) => (
  <header className="panel-header">
    <h2 className="eyebrow">{title}</h2>
    {meta !== undefined && (
      <span className="mono text-ink-400 light:text-ink-500">{meta}</span>
    )}
    {children}
  </header>
);

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Forensic identifiers: paths, hashes, record numbers, timestamps. */
export const Mono: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ children, className, title }) => (
  <span title={title} className={clsx('font-mono', className)}>
    {children}
  </span>
);

/** A path that truncates from the left, keeping the filename visible. */
export const PathText: React.FC<{ path: string | null; className?: string }> = ({
  path,
  className,
}) => (
  <span
    dir="rtl"
    title={path ?? undefined}
    className={clsx(
      'block truncate text-left font-mono',
      path ? 'text-ink-300 light:text-ink-500' : 'italic text-ink-500',
      className
    )}
  >
    {path ? <bdi>{path}</bdi> : 'path unresolvable'}
  </span>
);

export const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}> = ({ label, children, mono = false }) => (
  <div className="min-w-0-fix">
    <dt className="field-label">{label}</dt>
    <dd
      className={clsx(
        'mt-0.5 truncate text-xs text-ink-100 light:text-ink-900',
        mono && 'font-mono'
      )}
    >
      {children}
    </dd>
  </div>
);

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

const SEV_TEXT: Record<Severity, string> = {
  critical: 'text-sev-critical',
  high: 'text-sev-high',
  medium: 'text-sev-medium',
  low: 'text-sev-low',
  info: 'text-sev-info',
};

const SEV_BG: Record<Severity, string> = {
  critical: 'bg-sev-critical',
  high: 'bg-sev-high',
  medium: 'bg-sev-medium',
  low: 'bg-sev-low',
  info: 'bg-sev-info',
};

export const severityText = (severity: Severity) => SEV_TEXT[severity] ?? SEV_TEXT.info;
export const severityBg = (severity: Severity) => SEV_BG[severity] ?? SEV_BG.info;

/**
 * The severity marker: a 2px vertical bar plus an abbreviated label.
 *
 * Deliberately not a filled pill. Pills of five different colours turn a
 * findings list into confetti; a bar reads as a margin annotation and lets the
 * finding title stay the loudest thing in the row.
 */
export const SeverityMark: React.FC<{ severity: Severity }> = ({ severity }) => (
  <span className="inline-flex items-center gap-2">
    <span className={clsx('h-3.5 w-0.5 rounded-none', severityBg(severity))} aria-hidden />
    <span
      className={clsx(
        'text-micro font-semibold uppercase tabular-nums',
        severityText(severity)
      )}
    >
      {severity}
    </span>
  </span>
);

/** Neutral count/label chip. No colour, so it never competes with severity. */
export const Tag: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ children, className, title }) => (
  <span
    title={title}
    className={clsx(
      'inline-flex items-center gap-1 rounded-sm border border-ink-700 px-1.5 py-0.5 text-micro font-medium uppercase text-ink-300',
      'light:border-ink-200 light:text-ink-500',
      className
    )}
  >
    {children}
  </span>
);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}> = ({ children, onClick, variant = 'ghost', disabled, className, type = 'button' }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={clsx(
      'inline-flex items-center justify-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
      variant === 'primary' &&
        'bg-accent-600 text-white hover:bg-accent-500 light:bg-accent-700 light:hover:bg-accent-600',
      variant === 'ghost' &&
        'border border-ink-700 text-ink-200 hover:border-ink-600 hover:text-ink-50 light:border-ink-200 light:text-ink-700 light:hover:border-ink-300 light:hover:text-ink-900',
      className
    )}
  >
    {children}
  </button>
);

/** Segmented filter control. Selection is a surface change, not a colour wash. */
export const SegmentedOption: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={clsx(
      'rounded-sm px-2 py-1 text-2xs font-medium transition-colors',
      active
        ? 'bg-ink-750 text-ink-50 light:bg-ink-100 light:text-ink-900'
        : 'text-ink-400 hover:text-ink-200 light:text-ink-500 light:hover:text-ink-800'
    )}
  >
    {children}
  </button>
);

export const Segmented: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div
    className={clsx(
      'inline-flex gap-0.5 rounded border border-ink-800 bg-ink-850 p-0.5',
      'light:border-ink-100 light:bg-ink-25',
      className
    )}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Empty / notice states
// ---------------------------------------------------------------------------

export const EmptyState: React.FC<{
  title: string;
  detail?: string;
  children?: React.ReactNode;
}> = ({ title, detail, children }) => (
  <div className="px-4 py-12 text-center">
    <p className="text-sm text-ink-200 light:text-ink-800">{title}</p>
    {detail && (
      <p className="mx-auto mt-1.5 max-w-md text-xs text-ink-400 light:text-ink-500">{detail}</p>
    )}
    {children && <div className="mt-5">{children}</div>}
  </div>
);

/** Inline advisory. Border-led rather than a filled banner. */
export const Notice: React.FC<{
  tone?: 'neutral' | 'warn';
  children: React.ReactNode;
  onDismiss?: () => void;
}> = ({ tone = 'neutral', children, onDismiss }) => (
  <div
    className={clsx(
      'flex items-start gap-3 rounded border-l-2 py-2.5 pl-3 pr-3 text-xs',
      tone === 'warn'
        ? 'border-l-sev-high bg-sev-high/5 text-ink-200 light:text-ink-800'
        : 'border-l-ink-600 bg-ink-900 text-ink-300 light:border-l-ink-300 light:bg-ink-25 light:text-ink-600'
    )}
  >
    <div className="min-w-0-fix flex-1">{children}</div>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="shrink-0 text-ink-500 transition-colors hover:text-ink-200"
        aria-label="Dismiss"
      >
        &times;
      </button>
    )}
  </div>
);
