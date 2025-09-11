import React from 'react';
import { Search } from 'lucide-react';

interface LoaderProps {
  message?: string;
}

const Loader: React.FC<LoaderProps> = ({ message = 'Analyzing your disk, please wait...' }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 rounded-full animate-spin">
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
        </div>
        <Search className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600" />
      </div>
      
      <div className="text-center">
        <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          {message}
        </p>
        <p className="text-sm text-gray-600 dark:text-slate-400">
          This may take a few minutes depending on your disk size...
        </p>
      </div>
      
      <div className="w-64 bg-gray-200 dark:bg-slate-700 rounded-full h-2">
        <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '45%' }}></div>
      </div>
    </div>
  );
};

export default Loader;