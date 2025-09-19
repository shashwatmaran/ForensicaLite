import React, { useState, useMemo } from 'react';
import { Search, ArrowUpDown, File, Trash2 } from 'lucide-react';
import { ForensicFile } from '../../types';
import { formatFileSize, formatDate } from '../../utils/formatters';
import clsx from 'clsx';

interface FileExplorerProps {
  files: ForensicFile[];
}

type SortField = 'fileName' | 'fileSize' | 'modifiedAt' | 'status';
type SortDirection = 'asc' | 'desc';

const FileExplorer: React.FC<FileExplorerProps> = ({ files }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('modifiedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deleted'>('all');
  
  const itemsPerPage = 20;

  const filteredAndSortedFiles = useMemo(() => {
    const filtered = files.filter(file => {
      const matchesSearch = file.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           file.filePath.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || file.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });

    // Sort files
    const sorted = [...filtered].sort((a, b) => {
      let aValue: string | number = a[sortField];
      let bValue: string | number = b[sortField];
      
      if (sortField === 'modifiedAt') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return sorted;
  }, [files, searchTerm, sortField, sortDirection, statusFilter]);

  const totalPages = Math.ceil(filteredAndSortedFiles.length / itemsPerPage);
  const paginatedFiles = filteredAndSortedFiles.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortButton: React.FC<{ field: SortField; children: React.ReactNode }> = ({ field, children }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center space-x-1 text-left font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
    >
      <span>{children}</span>
      <ArrowUpDown className={clsx(
        'w-4 h-4',
        sortField === field ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
      )} />
    </button>
  );

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        File Explorer
      </h2>
      
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'deleted')}
          className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Files</option>
          <option value="active">Active Files</option>
          <option value="deleted">Deleted Files</option>
        </select>
      </div>

      {/* Results count */}
      <div className="mb-4 text-sm text-gray-600 dark:text-slate-400">
        Showing {paginatedFiles.length} of {filteredAndSortedFiles.length} files
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-600">
              <th className="text-left py-3 px-4">
                <SortButton field="fileName">File Name</SortButton>
              </th>
              <th className="text-left py-3 px-4">Path</th>
              <th className="text-left py-3 px-4">
                <SortButton field="fileSize">Size</SortButton>
              </th>
              <th className="text-left py-3 px-4">
                <SortButton field="modifiedAt">Modified</SortButton>
              </th>
              <th className="text-left py-3 px-4">
                <SortButton field="status">Status</SortButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedFiles.map((file, index) => (
              <tr
                key={`${file.filePath}/${file.fileName}-${index}`}
                className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50"
              >
                <td className="py-3 px-4">
                  <div className="flex items-center space-x-2">
                    {file.status === 'deleted' ? (
                      <Trash2 className="w-4 h-4 text-red-500" />
                    ) : (
                      <File className="w-4 h-4 text-gray-500" />
                    )}
                    <span className={clsx(
                      'font-medium',
                      file.status === 'deleted' 
                        ? 'text-red-600 dark:text-red-400 line-through' 
                        : 'text-gray-900 dark:text-white'
                    )}>
                      {file.fileName}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-slate-400 max-w-xs truncate">
                  {file.filePath}
                </td>
                <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                  {formatFileSize(file.fileSize)}
                </td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-slate-400">
                  {formatDate(file.modifiedAt)}
                </td>
                <td className="py-3 px-4">
                  <span className={clsx(
                    'px-2 py-1 text-xs font-medium rounded-full',
                    file.status === 'active'
                      ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                  )}>
                    {file.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          <span className="text-sm text-gray-600 dark:text-slate-400">
            Page {currentPage} of {totalPages}
          </span>
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;