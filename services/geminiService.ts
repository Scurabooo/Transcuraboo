import { GoogleGenAI } from "@google/genai";

// Fix: Initialized GoogleGenAI strictly with `process.env.API_KEY` to align with API guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function transcribeAudio(base64Audio: string): Promise<string> {
  try {
    // Fix: Simplified `contents` payload for the `generateContent` call.
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: base64Audio,
            },
          },
          {
            text: 'Transcribe the following audio. The language is likely English or Filipino. Please accurately detect the language and provide only the transcription text. This may be a segment of a larger audio file. Do not add any extra commentary or formatting.',
          },
        ],
      },
    });
    return response.text ?? '';
  } catch (error) {
    console.error('Error transcribing audio:', error);
    if (error instanceof Error) {
        return `Error: API call failed - ${error.message}`;
    }
    return 'Error: An unknown error occurred during transcription.';
  }
}