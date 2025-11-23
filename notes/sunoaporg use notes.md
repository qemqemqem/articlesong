<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

# 

---

# How do I use https://sunoapi.org in Python to make a song? I have my API key and I want to download song from Python script

To use the Suno API (https://sunoapi.org) in Python to make a song and download it, follow these steps:

1. Install the required library:
```python
pip install requests
```

2. Import the necessary modules and set up your API key:
```python
import requests
import json

API_KEY = "your_api_key_here"
BASE_URL = "https://api.sunoapi.org/v1"
```

3. Create a function to generate a song:
```python
def generate_song(prompt):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    data = {
        "prompt": prompt,
        "custom": False,
        "instrumental": False
    }
    response = requests.post(f"{BASE_URL}/songs", headers=headers, json=data)
    return response.json()
```

4. Create a function to download the generated song:
```python
def download_song(song_id, filename):
    headers = {
        "Authorization": f"Bearer {API_KEY}"
    }
    response = requests.get(f"{BASE_URL}/songs/{song_id}/download", headers=headers)
    with open(filename, "wb") as f:
        f.write(response.content)
```

5. Use the functions to generate and download a song:
```python
# Generate a song
prompt = "Create a upbeat pop song about summer"
result = generate_song(prompt)

# Check if the song generation was successful
if "songs" in result and len(result["songs"]) > 0:
    song_id = result["songs"][^0]["id"]
    
    # Download the song
    download_song(song_id, "summer_song.mp3")
    print("Song downloaded successfully!")
else:
    print("Song generation failed.")
```

This script will generate a song based on your prompt and download it as an MP3 file[^1][^2][^5].

Please note that the exact API endpoints and response structure may vary slightly from the provided example, as the information is based on the available search results. Make sure to check the official Suno API documentation for the most up-to-date and accurate information on using their API.

Also, remember that each song generation typically consumes credits, so ensure you have sufficient credits in your account before making API calls[^2].

<div style="text-align: center">⁂</div>

[^1]: https://sunoapi.org

[^2]: https://libraries.io/pypi/suno-api

[^3]: https://github.com/imyizhang/Suno-API

[^4]: https://www.youtube.com/watch?v=rhNfpvoFNCk

[^5]: https://aimlapi.com/suno-ai-api

[^6]: https://researchtech.net/index.php/2024/07/python-web-app-integrate-suno-api/

[^7]: https://github.com/Malith-Rukshan/Suno-API

[^8]: https://musichero.ai/blog-how-to-install-suno-ai-api-locally-to-generate-songs-for-free-53466

[^9]: https://www.reddit.com/r/javascript/comments/1brbabk/github_gcuiartsunoapi_use_api_to_call_the_music/

[^10]: https://www.aitoolgo.com/learning/detail/gcui-art-suno-api-use-api-to-call-the-music-generation-ai-of-github

[^11]: https://suno.com

[^12]: https://www.youtube.com/watch?v=z7eLfLYmnlI

[^13]: https://musichero.ai/features/ai-music-api

[^14]: https://aimusic.so/features/ai-music-api

[^15]: https://github.com/gcui-art/suno-api

[^16]: https://songgenerator.io/features/ai-music-api

[^17]: https://github.com/SunoAI-API/Suno-API

[^18]: https://www.youtube.com/watch?v=tNu8Gs2MN_o

[^19]: https://piapi.ai/suno-api

[^20]: https://community.openai.com/t/ai-start-up-suno-ai-from-cambridge-generates-lifelike-radio-quality-music/707853

[^21]: https://www.reddit.com/r/SunoAI/comments/1hfrtb3/what_is_the_best_way_to_download_all_of_your_work/

[^22]: https://apify.com/jeremy_frost/suno-ai-scraper/api

[^23]: https://apify.com/jeremy_frost/suno-ai-scraper

[^24]: https://piapi.ai/docs/music-api/music-task-examples

[^25]: https://huggingface.co/PiAPI/Suno-API

