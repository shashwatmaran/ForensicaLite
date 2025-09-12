import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, FileSearch, Info, BarChart3 } from 'lucide-react';
import clsx from 'clsx';

const Sidebar: React.FC = () => {
  const location = useLocation();

  const menuItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/results', icon: FileSearch, label: 'Results' },
    { path: '/about', icon: Info, label: 'About' },
  ];

  return (
    <aside className="w-64 bg-slate-900 dark:bg-slate-950 text-white min-h-screen">
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-8">
          <BarChart3 className="w-8 h-8 text-blue-400" />
          <h2 className="text-xl font-semibold">Dashboard</h2>
        </div>
        
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 dark:hover:bg-slate-800/50 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;