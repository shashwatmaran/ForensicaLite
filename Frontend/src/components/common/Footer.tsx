import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 px-6 py-4">
      <div className="text-center text-sm text-gray-600 dark:text-slate-400">
        <p>&copy; 2025 ForensicaLite. All rights reserved.</p>
        <p className="mt-1">
          Professional forensic analysis tool for digital investigations.
        </p>
      </div>
    </footer>
  );
};

export default Footer;