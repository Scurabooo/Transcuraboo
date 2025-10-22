export enum TranscriptionStatus {
  QUEUED = 'Queued',
  PROCESSING = 'Processing',
  TRANSCRIBING = 'Transcribing',
  DONE = 'Done',
  ERROR = 'Error',
}

export interface TranscriptionTurn {
  startTime: number;
  endTime: number;
  text: string;
}

export interface TranscribedFile {
  id: string;
  file: File;
  status: TranscriptionStatus;
  progress: number;
  transcription: TranscriptionTurn[];
  error?: string | null;
}