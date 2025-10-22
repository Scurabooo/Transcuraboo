// utils/download.ts
import { TranscriptionTurn } from '../types';

const formatTimestamp = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const formatSrtTimestamp = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
};


export const generateTxt = (transcript: TranscriptionTurn[]): string => {
    return transcript
        .map(turn => `[${formatTimestamp(turn.startTime)}] ${turn.text}`)
        .join('\n');
};

export const generateSrt = (transcript: TranscriptionTurn[]): string => {
    return transcript
        .map((turn, index) => {
            const start = formatSrtTimestamp(turn.startTime);
            const end = formatSrtTimestamp(turn.endTime);
            return `${index + 1}\n${start} --> ${end}\n${turn.text}\n`;
        })
        .join('\n');
};

const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export const generateDocx = (transcript: TranscriptionTurn[], fileName: string): void => {
    const content = transcript
        .map(turn => `<p><b>[${formatTimestamp(turn.startTime)}]</b> ${turn.text}</p>`)
        .join('');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${fileName}</title>
        </head>
        <body>
            <h1>Transcription</h1>
            ${content}
        </body>
        </html>
    `;
    
    const blob = new Blob([html], { type: 'application/msword' });
    triggerDownload(blob, `${fileName}.docx`);
};

export const downloadFile = (content: string, mimeType: string, fileName: string) => {
    const blob = new Blob([content], { type: mimeType });
    triggerDownload(blob, fileName);
};