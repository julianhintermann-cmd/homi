import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Dictation via the Web Speech API (`SpeechRecognition` / Safari's `webkitSpeechRecognition`),
 * Swiss German. Only offered when the browser supports it – the composer hides the mic otherwise.
 */

interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechAlternative | undefined;
}

interface SpeechResultEvent {
  readonly results: { readonly length: number; [index: number]: SpeechResult | undefined };
}

interface SpeechErrorEvent {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognition(target: unknown = globalThis): SpeechRecognitionConstructor | null {
  const scope = target as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Joins the recognised segments into one transcript. */
export function transcriptOf(event: SpeechResultEvent): string {
  const parts: string[] = [];
  for (let index = 0; index < event.results.length; index += 1) {
    const text = event.results[index]?.[0]?.transcript;
    if (text) parts.push(text.trim());
  }
  return parts.join(' ').trim();
}

/** Appends dictated text to what was already typed. */
export function combineDictation(base: string, transcript: string): string {
  if (!transcript) return base;
  if (!base.trim()) return transcript;
  return `${base.replace(/\s+$/, '')} ${transcript}`;
}

export interface Dictation {
  supported: boolean;
  listening: boolean;
  /** Starts listening; recognised text is passed to `onText` appended to `base`. */
  start: (base: string) => void;
  stop: () => void;
}

export function useDictation(
  onText: (text: string) => void,
  onError?: (message: string) => void,
  lang = 'de-CH',
): Dictation {
  const [supported] = useState(() => getSpeechRecognition() !== null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callbacks = useRef({ onText, onError });
  useEffect(() => {
    callbacks.current = { onText, onError };
  }, [onText, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(
    (base: string) => {
      const Recognition = getSpeechRecognition();
      if (!Recognition || recognitionRef.current) return;
      const recognition = new Recognition();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => callbacks.current.onText(combineDictation(base, transcriptOf(event)));
      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          callbacks.current.onError?.('Bitte erlaube den Zugriff auf das Mikrofon, um zu diktieren.');
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          callbacks.current.onError?.('Das Diktat ist fehlgeschlagen. Bitte versuche es nochmals.');
        }
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setListening(false);
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
      } catch {
        recognitionRef.current = null;
        setListening(false);
      }
    },
    [lang],
  );

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  return { supported, listening, start, stop };
}
