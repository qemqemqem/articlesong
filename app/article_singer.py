#!/usr/bin/env python

import sys
import json
import struct
import numpy as np
import wave
import io
import base64


def create_sine_wave(frequency, duration, sample_rate=44100):
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    return np.sin(2 * np.pi * frequency * t)


def create_audio_data(text):
    # Create a simple 1-second sine wave
    frequency = 440  # A4 note
    duration = 1  # 1 second
    audio = create_sine_wave(frequency, duration)

    # Normalize the audio
    audio = audio * 32767 / np.max(np.abs(audio))
    audio = audio.astype(np.int16)

    # Write the audio to a bytes buffer
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(44100)
        wf.writeframes(audio.tobytes())

    # Encode the audio data as base64
    audio_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return audio_base64


def getMessage():
    rawLength = sys.stdin.buffer.read(4)
    if len(rawLength) == 0:
        sys.exit(0)
    messageLength = struct.unpack('@I', rawLength)[0]
    message = sys.stdin.buffer.read(messageLength).decode('utf-8')
    return json.loads(message)


def encodeMessage(messageContent):
    encodedContent = json.dumps(messageContent, separators=(',', ':')).encode('utf-8')
    encodedLength = struct.pack('@I', len(encodedContent))
    return {'length': encodedLength, 'content': encodedContent}


def sendMessage(encodedMessage):
    sys.stdout.buffer.write(encodedMessage['length'])
    sys.stdout.buffer.write(encodedMessage['content'])
    sys.stdout.buffer.flush()


def process_text(text):
    audio_data = create_audio_data(text)
    return {"message": "Audio data created", "audio_data": audio_data}


while True:
    receivedMessage = getMessage()
    if isinstance(receivedMessage, dict) and receivedMessage.get('action') == 'process_text':
        result = process_text(receivedMessage.get('text', ''))
        sendMessage(encodeMessage(result))
    else:
        sendMessage(encodeMessage({"message": "Unknown command"}))