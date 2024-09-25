#!/usr/bin/env python
import asyncio
import sys
import json
import struct
import numpy as np
import wave
import io
import base64
import traceback

from sunoapi.piapi_to_suno import generate_audio
from llms.gpt import prompt_completion_chat, prompt_completion_json

def create_sine_wave(frequency, duration, sample_rate=44100):
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    return np.sin(2 * np.pi * frequency * t)

def create_audio_data(text, style):
    try:
        # Generate lyrics using GPT
        lyrics_prompt = f"Write song lyrics based on the following text in the style of a {style} song. Try to use as much of the content as possible in your song:\n\n{text}\n\nWrite the lyrics without any annotations like 'Chorus' or 'Verse 1'.\n\n"
        
        if style == "spoken":
            lyrics_prompt += "Focus on a spoken word style, with a rhythmic flow and emphasis on the words rather than melody."
        elif style == "musical":
            lyrics_prompt += "Create a traditional song structure with verses and a chorus, focusing on melody and rhyme."
        elif style == "meme":
            lyrics_prompt += "Make the lyrics catchy, humorous, and internet culture-friendly. Include references or phrases that could go viral."
        else:
            lyrics_prompt += "Capture all the key facts, ideas, emotions, and passages from the text. If there is a line from the article that is really important, try to include it in the lyrics. Try to be educational but also capture the vibes of the piece."

        lyrics = prompt_completion_chat(lyrics_prompt, max_tokens=700)
        print(f"WARNING: Generated lyrics: {lyrics[:50]}...")  # Print first 50 characters

        # Generate song style using GPT
        style_prompt = f"Based on the following {style} song lyrics, suggest a short description of a musical style that would be good to sing them in. Limit your response to 120 characters or less. A good response would be a short list of tags such as musical styles:\n\n{lyrics}"
        style_tags = prompt_completion_chat(style_prompt, max_tokens=50)
        print(f"WARNING: Generated style tags: {style_tags}")

        # Generate audio using Suno API
        song_data = asyncio.run(generate_audio(lyrics=lyrics, tags=style_tags))
        print(f"WARNING: Song data generated successfully")
        return song_data
    except Exception as e:
        print(f"ERROR: An error occurred in create_audio_data: {str(e)}")
        print(f"ERROR: {traceback.format_exc()}")
        return None


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


def process_text(text, style):
    audio_url = create_audio_data(text, style)
    if audio_url:
        print(f"WARNING: Audio URL created: {audio_url[:50]}...")  # Print first 50 characters
        return {"message": "Audio data created", "audio_url": audio_url}
    else:
        print("ERROR: Failed to create audio data")
        return {"message": "Failed to create audio data", "error": "Audio generation failed"}


while True:
    receivedMessage = getMessage()
    if isinstance(receivedMessage, dict) and receivedMessage.get('action') == 'process_text':
        the_text = receivedMessage.get('text', '')
        the_style = receivedMessage.get('songType', 'default')
        # Check if the_text is dict-like, if it can be parsed as a dict
        try:
            the_text = json.loads(the_text)
            the_text = the_text.get('text', '')
        except json.JSONDecodeError:
            pass
        except AttributeError:
            pass
        the_text = the_text.strip()
        result = process_text(the_text, the_style)
        sendMessage(encodeMessage(result))
    else:
        sendMessage(encodeMessage({"message": "Unknown command"}))
