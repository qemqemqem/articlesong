#!/usr/bin/env python
import asyncio
import sys
import json
import struct
import numpy as np
import wave
import io
import base64

from sunoapi.piapi_to_suno import generate_audio

def create_sine_wave(frequency, duration, sample_rate=44100):
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    return np.sin(2 * np.pi * frequency * t)


def create_audio_data(text):
    # return "https://audiopipe.suno.ai/?item_id=3330f570-5201-4095-b074-e7d1cb82ec27"
    # return "https://download.samplelib.com/mp3/sample-6s.mp3"
    song_data = asyncio.run(generate_audio(text))
    print(f"Song data: {song_data}")
    return song_data


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
    audio_url = create_audio_data(text)
    return {"message": "Audio data created", "audio_url": audio_url}


while True:
    receivedMessage = getMessage()
    if isinstance(receivedMessage, dict) and receivedMessage.get('action') == 'process_text':
        the_text = receivedMessage.get('text', '')
        # Check if the_text is dict-like, if it can be parsed as a dict
        try:
            the_text = json.loads(the_text)
            the_text = the_text.get('text', '')
        except json.JSONDecodeError:
            pass
        except AttributeError:
            pass
        the_text = the_text.strip()
        result = process_text(the_text)
        sendMessage(encodeMessage(result))
    else:
        sendMessage(encodeMessage({"message": "Unknown command"}))