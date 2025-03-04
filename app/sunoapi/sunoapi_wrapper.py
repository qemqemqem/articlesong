import asyncio
import aiohttp
import os
from typing import Optional, Dict, Any

from dotenv import load_dotenv

print("Loading dotenv")

load_dotenv()

# SUNOAPI_KEY = ""

# def load_SUNOAPI_KEY():
SUNOAPI_KEY = os.getenv('SUNOAPI_KEY')
print(f"The SUNOAPI_KEY is: {SUNOAPI_KEY}")

assert SUNOAPI_KEY, "You must set the PIAPI key. See README or contact the author."
assert(len(SUNOAPI_KEY) > 5), "PIAPI key does not seem to be valid!"


async def generate_audio(prompt: Optional[str] = None, lyrics: Optional[str] = None, title: str = "", tags: str = "spoken word", retry_interval: int = 2, max_retries: int = 150) -> str:
    # TODO
    ...


async def submit_request(session: aiohttp.ClientSession, prompt: Optional[str], lyrics: Optional[str], title: str,
                         tags: str) -> dict:
    # TODO
    ...


async def check_status(session: aiohttp.ClientSession, task_id: str) -> dict:
    # TODO
    ...


async def main():
    # TODO example usage goes here
    ...


if __name__ == "__main__":
    asyncio.run(main())