import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TranscribedFile, TranscriptionStatus, TranscriptionTurn } from './types';
import { transcribeAudio } from './services/geminiService';
import { arrayBufferToBase64, audioBufferToWav } from './utils/audio';
import { FileCard } from './components/FileCard';
import { UploadCloudIcon } from './components/icons/UploadCloudIcon';
import { TrashIcon } from './components/icons/TrashIcon';
import { RealtimeTranscriber } from './components/RealtimeTranscriber';
import { InstallPWA } from './components/InstallPWA';

const CHUNK_SIZE_SECONDS = 20; // Smaller chunks for faster feedback
const CONCURRENCY_LIMIT = 10; // Increased concurrency for faster processing

const App: React.FC = () => {
  const [files, setFiles] = useState<TranscribedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateFileState = (id: string, updates: Partial<TranscribedFile>) => {
    setFiles(prevFiles =>
      prevFiles.map(f => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const processFile = useCallback(async (fileId: string) => {
    setIsProcessing(true);
    const fileItem = files.find(f => f.id === fileId);

    if (!fileItem) {
      setIsProcessing(false);
      return;
    }

    try {
      updateFileState(fileId, { status: TranscriptionStatus.PROCESSING, progress: 5 });

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await fileItem.file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const sampleRate = audioBuffer.sampleRate;
      const numChannels = audioBuffer.numberOfChannels;
      const totalSamples = audioBuffer.length;
      const chunkTotalSamples = CHUNK_SIZE_SECONDS * sampleRate;
      const numChunks = Math.ceil(totalSamples / chunkTotalSamples);
      
      updateFileState(fileId, { status: TranscriptionStatus.TRANSCRIBING });

      const fullTranscriptionTurns = new Array<TranscriptionTurn>(numChunks);
      let chunksProcessed = 0;

      for (let i = 0; i < numChunks; i += CONCURRENCY_LIMIT) {
        const chunkBatchIndices = Array.from(
          { length: Math.min(CONCURRENCY_LIMIT, numChunks - i) },
          (_, k) => i + k
        );

        const promises = chunkBatchIndices.map(async (chunkIndex) => {
          const startSample = chunkIndex * chunkTotalSamples;
          const endSample = Math.min(startSample + chunkTotalSamples, totalSamples);
          const chunkLength = endSample - startSample;

          const chunkBuffer = audioContext.createBuffer(numChannels, chunkLength, sampleRate);
          for (let channel = 0; channel < numChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            const chunkChannelData = chunkBuffer.getChannelData(channel);
            chunkChannelData.set(channelData.subarray(startSample, endSample));
          }

          const wavBuffer = audioBufferToWav(chunkBuffer);
          const base64Wav = arrayBufferToBase64(wavBuffer);
          
          const transcriptionPart = await transcribeAudio(base64Wav);
          if (transcriptionPart.startsWith('Error:')) {
            throw new Error(transcriptionPart);
          }
          
          const turn: TranscriptionTurn = {
            text: transcriptionPart.trim(),
            startTime: chunkIndex * CHUNK_SIZE_SECONDS,
            endTime: Math.min((chunkIndex + 1) * CHUNK_SIZE_SECONDS, audioBuffer.duration),
          };
          return { turn, index: chunkIndex };
        });

        const results = await Promise.all(promises);

        results.forEach(result => {
          if (result) {
            fullTranscriptionTurns[result.index] = result.turn;
          }
        });

        chunksProcessed += results.length;
        
        const currentTurns = fullTranscriptionTurns.filter(Boolean).sort((a, b) => a.startTime - b.startTime);

        updateFileState(fileId, {
          progress: 5 + Math.round((chunksProcessed / numChunks) * 90),
          transcription: currentTurns,
        });
      }
      
      const finalTurns = fullTranscriptionTurns.filter(Boolean).sort((a, b) => a.startTime - b.startTime);
      updateFileState(fileId, { status: TranscriptionStatus.DONE, progress: 100, transcription: finalTurns });

    } catch (error) {
      console.error("Error processing file:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      updateFileState(fileId, { status: TranscriptionStatus.ERROR, error: errorMessage, progress: 0 });
    } finally {
      setIsProcessing(false);
    }
  }, [files]);

  useEffect(() => {
    const queuedFile = files.find(f => f.status === TranscriptionStatus.QUEUED);
    if (queuedFile && !isProcessing) {
      processFile(queuedFile.id);
    }
  }, [files, isProcessing, processFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      const newFiles: TranscribedFile[] = Array.from(selectedFiles).map((file: File) => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        status: TranscriptionStatus.QUEUED,
        progress: 0,
        transcription: [],
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const clearAll = () => {
    setFiles([]);
    if(fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <div className="flex justify-center items-center gap-4">
            <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
              Transcuraboo
            </h1>
            <InstallPWA />
          </div>
          <p className="mt-4 text-lg text-gray-400">
            Transcribe pre-recorded audio files or capture your voice in real-time.
          </p>
        </header>

        <main className="space-y-8">
          <RealtimeTranscriber />

          <div>
            <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">File-based Transcription</h2>
            <div 
              className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-gray-800/50 transition-all duration-300 mt-4"
              onClick={handleUploadClick}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
                accept="audio/*"
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center space-y-4">
                <UploadCloudIcon className="w-12 h-12 text-gray-500" />
                <p className="text-lg font-semibold text-gray-300">
                  Click to upload or drag and drop
                </p>
                <p className="text-sm text-gray-500">Supports all major audio formats</p>
              </div>
            </div>
            
            {files.length > 0 && (
              <div className="flex justify-end mt-4">
                <button
                  onClick={clearAll}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600/20 text-red-300 rounded-md hover:bg-red-600/40 transition-colors"
                >
                  <TrashIcon className="w-5 h-5" />
                  <span>Clear All</span>
                </button>
              </div>
            )}

            <div className="space-y-4 mt-4">
              {files.map(item => (
                <FileCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
