import React, { useState, useEffect, ReactNode } from 'react';
import { ThemeContext } from './hooks';

const STORAGE_KEY = 'forensica-theme';

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Dark is the default and the base stylesheet. Light mode is applied by adding
 * a `light` class to <html>, which the `light:` Tailwind variant hangs off —
 * see the custom variant in tailwind.config.js.
 */
const readStoredTheme = (): 'light' | 'dark' => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(readStoredTheme);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // A rejected write only costs the preference, not the session.
    }
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
};
