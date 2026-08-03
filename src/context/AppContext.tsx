import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AppContextType, CaseFile, SCHEMA_VERSION } from '../types';

/** Key is schema-versioned: a schema bump must not resurrect incompatible cases. */
const STORAGE_KEY = `forensica-cases-v${SCHEMA_VERSION}`;

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

/** Drop anything that is not a case file of the schema version we understand. */
const hydrate = (): CaseFile[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is CaseFile =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as CaseFile).schemaVersion === SCHEMA_VERSION &&
        typeof (entry as CaseFile).scan?.caseId === 'string'
    );
  } catch {
    return [];
  }
};

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [caseData, setCaseData] = useState<CaseFile | null>(null);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseFile[]>(hydrate);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Persist on change. A failure here is reported rather than swallowed: a
  // large case file can exceed the localStorage quota, and a case that
  // silently failed to save would reappear as missing after a refresh.
  useEffect(() => {
    if (cases.length === 0) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        setStorageError(null);
      } catch {
        // Nothing useful to report when clearing fails.
      }
      return;
    }

    try {
      const serialized = JSON.stringify(cases);
      localStorage.setItem(STORAGE_KEY, serialized);
      setStorageError(null);
    } catch (error) {
      const approxMb = (JSON.stringify(cases).length / (1024 * 1024)).toFixed(1);
      setStorageError(
        `Could not save ${cases.length} case${cases.length === 1 ? '' : 's'} to browser storage ` +
          `(~${approxMb} MB, over this browser's limit). The case is still open now, but it will ` +
          `be gone if you reload. Re-run the analyzer against a smaller volume, or without --full, ` +
          `to produce a smaller case file.` +
          (error instanceof Error ? ` [${error.name}]` : '')
      );
    }
  }, [cases]);

  const addCase = useCallback((newCase: CaseFile) => {
    setCases((prev) => {
      const existingIndex = prev.findIndex((c) => c.scan.caseId === newCase.scan.caseId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newCase;
        return updated;
      }
      return [...prev, newCase];
    });

    // Opening a case file also makes it the current case. Callers cannot do
    // this via selectCase, because that reads `cases` — which has not been
    // committed yet in the same tick, leaving caseData null and bouncing the
    // report route straight back to the workspace.
    setCurrentCaseId(newCase.scan.caseId);
    setCaseData(newCase);
  }, []);

  const removeCase = useCallback(
    (caseId: string) => {
      setCases((prev) => prev.filter((c) => c.scan.caseId !== caseId));
      if (currentCaseId === caseId) {
        setCurrentCaseId(null);
        setCaseData(null);
      }
    },
    [currentCaseId]
  );

  const selectCase = useCallback(
    (caseId: string) => {
      const selected = cases.find((c) => c.scan.caseId === caseId);
      if (selected) {
        setCurrentCaseId(caseId);
        setCaseData(selected);
      }
    },
    [cases]
  );

  const dismissStorageError = useCallback(() => setStorageError(null), []);

  return (
    <AppContext.Provider
      value={{
        caseData,
        currentCaseId,
        cases,
        addCase,
        removeCase,
        selectCase,
        storageError,
        dismissStorageError,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
