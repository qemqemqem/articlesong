import asyncio
import aiohttp
import os
from typing import Optional, Dict, Any

# This uses PiAPI: https://piapi.ai/suno-api
# You will need to create an account, get an API key, and give them some money to use this API. Sorry about that!

API_BASE_URL = "https://api.piapi.ai/api/suno/v1/music"
PIAPI_KEY = os.environ.get("PIAPI_KEY")


async def generate_audio(prompt: Optional[str] = None, lyrics: Optional[str] = None, title: str = "", tags: str = "",
                         retry_interval: int = 2, max_retries: int = 150) -> Dict[str, Any]:
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

    if prompt is None and lyrics is None:
        raise ValueError("Either 'prompt' or 'lyrics' must be provided")

    async with aiohttp.ClientSession() as session:
        # Submit the initial request
        response = await submit_request(session, prompt, lyrics, title, tags)
        task_id = response['data']['task_id']

        # Check the status and get the result
        for _ in range(max_retries):
            status_response = await check_status(session, task_id)
            clips = status_response['data']['clips']
            if clips:
                for clip in clips.values():
                    if clip['audio_url']:
                        return {
                            'audio_url': clip['audio_url'],
                            'metadata': status_response['data']
                        }
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
    if lyrics:
        data["input"]["prompt"] = lyrics

    async with session.post(API_BASE_URL, headers=headers, json=data) as response:
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
        print(f"Generated audio URL: {result['audio_url']}")
        print(f"Metadata: {result['metadata']}")

        lyrics = "Fire rise, spirits high\nMagic flows, through the sky [Repeated]"
        result_lyrics = await generate_audio(lyrics=lyrics, title="Wizard's Chant 2", tags="mystical, chanting")
        print(f"Generated audio URL (from lyrics): {result_lyrics['audio_url']}")
        print(f"Metadata (from lyrics): {result_lyrics['metadata']}")
    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())