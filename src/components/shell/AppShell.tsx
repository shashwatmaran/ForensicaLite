import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/**
 * The application chrome: a fixed left rail and a thin top bar.
 *
 * Persistent chrome is what separates a tool from a website. The rail holds
 * navigation and the volume facts you need while reading any section, so case
 * context never scrolls away.
 */

export interface RailSection {
  id: string;
  label: string;
  count?: number;
}

const Brand: React.FC = () => (
  <Link to="/" className="group flex items-baseline gap-2 px-3.5 py-3">
    <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-ink-100 light:text-ink-900">
      Forensica
    </span>
    <span className="h-1 w-1 rounded-sm bg-accent-400 transition-colors group-hover:bg-accent-300" />
  </Link>
);

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const Icon = theme === 'dark' ? Sun : Moon;

  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      className="rounded p-1.5 text-ink-400 transition-colors hover:text-ink-100 light:text-ink-500 light:hover:text-ink-900"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
};

export const AppShell: React.FC<{
  /** Report sections, when a case is open. */
  sections?: RailSection[];
  activeSection?: string;
  onSelectSection?: (id: string) => void;
  /** Volume/case facts pinned to the bottom of the rail. */
  railFooter?: React.ReactNode;
  /** Case identifier and volume, shown in the top bar. */
  topbar?: React.ReactNode;
  children: React.ReactNode;
}> = ({ sections, activeSection, onSelectSection, railFooter, topbar, children }) => {
  const location = useLocation();

  return (
    <div className="flex h-full min-h-screen">
      <nav className="fixed inset-y-0 left-0 z-20 flex w-rail flex-col border-r border-ink-800 bg-ink-900 light:border-ink-100 light:bg-white">
        <Brand />

        <div className="mt-1 flex-1 overflow-y-auto px-2">
          {sections && sections.length > 0 && (
            <ul className="space-y-px">
              {sections.map((section) => {
                const active = section.id === activeSection;
                return (
                  <li key={section.id}>
                    <button
                      onClick={() => onSelectSection?.(section.id)}
                      aria-current={active ? 'true' : undefined}
                      className={clsx(
                        'group flex w-full items-center gap-2 rounded-sm py-1.5 pl-2 pr-2 text-left text-xs transition-colors',
                        active
                          ? 'bg-ink-800 text-ink-50 light:bg-ink-50 light:text-ink-900'
                          : 'text-ink-400 hover:bg-ink-850 hover:text-ink-200 light:text-ink-500 light:hover:bg-ink-25 light:hover:text-ink-900'
                      )}
                    >
                      <span
                        className={clsx(
                          'h-3 w-0.5 shrink-0 rounded-none transition-colors',
                          active ? 'bg-accent-400' : 'bg-transparent'
                        )}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{section.label}</span>
                      {section.count !== undefined && (
                        <span className="font-mono text-2xs text-ink-500">{section.count}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!sections?.length && (
            <ul className="space-y-px">
              {[
                { to: '/', label: 'Cases' },
                { to: '/about', label: 'Method' },
              ].map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={clsx(
                      'flex items-center gap-2 rounded-sm py-1.5 pl-2 pr-2 text-xs transition-colors',
                      location.pathname === item.to
                        ? 'bg-ink-800 text-ink-50 light:bg-ink-50 light:text-ink-900'
                        : 'text-ink-400 hover:bg-ink-850 hover:text-ink-200 light:text-ink-500 light:hover:bg-ink-25 light:hover:text-ink-900'
                    )}
                  >
                    <span
                      className={clsx(
                        'h-3 w-0.5 shrink-0',
                        location.pathname === item.to ? 'bg-accent-400' : 'bg-transparent'
                      )}
                      aria-hidden
                    />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {railFooter && (
          <div className="border-t border-ink-800 px-3.5 py-3 light:border-ink-100">
            {railFooter}
          </div>
        )}
      </nav>

      <div className="flex min-w-0-fix flex-1 flex-col pl-rail">
        <header className="sticky top-0 z-10 flex h-topbar shrink-0 items-center gap-4 border-b border-ink-800 bg-ink-950/85 px-5 backdrop-blur light:border-ink-100 light:bg-ink-25/85">
          <div className="min-w-0-fix flex-1">{topbar}</div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/about"
              className="rounded px-2 py-1 text-2xs text-ink-400 transition-colors hover:text-ink-100 light:text-ink-500 light:hover:text-ink-900"
            >
              Method
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0-fix flex-1 animate-fade-rise px-5 py-5">{children}</main>

        <footer className="shrink-0 border-t border-ink-800 px-5 py-3 light:border-ink-100">
          <p className="text-2xs text-ink-500">
            Analysis runs locally. Nothing is uploaded — this is a static site with no backend.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default AppShell;
