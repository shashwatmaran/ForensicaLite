/**
 * Context objects and their hooks. Kept apart from the provider components so
 * those files export only components, which is what React fast refresh needs
 * to hot-swap them without a full reload.
 */

import { createContext, useContext } from 'react';
import { AppContextType, ThemeContextType } from '../types';

export const AppContext = createContext<AppContextType | undefined>(undefined);
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
