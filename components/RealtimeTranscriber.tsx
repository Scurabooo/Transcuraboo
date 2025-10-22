import React, { useState, useRef, useCallback, useEffect } from 'react';
// Fix: Removed non-exported member 'LiveSession' from the import.
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from "@google/genai";
import { encode, decode, decodeAudioData } from '../utils/audio';
import { MicrophoneIcon } from './icons/MicrophoneIcon';
import { StopCircleIcon } from './icons/StopCircleIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { RotateCcwIcon } from './icons/RotateCcwIcon';
import { CopyIcon } from './icons/CopyIcon';
import { ClipboardCheckIcon } from './icons/ClipboardCheckIcon';
import { downloadFile, generateSrt, generateTxt, generateDocx } from '../utils/download';
import { TranscriptionTurn } from '../types';
import { formatDisplayTimestamp } from '../utils/formatters';

// Fix: Defined a local 'LiveSession' interface for type safety as it is not exported from the SDK.
interface LiveSession {
    close: () => void;
    sendRealtimeInput: (input: { media: Blob }) => void;
}

function createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
}

interface CurrentTurn {
    startTime: number;
    text: string;
}

export const RealtimeTranscriber: React.FC = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState<TranscriptionTurn[]>([]);
    const [currentTurn, setCurrentTurn] = useState<CurrentTurn | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const outputGainNodeRef = useRef<GainNode | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const recordingStartTimeRef = useRef<number | null>(null);
    const transcriptContainerRef = useRef<HTMLDivElement>(null);

    const stopRecording = useCallback(async () => {
        setIsRecording(false);
    
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
    
        if (scriptProcessorRef.current) {
          scriptProcessorRef.current.disconnect();
          scriptProcessorRef.current = null;
        }
    
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          await audioContextRef.current.close();
          audioContextRef.current = null;
        }

        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            await outputAudioContextRef.current.close();
            outputAudioContextRef.current = null;
            outputGainNodeRef.current = null;
        }
    
        if (sessionPromiseRef.current) {
          try {
            const session = await sessionPromiseRef.current;
            session.close();
          } catch (e) {
            console.error('Error closing session:', e);
          }
          sessionPromiseRef.current = null;
        }
        
        setCurrentTurn(prevTurn => {
            if (prevTurn && prevTurn.text.trim() && recordingStartTimeRef.current) {
                const endTime = (performance.now() - recordingStartTimeRef.current) / 1000;
                setTranscript(prevTranscript => [...prevTranscript, {
                    ...prevTurn,
                    endTime: endTime
                }]);
            }
            return null;
        });
        recordingStartTimeRef.current = null;
      }, []);

    const startRecording = useCallback(async () => {
        setIsRecording(true);
        setError(null);
        setTranscript([]);
        setCurrentTurn(null);
        setIsDownloadOpen(false);
        recordingStartTimeRef.current = performance.now();

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia is not supported in this browser.');
            }
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        // Input audio processing
                        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        const source = audioContextRef.current.createMediaStreamSource(streamRef.current!);
                        scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        source.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(audioContextRef.current.destination);

                        // Output audio processing (to keep connection alive)
                        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                        outputGainNodeRef.current = outputAudioContextRef.current.createGain();
                        outputGainNodeRef.current.gain.value = 0; // Mute output
                        outputGainNodeRef.current.connect(outputAudioContextRef.current.destination);
                    },
                    onmessage: (message: LiveServerMessage) => {
                        // Handle transcription
                        if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            if (text) {
                                setCurrentTurn(prevTurn => {
                                    if (prevTurn) {
                                        return { ...prevTurn, text: prevTurn.text + text };
                                    }
                                    const elapsedTime = (performance.now() - (recordingStartTimeRef.current ?? performance.now())) / 1000;
                                    return {
                                        startTime: elapsedTime,
                                        text: text,
                                    };
                                });
                            }
                        }
                        if (message.serverContent?.turnComplete) {
                            setCurrentTurn(prevTurn => {
                                if (prevTurn && prevTurn.text.trim()) {
                                    const elapsedTime = (performance.now() - (recordingStartTimeRef.current ?? performance.now())) / 1000;
                                    setTranscript(prev => [...prev, {
                                        ...prevTurn,
                                        endTime: elapsedTime,
                                    }]);
                                }
                                return null; // Reset for next turn
                            });
                        }
                        
                        // Handle audio output from the model to keep the connection alive
                        const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64EncodedAudioString && outputAudioContextRef.current && outputGainNodeRef.current) {
                            const audioContext = outputAudioContextRef.current;
                            const gainNode = outputGainNodeRef.current;
                            (async () => {
                                try {
                                    const audioBuffer = await decodeAudioData(decode(base64EncodedAudioString), audioContext, 24000, 1);
                                    const source = audioContext.createBufferSource();
                                    source.buffer = audioBuffer;
                                    source.connect(gainNode);
                                    source.start();
                                } catch (e) {
                                    console.error("Error processing audio output from model:", e);
                                }
                            })();
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Session error:', e);
                        const errorMessage = e.message || 'A network error occurred with the transcription service.';
                        setError(`Error: ${errorMessage}`);
                        stopRecording();
                    },
                    onclose: (e: CloseEvent) => {
                        console.log('Session closed');
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    systemInstruction: `You are an expert real-time transcriptionist, specializing in mixed-language conversations involving English and Filipino (Tagalog). Your primary goal is to produce a clean, accurate, and highly readable transcript.

Follow these instructions carefully:
1.  **Language Handling**: The user will switch between English and Filipino. Transcribe the words exactly as they are spoken in their original language. For Filipino words, use the standard English alphabet (do not use any special characters or diacritics). **Do not translate** the content.
2.  **Contextual Accuracy**: Pay close attention to the context of the entire conversation to resolve ambiguities. For example, correctly distinguish between words that sound similar (e.g., "their," "there," "they're") based on the surrounding dialogue.
3.  **Formatting**: Apply proper punctuation (periods, commas, question marks), capitalization, and create new paragraphs where appropriate to structure the text for readability.
4.  **Output**: Provide only the transcribed text. Do not include any additional commentary, notes, or language tags.`,
                },
            });

        } catch (err) {
            console.error('Error starting recording:', err);
            const message = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(`Failed to start recording: ${message}`);
            setIsRecording(false);
        }
    }, [stopRecording]);
    
    useEffect(() => {
        if (transcriptContainerRef.current) {
            transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
        }
    }, [transcript, currentTurn]);

    useEffect(() => {
        return () => {
            if (isRecording) {
                stopRecording();
            }
        };
    }, [isRecording, stopRecording]);

    const handleToggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const handleReset = () => {
        setTranscript([]);
        setCurrentTurn(null);
        setError(null);
        setIsCopied(false);
    };

    const getFullTranscript = (): TranscriptionTurn[] => {
        const fullTranscript = [...transcript];
        if (currentTurn && currentTurn.text.trim()) {
            const endTime = recordingStartTimeRef.current ? (performance.now() - recordingStartTimeRef.current) / 1000 : currentTurn.startTime + 1;
            fullTranscript.push({ ...currentTurn, endTime });
        }
        return fullTranscript;
    };

    const handleCopy = () => {
        const textToCopy = generateTxt(getFullTranscript());
        navigator.clipboard.writeText(textToCopy);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleDownload = (format: 'txt' | 'srt' | 'docx') => {
        const fileName = `realtime-transcription-${new Date().toISOString()}`;
        const fullTranscript = getFullTranscript();
        if (format === 'txt') {
            const content = generateTxt(fullTranscript);
            downloadFile(content, 'text/plain', `${fileName}.txt`);
        } else if (format === 'srt') {
            const content = generateSrt(fullTranscript);
            downloadFile(content, 'text/plain', `${fileName}.srt`);
        } else if (format === 'docx') {
            generateDocx(fullTranscript, fileName);
        }
        setIsDownloadOpen(false);
    };

    const hasTranscript = transcript.length > 0 || (currentTurn && currentTurn.text.trim().length > 0);

    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-4">
            <h2 className="text-2xl font-semibold text-center">Real-time Transcription</h2>
            <div 
                ref={transcriptContainerRef}
                className="bg-gray-900 rounded-md p-4 min-h-[120px] border border-gray-700 max-h-60 overflow-y-auto"
            >
                {error ? (
                     <p className="text-sm text-red-400">{error}</p>
                ) : (
                    <div className="text-sm text-gray-300 whitespace-pre-wrap font-mono space-y-2">
                        {!hasTranscript && isRecording ? (
                            <p className="flex items-center text-gray-500">
                                <span className="relative flex h-3 w-3 mr-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                                </span>
                                Listening...
                            </p>
                        ) : !hasTranscript ? (
                             <span className="text-gray-500">Press "Start Recording" and begin speaking...</span>
                        ) : (
                            <>
                                {transcript.map((turn, index) => (
                                    <p key={index}>
                                        <span className="font-semibold text-indigo-400 mr-2">{formatDisplayTimestamp(turn.startTime)}</span>
                                        <span>{turn.text}</span>
                                    </p>
                                ))}
                                {currentTurn && currentTurn.text.trim() && (
                                     <p>
                                        <span className="font-semibold text-indigo-400 mr-2">{formatDisplayTimestamp(currentTurn.startTime)}</span>
                                        <span className="text-gray-400">{currentTurn.text}</span>
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
            <div className="flex justify-center items-center space-x-2 sm:space-x-4">
                <button
                    onClick={handleReset}
                    disabled={isRecording || !hasTranscript}
                    className="p-3 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Reset Transcription"
                    title="Reset Transcription"
                >
                    <RotateCcwIcon className="w-6 h-6" />
                </button>
                <button
                    onClick={handleCopy}
                    disabled={isRecording || !hasTranscript}
                    className="p-3 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={isCopied ? 'Copied' : 'Copy Transcription'}
                    title={isCopied ? 'Copied' : 'Copy Transcription'}
                >
                    {isCopied ? <ClipboardCheckIcon className="w-6 h-6 text-green-400" /> : <CopyIcon className="w-6 h-6" />}
                </button>

                <button
                    onClick={handleToggleRecording}
                    className={`flex items-center justify-center space-x-3 px-6 py-3 rounded-full font-semibold transition-all duration-200 w-44 sm:w-52 text-white
                    ${isRecording 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:opacity-90'
                    }`}
                >
                    {isRecording ? <StopCircleIcon className="w-6 h-6" /> : <MicrophoneIcon className="w-6 h-6" />}
                    <span>{isRecording ? 'Stop' : 'Start'}</span>
                </button>

                <div className="relative">
                    <button
                        onClick={() => setIsDownloadOpen(prev => !prev)}
                        disabled={isRecording || !hasTranscript}
                        className="p-3 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Download Transcription"
                        title="Download Transcription"
                    >
                        <DownloadIcon className="w-6 h-6" />
                    </button>
                    {isDownloadOpen && (
                        <div className="absolute bottom-full mb-2 w-32 bg-gray-700 border border-gray-600 rounded-md shadow-lg z-10 right-0 transform translate-x-1/2 -translate-x-1/2">
                            <button onClick={() => handleDownload('txt')} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 rounded-t-md">As .txt</button>
                            <button onClick={() => handleDownload('srt')} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600">As .srt</button>
                            <button onClick={() => handleDownload('docx')} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 rounded-b-md">As .docx</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
