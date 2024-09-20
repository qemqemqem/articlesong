
#!/usr/bin/env python3

def log(message):
    """Append a log message to log.txt with a timestamp."""
    with open('log.txt', 'a') as log_file:
        log_file.write(f'[{datetime.datetime.now()}] {message}\n')

log("Starting the application, importing libraries...")

import sys
import json
import struct
import base64
import numpy as np
import wave
import datetime

def get_message():
    """Read a message from stdin and decode it."""
    try:
        raw_length = sys.stdin.buffer.read(4)
        if len(raw_length) == 0:
            sys.exit(0)
        message_length = struct.unpack('@I', raw_length)[0]
        message = sys.stdin.buffer.read(message_length).decode('utf-8')
        log('Received message from extension.')
        return json.loads(message)
    except Exception as e:
        log(f'Error getting message: {e}')
        sys.exit(1)

def send_message(message_content):
    """Encode and send a message to stdout."""
    try:
        encoded_content = json.dumps(message_content).encode('utf-8')
        sys.stdout.buffer.write(struct.pack('@I', len(encoded_content)))
        sys.stdout.buffer.write(encoded_content)
        sys.stdout.flush()
        log('Sent message to extension.')
    except Exception as e:
        log(f'Error sending message: {e}')
        sys.exit(1)

def generate_sine_wave(filename, duration=1.0, freq=440.0, sample_rate=44100):
    """Generate a sine wave audio file."""
    log('Generating sine wave audio file.')
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    note = np.sin(freq * t * 2 * np.pi)
    audio = note * (2**15 - 1) / np.max(np.abs(note))
    audio = audio.astype(np.int16)
    with wave.open(filename, 'w') as wav_file:
        nchannels = 1
        sampwidth = 2  # 2 bytes per sample for int16
        wav_file.setparams((nchannels, sampwidth, sample_rate, 0, 'NONE', 'not compressed'))
        wav_file.writeframes(audio.tobytes())
    log('Sine wave audio file generated.')

def main():
    log('Native application started.')
    while True:
        try:
            message = get_message()
            text = message.get('text', '')
            api_key = message.get('apiKey', '')
            log('Processing received data.')

            # Log the page contents to a file
            with open('page_content.txt', 'w', encoding='utf-8') as f:
                f.write(text)
            log('Page content saved to page_content.txt.')

            # Generate a 1-second sine wave audio file
            audio_filename = 'output_audio.wav'
            generate_sine_wave(audio_filename)

            # Read the audio file and encode it in base64
            with open(audio_filename, 'rb') as audio_file:
                audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            log('Audio data encoded.')

            # Send the audio data back to the extension
            send_message({'audioData': audio_data})
            log('Audio data sent to extension.')
        except Exception as e:
            log(f'Error in main loop: {e}')
            send_message({'error': str(e)})
            sys.exit(1)

if __name__ == '__main__':
    main()
