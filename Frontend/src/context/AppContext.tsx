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

  return (
    <AppContext.Provider
      value={{
        caseData,
        setCaseData,
        currentCaseId,
        setCurrentCaseId,
        isLoading,
        setIsLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};