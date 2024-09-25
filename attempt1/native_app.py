#!/usr/bin/env python3
import sys
import json
import struct
import base64

def get_message():
    # Read message length (first 4 bytes).
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        sys.exit(0)
    message_length = struct.unpack('@I', raw_length)[0]
    # Read the JSON data.
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def send_message(message_content):
    # Encode the message.
    encoded_content = json.dumps(message_content).encode('utf-8')
    # Write message length and content.
    sys.stdout.buffer.write(struct.pack('@I', len(encoded_content)))
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.flush()

def process_text(text, api_key):
    # Placeholder for text processing.
    # For example, use a text-to-speech API or library.
    # Here we'll simulate and read a local audio file.

    # Simulate processing (e.g., save text to speech)
    # For the purpose of this example, we'll assume 'output_audio.mp3' exists.

    # Read the audio file and encode it in base64
    try:
        with open('output_audio.mp3', 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
        
        # Simulate getting song information
        song_info = {
            "title": "Generated Song",
            "artist": "AI Singer",
            "duration": "3:30"
        }
        
        return audio_data, song_info
    except FileNotFoundError:
        return None, None

def main():
    while True:
        message = get_message()
        text = message.get('text', '')
        api_key = message.get('apiKey', '')
        audio_data, song_info = process_text(text, api_key)
        if audio_data and song_info:
            send_message({
                'audioData': audio_data,
                'song_info': song_info
            })
        else:
            send_message({'error': 'Audio file not found or song info unavailable.'})

if __name__ == '__main__':
    main()
