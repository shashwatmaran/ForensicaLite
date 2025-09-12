import React from 'react';
import { Moon, Sun, Shield, Home, FileSearch, Info } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';

const Navbar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { cases } = useAppContext();
  const location = useLocation();

  return (
    <nav className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            ForensicaLite
          </h1>
        </div>

        <div className="flex items-center space-x-2">
          <Link
            to="/"
            className={`inline-flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </Link>
          
          <Link
            to="/about"
            className={`inline-flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/about'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>About</span>
          </Link>
          
          {cases.length > 0 && (
            <Link
              to="/results"
              className={`inline-flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/results'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200'
              }`}
            >
              <FileSearch className="w-4 h-4" />
              <span>Results</span>
              {cases.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                  {cases.length}
                </span>
              )}
            </Link>
          )}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-yellow-500" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600" />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;