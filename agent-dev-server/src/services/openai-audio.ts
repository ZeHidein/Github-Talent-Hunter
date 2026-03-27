import { createOpenAI } from '@ai-sdk/openai';
import {
  experimental_generateSpeech as generateSpeech,
  experimental_transcribe as transcribe,
} from 'ai';
import { Readable } from 'node:stream';

export type OpenAIParams = {
  apiKey: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string | null | undefined>;
};

export type OpenAIServiceParams = {
  connectionParams: OpenAIParams;
  enableAudioPreview: boolean;
  enableProcessing: boolean;
};

class OpenAIAudioService {
  private readonly openai: ReturnType<typeof createOpenAI>;

  constructor(settings: OpenAIServiceParams) {
    this.openai = createOpenAI({
      apiKey: settings.connectionParams.apiKey,
      baseURL: settings.connectionParams.baseURL,
      headers: settings.connectionParams.defaultHeaders ?? undefined,
    });
  }

  async textToVoiceBytes({ text }: { text: string }): Promise<Uint8Array> {
    try {
      const speech = await generateSpeech({
        model: this.openai.speech('gpt-4o-mini-tts'),
        text,
        voice: 'alloy',
        instructions: 'Speak in a cheerful and friendly tone.',
      });

      return this.extractAudioBytes(speech.audio);
    } catch (error: any) {
      console.error('Error in TTS processing: ' + error.message);
      throw error;
    }
  }

  async textToVoiceStream({ text }: { text: string }): Promise<NodeJS.ReadableStream> {
    const bytes = await this.textToVoiceBytes({ text });
    return Readable.from(bytes);
  }

  async voiceToText({ buffer }: { buffer: Buffer }): Promise<{ text: string }> {
    console.time('STT Whisper');
    const result = await transcribe({
      model: this.openai.transcription('gpt-4o-transcribe'),
      audio: buffer,
      providerOptions: {
        openai: {
          language: 'en',
        },
      },
    });
    console.timeEnd('STT Whisper');
    return { text: result.text };
  }

  private extractAudioBytes(audio: unknown): Uint8Array {
    if (audio instanceof Uint8Array) {
      return audio;
    }

    if (typeof audio === 'object' && audio && 'uint8Array' in audio) {
      const candidate = (audio as { uint8Array?: unknown }).uint8Array;
      if (candidate instanceof Uint8Array) {
        return candidate;
      }
    }

    if (typeof audio === 'object' && audio && 'base64' in audio) {
      const candidate = (audio as { base64?: unknown }).base64;
      if (typeof candidate === 'string') {
        return Buffer.from(candidate, 'base64');
      }
    }

    throw new Error('AI SDK generateSpeech returned unsupported audio payload shape');
  }
}

export default OpenAIAudioService;
