import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload, Shield, Search, BarChart3, AlertTriangle } from 'lucide-react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import FileUpload from '../components/common/FileUpload';
import { useAppContext } from '../context/AppContext';
import { ForensicCase } from '../types';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { setCaseData } = useAppContext();
  const [showUpload, setShowUpload] = useState(false);

  const handleDownloadEXE = () => {
    // In a real app, this would trigger the actual EXE download
    const link = document.createElement('a');
    link.href = '/forensic-analyzer.exe'; // This would be the actual EXE file
    link.download = 'forensic-analyzer.exe';
    link.click();
    
    // Navigate to waiting page
    navigate('/waiting');
  };

  const handleJSONUpload = (data: ForensicCase) => {
    setCaseData(data);
    navigate('/results');
  };

  const features = [
    {
      icon: Search,
      title: 'Deep System Scan',
      description: 'Comprehensive analysis of your disk including deleted files and hidden data',
    },
    {
      icon: BarChart3,
      title: 'Visual Analytics',
      description: 'Interactive charts and timelines to understand file activity patterns',
    },
    {
      icon: AlertTriangle,
      title: 'Threat Detection',
      description: 'Advanced algorithms to identify suspicious files and potential security risks',
    },
    {
      icon: Shield,
      title: 'Secure Processing',
      description: 'All analysis is performed locally with enterprise-grade security',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      <Navbar />
      
      <main className="container mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-100 dark:bg-blue-950/30 rounded-full">
              <Shield className="w-16 h-16 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            ForensicaLite
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-slate-400 mb-8 max-w-3xl mx-auto">
            Professional digital forensics analysis tool for comprehensive disk examination, 
            file recovery, and security assessment. Uncover hidden insights with enterprise-grade forensic capabilities.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 hover:shadow-md transition-shadow"
              >
                <div className="p-3 bg-blue-100 dark:bg-blue-950/30 rounded-lg w-fit mb-4">
                  <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-slate-400 text-sm">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Main Actions */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-8">
              Start Your Forensic Analysis
            </h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              {/* EXE Download */}
              <div className="text-center p-6">
                <div className="p-4 bg-blue-100 dark:bg-blue-950/30 rounded-full w-fit mx-auto mb-4">
                  <Download className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                  Download Analyzer
                </h3>
                
                <p className="text-gray-600 dark:text-slate-400 mb-6">
                  Download our forensic analyzer tool and run it on your system for comprehensive disk analysis.
                </p>
                
                <button
                  onClick={handleDownloadEXE}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors inline-flex items-center space-x-2"
                >
                  <Download className="w-5 h-5" />
                  <span>Download EXE</span>
                </button>
                
                <div className="mt-4 text-sm text-gray-500 dark:text-slate-500">
                  <p>1. Download the analyzer</p>
                  <p>2. Run as administrator</p>
                  <p>3. Wait for analysis completion</p>
                </div>
              </div>

              {/* Manual Upload */}
              <div className="text-center p-6 border-l border-gray-200 dark:border-slate-700">
                <div className="p-4 bg-green-100 dark:bg-green-950/30 rounded-full w-fit mx-auto mb-4">
                  <Upload className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                  Upload Results
                </h3>
                
                <p className="text-gray-600 dark:text-slate-400 mb-6">
                  Already have analysis results? Upload your JSON file directly to view the forensic report.
                </p>
                
                {!showUpload ? (
                  <button
                    onClick={() => setShowUpload(true)}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors inline-flex items-center space-x-2"
                  >
                    <Upload className="w-5 h-5" />
                    <span>Upload JSON</span>
                  </button>
                ) : (
                  <div className="mt-4">
                    <FileUpload onUpload={handleJSONUpload} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-16 text-center">
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 max-w-2xl mx-auto">
            <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto mb-3" />
            <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
              Important Notice
            </h3>
            <p className="text-amber-800 dark:text-amber-200 text-sm">
              ForensicaLite is designed for legitimate forensic analysis and security assessment purposes only. 
              Ensure you have proper authorization before analyzing any system or data.
            </p>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default LandingPage;