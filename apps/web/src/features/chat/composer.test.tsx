import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatComposer } from '@/components';
import { combineDictation, getSpeechRecognition, transcriptOf } from './useDictation';

function ControlledComposer(props: {
  onSend: (text: string) => void;
  onMic?: () => void;
  hideMic?: boolean;
  micActive?: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <ChatComposer
      inline
      value={value}
      onValueChange={setValue}
      onSend={(text) => {
        props.onSend(text);
        setValue('');
      }}
      onAttach={() => undefined}
      onMic={props.onMic}
      hideMic={props.hideMic}
      micActive={props.micActive}
    />
  );
}

function stubPointer(fine: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer: fine') ? fine : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    })),
  );
}

describe('composer states (08 / 08c)', () => {
  it('shows the mic while empty and the accent send button once there is text', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const onMic = vi.fn();
    render(<ControlledComposer onSend={onSend} onMic={onMic} />);

    expect(screen.getByRole('button', { name: 'Diktieren' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Senden' })).toBeNull();

    await user.type(screen.getByRole('textbox', { name: 'Nachricht' }), '  Bringe ich mit!  ');
    expect(screen.queryByRole('button', { name: 'Diktieren' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Senden' }));
    expect(onSend).toHaveBeenCalledWith('Bringe ich mit!');
    expect(screen.getByRole('textbox', { name: 'Nachricht' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Diktieren' })).toBeInTheDocument();
  });

  it('never sends whitespace-only messages', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ControlledComposer onSend={onSend} />);
    await user.type(screen.getByRole('textbox', { name: 'Nachricht' }), '   ');
    expect(screen.queryByRole('button', { name: 'Senden' })).toBeNull();
    fireEvent.submit(screen.getByRole('textbox', { name: 'Nachricht' }).closest('form') as HTMLFormElement);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('hides the mic when dictation is unsupported and marks it while listening', () => {
    const { rerender } = render(<ControlledComposer onSend={() => undefined} hideMic />);
    expect(screen.queryByRole('button', { name: /Diktat|Diktieren/ })).toBeNull();
    expect(document.querySelector('.homi-composer__mic')).toBeNull();

    rerender(<ControlledComposer onSend={() => undefined} onMic={() => undefined} micActive />);
    const mic = screen.getByRole('button', { name: 'Diktat beenden' });
    expect(mic).toHaveAttribute('aria-pressed', 'true');
    expect(mic).toHaveAttribute('data-active');
  });

  it('sends with Enter on hardware keyboards and keeps Shift+Enter for new lines', async () => {
    stubPointer(true);
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ControlledComposer onSend={onSend} />);
    const field = screen.getByRole('textbox', { name: 'Nachricht' });
    await user.type(field, 'Erste Zeile{Shift>}{Enter}{/Shift}Zweite Zeile');
    expect(onSend).not.toHaveBeenCalled();
    expect(field).toHaveValue('Erste Zeile\nZweite Zeile');
    await user.type(field, '{Enter}');
    expect(onSend).toHaveBeenCalledWith('Erste Zeile\nZweite Zeile');
  });

  it('keeps Return as a line break on touch keyboards', async () => {
    stubPointer(false);
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ControlledComposer onSend={onSend} />);
    const field = screen.getByRole('textbox', { name: 'Nachricht' });
    await user.type(field, 'Hallo{Enter}Welt');
    expect(onSend).not.toHaveBeenCalled();
    expect(field).toHaveValue('Hallo\nWelt');
  });
});

describe('dictation helpers', () => {
  it('detects the (webkit) SpeechRecognition constructor', () => {
    class Fake {}
    expect(getSpeechRecognition({})).toBeNull();
    expect(getSpeechRecognition({ webkitSpeechRecognition: Fake })).toBe(Fake);
    expect(getSpeechRecognition({ SpeechRecognition: Fake, webkitSpeechRecognition: class {} })).toBe(Fake);
  });

  it('joins recognised segments and appends them to typed text', () => {
    const event = {
      results: {
        length: 2,
        0: { length: 1, isFinal: true, 0: { transcript: 'Bringe ich' } },
        1: { length: 1, isFinal: false, 0: { transcript: ' mit ' } },
      },
    };
    expect(transcriptOf(event)).toBe('Bringe ich mit');
    expect(combineDictation('', 'Bringe ich mit')).toBe('Bringe ich mit');
    expect(combineDictation('Okay. ', 'Bringe ich mit')).toBe('Okay. Bringe ich mit');
    expect(combineDictation('Okay', '')).toBe('Okay');
  });
});
