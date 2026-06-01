import { describeError } from "./logger.js";

export const OPENAI_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;

export interface AudioTranscriptionInput {
  apiKey: string;
  model: string;
  fileName: string;
  bytes: Uint8Array;
  mimeType?: string | null;
}

export interface AudioTranscriptionResult {
  text: string;
}

export function isAudioMimeType(mimeType?: string | null): boolean {
  return Boolean(mimeType && mimeType.trim().toLowerCase().startsWith("audio/"));
}

export async function transcribeAudio(input: AudioTranscriptionInput): Promise<AudioTranscriptionResult> {
  const form = new FormData();
  const blob = new Blob([input.bytes as unknown as BlobPart], {
    type: input.mimeType ?? "application/octet-stream",
  });
  form.append("model", input.model);
  form.append("response_format", "text");
  form.append("file", blob, input.fileName);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: form,
    });
  } catch (err) {
    throw new Error(`OpenAI POST /v1/audio/transcriptions fetch failed: ${describeError(err)}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OpenAI POST /v1/audio/transcriptions -> ${response.status} ${response.statusText}: ${text.slice(0, 500)}`,
    );
  }

  return {
    text: (await response.text()).trim(),
  };
}
