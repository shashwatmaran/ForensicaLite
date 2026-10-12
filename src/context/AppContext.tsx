import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { CaseFile } from '../types';
import { deleteCase, loadCases, saveCase } from '../utils/caseStore';
import { AppContext } from './hooks';

interface AppProviderProps {
  children: ReactNode;
}

const describe = (error: unknown) => (error instanceof Error ? ` [${error.message}]` : '');

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [caseData, setCaseData] = useState<CaseFile | null>(null);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseFile[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Saved cases load asynchronously. Anything opened before they arrive wins
  // over a stored copy with the same id.
  useEffect(() => {
    let cancelled = false;
    loadCases()
      .then((stored) => {
        if (cancelled) return;
        setCases((current) => {
          const open = new Set(current.map((c) => c.scan.caseId));
          return [...current, ...stored.filter((c) => !open.has(c.scan.caseId))];
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setStorageError(
            'Saved cases could not be loaded from browser storage. Cases you open now will ' +
              'work, but may not persist.' +
              describe(error)
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Writes are per case. A failure is reported rather than swallowed: a case
  // that silently failed to save would reappear as missing after a reload.
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

    saveCase(newCase)
      .then(() => setStorageError(null))
      .catch((error) =>
        setStorageError(
          `Case ${newCase.scan.caseId} is open but could not be saved to browser storage, so it ` +
            'will be gone after a reload. Browser storage may be full or disabled (private ' +
            'windows often restrict it).' +
            describe(error)
        )
      );
  }, []);

  const removeCase = useCallback(
    (caseId: string) => {
      setCases((prev) => prev.filter((c) => c.scan.caseId !== caseId));
      if (currentCaseId === caseId) {
        setCurrentCaseId(null);
        setCaseData(null);
      }
      deleteCase(caseId).catch((error) =>
        setStorageError(
          `Case ${caseId} was closed but could not be removed from browser storage, so it may ` +
            'reappear after a reload.' +
            describe(error)
        )
      );
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
