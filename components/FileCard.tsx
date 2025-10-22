import React, { useState } from 'react';
import { TranscribedFile, TranscriptionStatus } from '../types';
import { FileAudioIcon } from './icons/FileAudioIcon';
import { LoaderIcon } from './icons/LoaderIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { ClockIcon } from './icons/ClockIcon';
import { CopyIcon } from './icons/CopyIcon';
import { ClipboardCheckIcon } from './icons/ClipboardCheckIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { generateDocx, generateSrt, generateTxt, downloadFile } from '../utils/download';
import { formatDisplayTimestamp } from '../utils/formatters';

interface FileCardProps {
  item: TranscribedFile;
}

const StatusIcon: React.FC<{ status: TranscriptionStatus }> = ({ status }) => {
  switch (status) {
    case TranscriptionStatus.QUEUED:
      return <ClockIcon className="h-6 w-6 text-gray-400" />;
    case TranscriptionStatus.PROCESSING:
    case TranscriptionStatus.TRANSCRIBING:
      return <LoaderIcon className="h-6 w-6 text-blue-400 animate-spin" />;
    case TranscriptionStatus.DONE:
      return <CheckCircleIcon className="h-6 w-6 text-green-400" />;
    case TranscriptionStatus.ERROR:
      return <XCircleIcon className="h-6 w-6 text-red-400" />;
    default:
      return null;
  }
};

export const FileCard: React.FC<FileCardProps> = ({ item }) => {
  const { file, status, progress, transcription, error } = item;
  const fileSize = (file.size / (1024 * 1024)).toFixed(2);
  const [isCopied, setIsCopied] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);

  const handleCopy = () => {
    const textToCopy = transcription.map(turn => `[${formatDisplayTimestamp(turn.startTime)}] ${turn.text}`).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  const handleDownload = (format: 'txt' | 'srt' | 'docx') => {
    const fileName = `${file.name.split('.').slice(0, -1).join('.')}-transcription`;
    if (format === 'txt') {
        const content = generateTxt(transcription);
        downloadFile(content, 'text/plain', `${fileName}.txt`);
    } else if (format === 'srt') {
        const content = generateSrt(transcription);
        downloadFile(content, 'text/plain', `${fileName}.srt`);
    } else if (format === 'docx') {
        generateDocx(transcription, fileName);
    }
    setIsDownloadOpen(false);
  };

  const getTranscriptionForDisplay = () => {
    if (status === TranscriptionStatus.TRANSCRIBING && transcription.length > 0) {
      return transcription;
    }
    if (status === TranscriptionStatus.DONE && transcription.length > 0) {
      return transcription;
    }
    return [];
  };

  const transcriptionForDisplay = getTranscriptionForDisplay();

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3 shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4 min-w-0">
          <FileAudioIcon className="h-10 w-10 text-indigo-400 flex-shrink-0 mt-1" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate" title={file.name}>{file.name}</p>
            <p className="text-xs text-gray-400">{fileSize} MB</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
           <span className="text-xs font-semibold text-gray-400">{status}</span>
           <StatusIcon status={status} />
        </div>
      </div>

      {(status === TranscriptionStatus.PROCESSING || status === TranscriptionStatus.TRANSCRIBING) && (
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}
      
      {transcriptionForDisplay.length > 0 && (
        <div className="pt-2">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Transcription:</h4>
            <div className="bg-gray-900 rounded-md p-3 max-h-48 overflow-y-auto border border-gray-700">
                <div className="text-sm text-gray-300 whitespace-pre-wrap font-mono space-y-2">
                  {transcriptionForDisplay.map((turn, index) => (
                    <p key={index}>
                      <span className="font-semibold text-indigo-400 mr-2">{formatDisplayTimestamp(turn.startTime)}</span>
                      <span>{turn.text}</span>
                    </p>
                  ))}
                </div>
            </div>
        </div>
      )}
      
      {status === TranscriptionStatus.DONE && transcription.length > 0 && (
          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 transition-colors"
            >
              {isCopied ? <ClipboardCheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
              <span>{isCopied ? 'Copied!' : 'Copy'}</span>
            </button>
            <div className="relative">
              <button
                  onClick={() => setIsDownloadOpen(prev => !prev)}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 transition-colors"
              >
                <DownloadIcon className="w-4 h-4" />
                <span>Download</span>
              </button>
              {isDownloadOpen && (
                <div className="absolute bottom-full mb-2 w-32 bg-gray-600 border border-gray-500 rounded-md shadow-lg z-10 right-0">
                    <button onClick={() => handleDownload('txt')} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-500/50 rounded-t-md">As .txt</button>
                    <button onClick={() => handleDownload('srt')} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-500/50">As .srt</button>
                    <button onClick={() => handleDownload('docx')} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-500/50 rounded-b-md">As .docx</button>
                </div>
              )}
            </div>
          </div>
      )}

      {status === TranscriptionStatus.ERROR && error && (
         <div className="pt-2">
            <h4 className="text-sm font-semibold text-red-400 mb-2">Error:</h4>
            <div className="bg-red-900/20 border border-red-700/50 rounded-md p-3">
                <p className="text-sm text-red-300">{error}</p>
            </div>
        </div>
      )}
    </div>
  );
};