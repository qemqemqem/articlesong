import asyncio
import aiohttp
import os
from typing import Optional, Dict, Any

print("Loading dotenv")

from dotenv import load_dotenv

# This uses PiAPI: https://piapi.ai/suno-api
# You will need to create an account, get an API key, and give them some money to use this API. Sorry about that!

API_BASE_URL = "https://api.piapi.ai/api/suno/v1/music"

load_dotenv()
PIAPI_KEY = os.getenv('PIAPI_KEY')
print(f"The PIAPI_KEY is: {PIAPI_KEY}")

assert PIAPI_KEY, "You must set the PIAPI key. See README or contact the author."
assert(len(PIAPI_KEY) > 5), "PIAPI key does not seem to be valid!"


async def generate_audio(prompt: Optional[str] = None, lyrics: Optional[str] = None, title: str = "", tags: str = "spoken word",
                         retry_interval: int = 2, max_retries: int = 150) -> str:
    """
    Generate audio from a given prompt or lyrics using the Suno API.

    :param prompt: The description prompt for the audio (goes to gpt_description_prompt)
    :param lyrics: The lyrics for the audio (goes to prompt in the input)
    :param title: Optional title for the generated audio
    :param tags: Optional tags for the generated audio
    :param retry_interval: Time in seconds between status checks
    :param max_retries: Maximum number of status checks before giving up
    :return: Dictionary containing audio URL and metadata
    """
    if not PIAPI_KEY:
        raise ValueError("PIAPI_KEY environment variable is not set")

    if prompt and len(prompt) > 300:
        lyrics = prompt
        prompt = None

    if lyrics and len(lyrics) > 3_000:
        lyrics = lyrics[:3_000]

    if not title or len(title) == 0:
        if prompt:
            title = prompt[:20]
        elif lyrics:
            title = lyrics[:20]

    if prompt is None and lyrics is None:
        raise ValueError("Either 'prompt' or 'lyrics' must be provided")

    async with aiohttp.ClientSession() as session:
        # Submit the initial request
        response = await submit_request(session, prompt, lyrics, title, tags)
        task_id = response['data']['task_id']

        # Check the status and get the result
        for i in range(max_retries):
            status_response = await check_status(session, task_id)
            clips = status_response['data']['clips']
            if clips:
                for clip in clips.values():
                    if clip['audio_url']:
                        return clip["audio_url"][:10000]
                        # return {
                        #     'audio_url': clip['audio_url'],
                        #     'metadata': status_response['data']
                        # }
            print(f"Attempt {i + 1}/{max_retries}: audio not ready yet, retrying in {retry_interval} seconds...")
            await asyncio.sleep(retry_interval)

        raise Exception("Timed out waiting for audio URL")


async def submit_request(session: aiohttp.ClientSession, prompt: Optional[str], lyrics: Optional[str], title: str,
                         tags: str) -> dict:
    """Submit an audio generation request to the Suno API."""
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': PIAPI_KEY
    }
    data = {
        "custom_mode": False,
        "mv": "chirp-v3-5",
        "input": {
            "title": title,
            "tags": tags
        }
    }

    if prompt:
        data["input"]["gpt_description_prompt"] = prompt
        data["custom_mode"] = False
    elif lyrics:
        data["input"]["prompt"] = lyrics
        data["custom_mode"] = True

    # raise Exception(f"{data}")
    print(f"Data: {data}")

    # Assert that the size of data is not too large
    assert len(str(data)) < 10000, "Data is too large"
    assert len(str(headers)) < 10000, "Headers is too large"
    assert len(str(API_BASE_URL)) < 10000, "API_BASE_URL is too large"

    async with session.post(API_BASE_URL, headers=headers, json=data) as response:
        # raise Exception(f"{response}")
        response.raise_for_status()
        return await response.json()


async def check_status(session: aiohttp.ClientSession, task_id: str) -> dict:
    """Check the status of an audio generation task."""
    headers = {
        'Accept': 'application/json',
        'X-API-Key': PIAPI_KEY
    }
    async with session.get(f"{API_BASE_URL}/{task_id}", headers=headers) as response:
        response.raise_for_status()
        return await response.json()


async def main():
    # Example usage
    prompt = "a song that wizards chant when summoning fire"
    try:
        result = await generate_audio(prompt=prompt, title="Wizard Fire", tags="chanting, metal")
        print(f"Generated audio URL: {result}")
        # print(f"Metadata: {result['metadata']}")

        lyrics = "Fire rise, spirits high\nMagic flows, through the sky [Repeated]"
        result_lyrics = await generate_audio(lyrics=lyrics, title="Wizard's Chant 2", tags="mystical, chanting")
        print(f"Generated audio URL (from lyrics): {result_lyrics}")
        # print(f"Metadata (from lyrics): {result_lyrics['metadata']}")
    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())