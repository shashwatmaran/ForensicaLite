/**
 * UI-side types. Deliberately separate from case.ts: that file is a versioned
 * wire contract shared with the analyzer, this one is free to change whenever
 * the interface does.
 */

import { CaseFile } from './case';

export interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export interface AppContextType {
  /** The case currently open in the report view. */
  caseData: CaseFile | null;
  currentCaseId: string | null;
  cases: CaseFile[];
  addCase: (caseFile: CaseFile) => void;
  removeCase: (caseId: string) => void;
  selectCase: (caseId: string) => void;
  /**
   * Set when the last attempt to persist cases failed — almost always the
   * localStorage quota being exceeded by a large case file. Surfaced in the UI
   * rather than swallowed, so a case that did not save says so.
   */
  storageError: string | null;
  dismissStorageError: () => void;
}
