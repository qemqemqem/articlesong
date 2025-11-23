import asyncio
import aiohttp
import os
import json
from typing import Optional, Dict, Any

from dotenv import load_dotenv

print("Loading dotenv")

load_dotenv()

# Suno API configuration
# Try multiple potential API endpoints
API_ENDPOINTS = [
    "https://api.suno.ai/api/v1",
    "https://api.suno.ai/v1",
    "https://api.sunoapi.org/v1"
]
BASE_URL = None  # Will be set after testing connectivity
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

    endpoint = f"{BASE_URL}/songs"
    print(f"Submitting request to generate song: {json.dumps(data, indent=2)}")
    print(f"Sending request to: {endpoint}")
    print(f"Headers: {json.dumps({k: '***' if k == 'Authorization' else v for k, v in headers.items()})}")

    try:
        # Test DNS resolution
        import socket
        host = endpoint.split("//")[1].split("/")[0]
        print(f"Attempting to resolve DNS for: {host}")
        try:
            ip_address = socket.gethostbyname(host)
            print(f"Successfully resolved {host} to {ip_address}")
        except socket.gaierror as dns_error:
            print(f"DNS resolution failed: {dns_error}")

        print(f"Sending POST request to {endpoint}")
        async with session.post(endpoint, headers=headers, json=data) as response:
            print(f"Response status: {response.status}")
            response_text = await response.text()
            print(f"Response body: {response_text[:200]}{'...' if len(response_text) > 200 else ''}")

            if response.status != 200:
                error_message = f"Failed to generate song: {response.status} - {response_text}"
                if response.status == 503:
                    error_message += "\n\nThe Suno API service is temporarily unavailable. Please try again later."
                elif response.status == 401:
                    error_message += "\n\nAuthentication failed. Please check your API key."
                elif response.status == 400:
                    error_message += "\n\nBad request. Please check your request parameters."
                raise Exception(error_message)

            return json.loads(response_text)
    except aiohttp.ClientConnectorError as e:
        print(f"Connection error: {e}")
        print("Please check your internet connection and verify the API endpoint is correct.")
        print(f"Trying to ping the host...")

        # Try to ping the host
        import subprocess
        try:
            host = endpoint.split("//")[1].split("/")[0]
            result = subprocess.run(['ping', '-c', '3', host],
                                   stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE,
                                   text=True)
            print(f"Ping result: {result.stdout}")
        except Exception as ping_error:
            print(f"Ping failed: {ping_error}")

        raise Exception(f"Connection error: {e}")


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
    status_endpoint = f"{BASE_URL}/songs/{song_id}"
    print(f"Checking song status at: {status_endpoint}")

    async with session.get(status_endpoint, headers=headers) as response:
        print(f"Status check response code: {response.status}")
        response_text = await response.text()
        print(f"Status check response: {response_text[:200]}{'...' if len(response_text) > 200 else ''}")

        if response.status != 200:
            raise Exception(f"Failed to check song status: {response.status} - {response_text}")

        song_data = json.loads(response_text)

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


async def test_api_endpoints():
    """Test connectivity to different potential API endpoints and select the working one."""
    global BASE_URL

    print("\n" + "="*50)
    print("TESTING SUNO API ENDPOINTS")
    print("="*50)

    async with aiohttp.ClientSession() as session:
        for endpoint in API_ENDPOINTS:
            try:
                base_domain = endpoint.split("/")[2]  # Extract domain from URL
                print(f"Testing connection to: {base_domain}")

                # Try to resolve the domain first
                try:
                    import socket
                    ip_address = socket.gethostbyname(base_domain)
                    print(f"DNS resolution successful: {base_domain} -> {ip_address}")
                except socket.gaierror:
                    print(f"DNS resolution failed for {base_domain}")
                    continue

                # Try to connect to the base domain
                try:
                    base_url = f"https://{base_domain}"
                    print(f"Testing HTTP connection to: {base_url}")
                    async with session.get(base_url, timeout=5) as response:
                        print(f"Connection status: {response.status}")

                        # Now test the full API endpoint
                        print(f"Testing API endpoint: {endpoint}")
                        try:
                            async with session.get(endpoint, timeout=5) as api_response:
                                print(f"API endpoint status: {api_response.status}")
                                if api_response.status < 500:  # Accept any non-server error response
                                    print(f"Found working API endpoint: {endpoint}")
                                    BASE_URL = endpoint
                                    return True
                        except Exception as api_err:
                            print(f"API endpoint test failed: {api_err}")
                except Exception as err:
                    print(f"Connection test failed: {err}")
            except Exception as e:
                print(f"Test failed for {endpoint}: {e}")

    # If we get here, none of the endpoints worked
    print("ERROR: Could not connect to any Suno API endpoint")
    return False

async def main():
    """Example usage of the Suno API wrapper."""
    try:
        # First test and select a working API endpoint
        if not await test_api_endpoints():
            print("Failed to find a working API endpoint. Exiting.")
            return

        print(f"Using API endpoint: {BASE_URL}")

        print("\n" + "="*50)
        print("GENERATING SONG")
        print("="*50)

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
    # Add a timeout to prevent hanging indefinitely
    try:
        asyncio.run(main())
    except asyncio.TimeoutError:
        print("Operation timed out. Please check your internet connection.")
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
