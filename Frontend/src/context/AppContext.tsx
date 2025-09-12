import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ForensicCase, AppContextType } from '../types';

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

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [caseData, setCaseData] = useState<ForensicCase | null>(null);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cases, setCases] = useState<ForensicCase[]>([]);

  const addCase = (newCase: ForensicCase) => {
    setCases(prev => {
      const existingIndex = prev.findIndex(c => c.caseId === newCase.caseId);
      if (existingIndex >= 0) {
        // Update existing case
        const updated = [...prev];
        updated[existingIndex] = newCase;
        return updated;
      }
      // Add new case
      return [...prev, newCase];
    });
  };

  const removeCase = (caseId: string) => {
    setCases(prev => prev.filter(c => c.caseId !== caseId));
    if (currentCaseId === caseId) {
      setCurrentCaseId(null);
      setCaseData(null);
    }
  };

  const selectCase = (caseId: string) => {
    const selectedCase = cases.find(c => c.caseId === caseId);
    if (selectedCase) {
      setCurrentCaseId(caseId);
      setCaseData(selectedCase);
    }
  };

  return (
    <AppContext.Provider
      value={{
        caseData,
        setCaseData,
        currentCaseId,
        setCurrentCaseId,
        isLoading,
        setIsLoading,
        cases,
        addCase,
        removeCase,
        selectCase,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};