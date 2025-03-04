import asyncio
import aiohttp
import os
import json
from typing import Optional, Dict, Any

from dotenv import load_dotenv

print("Loading dotenv")

load_dotenv()

# Suno API configuration
BASE_URL = "https://api.sunoapi.org/v1"
SUNOAPI_KEY = os.getenv('SUNOAPI_KEY')
print(f"The SUNOAPI_KEY is: {'*' * (len(SUNOAPI_KEY) - 4) + SUNOAPI_KEY[-4:] if SUNOAPI_KEY else 'Not set'}")

assert SUNOAPI_KEY, "You must set the SUNOAPI_KEY. See README or contact the author."
assert(len(SUNOAPI_KEY) > 5), "SUNOAPI_KEY does not seem to be valid!"


async def generate_audio(prompt: Optional[str] = None, lyrics: Optional[str] = None, title: str = "", 
                         tags: str = "spoken word", retry_interval: int = 2, max_retries: int = 150) -> str:
    """
    Generate audio from a given prompt or lyrics using the Suno API.

    :param prompt: The description prompt for the audio
    :param lyrics: The lyrics for the audio
    :param title: Optional title for the generated audio
    :param tags: Optional tags for the generated audio
    :param retry_interval: Time in seconds between status checks
    :param max_retries: Maximum number of status checks before giving up
    :return: URL to the generated audio
    """
    if not prompt and not lyrics:
        raise ValueError("Either 'prompt' or 'lyrics' must be provided")

    # Prepare the title if not provided
    if not title:
        if prompt:
            title = prompt[:80]
        elif lyrics:
            title = lyrics[:80]

    # Truncate inputs if they're too long
    if prompt and len(prompt) > 1000:
        prompt = prompt[:1000]
    if lyrics and len(lyrics) > 3000:
        lyrics = lyrics[:3000]
    if tags and len(tags) > 100:
        tags = tags[:100]

    async with aiohttp.ClientSession() as session:
        # Generate the song
        song_data = await submit_request(session, prompt, lyrics, title, tags)
        
        if not song_data or "songs" not in song_data or not song_data["songs"]:
            raise Exception("Failed to generate song")
        
        song_id = song_data["songs"][0]["id"]
        print(f"Song generated with ID: {song_id}")
        
        # Download the song
        for i in range(max_retries):
            try:
                audio_url = await download_song(session, song_id)
                if audio_url:
                    return audio_url
            except Exception as e:
                print(f"Attempt {i+1}/{max_retries}: {str(e)}")
            
            print(f"Attempt {i+1}/{max_retries}: waiting for song to be ready, retrying in {retry_interval} seconds...")
            await asyncio.sleep(retry_interval)
        
        raise Exception("Timed out waiting for song to be ready")


async def submit_request(session: aiohttp.ClientSession, prompt: Optional[str], lyrics: Optional[str], 
                         title: str, tags: str) -> dict:
    """
    Submit a song generation request to the Suno API.
    
    :param session: aiohttp ClientSession
    :param prompt: Description prompt for the song
    :param lyrics: Lyrics for the song
    :param title: Title for the song
    :param tags: Tags for the song
    :return: Response data from the API
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SUNOAPI_KEY}"
    }
    
    # Determine if we're using custom mode (lyrics) or not (prompt)
    custom_mode = lyrics is not None
    
    data = {
        "prompt": lyrics if custom_mode else prompt,
        "custom": custom_mode,
        "instrumental": False,
        "title": title,
        "tags": tags
    }
    
    print(f"Submitting request to generate song: {json.dumps(data, indent=2)}")
    print(f"Sending request to: {BASE_URL}/songs")
    
    try:
        async with session.post(f"{BASE_URL}/songs", headers=headers, json=data) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"Failed to generate song: {response.status} - {error_text}")
            
            return await response.json()
    except aiohttp.ClientConnectorError as e:
        print(f"Connection error: {e}")
        print("Please check your internet connection and verify the API endpoint is correct.")
        raise Exception(f"Connection error: {e}")
        
        return await response.json()


async def download_song(session: aiohttp.ClientSession, song_id: str) -> str:
    """
    Download a generated song from the Suno API.
    
    :param session: aiohttp ClientSession
    :param song_id: ID of the song to download
    :return: URL to the downloaded song
    """
    headers = {
        "Authorization": f"Bearer {SUNOAPI_KEY}"
    }
    
    # First check if the song is ready
    async with session.get(f"{BASE_URL}/songs/{song_id}", headers=headers) as response:
        if response.status != 200:
            error_text = await response.text()
            raise Exception(f"Failed to check song status: {response.status} - {error_text}")
        
        song_data = await response.json()
        
        # Check if the song is ready
        if song_data.get("status") != "complete":
            raise Exception("Song is not ready yet")
        
        # Get the download URL
        async with session.get(f"{BASE_URL}/songs/{song_id}/download", headers=headers) as download_response:
            if download_response.status != 200:
                error_text = await download_response.text()
                raise Exception(f"Failed to download song: {download_response.status} - {error_text}")
            
            download_data = await download_response.json()
            return download_data.get("url")


async def main():
    """Example usage of the Suno API wrapper."""
    try:
        # Example 1: Generate a song about parakeets using a prompt
        prompt = "A cheerful folk song about colorful parakeets flying in the sky, with chirping sounds and nature themes"
        result = await generate_audio(prompt=prompt, title="Parakeet Paradise", tags="folk, nature, birds")
        print(f"Generated song URL: {result}")
        
        # Example 2: Generate a song with specific lyrics
        lyrics = """
        Colorful parakeets in the sky,
        Chirping and singing as they fly by.
        Green and blue, yellow and red,
        Feathers so bright upon their head.

        [Chorus]
        Parakeets, parakeets, flying so free,
        Parakeets, parakeets, come sing with me.
        
        Little companions, so clever and sweet,
        With playful antics that can't be beat.
        They mimic our words with such delight,
        And fill our homes with joy so bright.
        """
        result_lyrics = await generate_audio(lyrics=lyrics, title="Parakeet Song", tags="folk, birds")
        print(f"Generated song URL (from lyrics): {result_lyrics}")
        
    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())
