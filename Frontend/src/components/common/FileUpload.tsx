import React, { useState } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { validateJSON } from '../../utils/validators';
import { ForensicCase } from '../../types';

interface FileUploadProps {
  onUpload: (data: ForensicCase) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload }) => {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileRead = (content: string) => {
    setError(null);
    
    if (!validateJSON(content)) {
      setError('Invalid JSON format. Please ensure the file contains valid forensic analysis results.');
      return;
    }

    try {
      const data = JSON.parse(content);
      onUpload(data);
    } catch (err) {
      setError('Failed to parse JSON file.');
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.json')) {
      setError('Please select a JSON file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      handleFileRead(content);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  return (
    <div className="w-full max-w-lg">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
            : 'border-gray-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-400'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Upload Analysis Results
        </h3>
        <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
          Drag and drop your JSON results file here, or click to browse
        </p>
        
        <label className="inline-block">
          <input
            type="file"
            accept=".json"
            onChange={handleChange}
            className="hidden"
          />
          <span className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors inline-flex items-center space-x-2">
            <FileText className="w-4 h-4" />
            <span>Choose File</span>
          </span>
        </label>
      </div>
      
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUpload;