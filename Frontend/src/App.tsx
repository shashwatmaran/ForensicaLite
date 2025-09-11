import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import AppRoutes from './routes';

function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Router>
          <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
            <AppRoutes />
          </div>
        </Router>
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;