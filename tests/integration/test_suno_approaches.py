"""
Test suite for different Suno API integration approaches.

NOTE: Suno does NOT have an official public API. All approaches are either:
- Third-party paid services that wrap Suno
- Unofficial implementations using browser cookies

This module tests 5 different strategies:
1. SunoAPI.org (third-party paid service)
2. Unofficial Cookie-Based API (direct browser session - most "official" way)
3. AI Music API Service (third-party aggregator)
4. PiAPI (third-party - existing integration)
5. SunoAPI.org Gateway (another third-party endpoint)

Run with: pytest tests/integration/test_suno_approaches.py -v -s
"""

import os
import pytest
import asyncio
import aiohttp
from dotenv import load_dotenv

load_dotenv()


class TestSunoAPIOrgService:
    """Test SunoAPI.org (third-party service - NOT affiliated with Suno)"""
    
    @pytest.mark.asyncio
    async def test_sunoapi_org_service_song_generation(self):
        """
        Test song generation using SunoAPI.org (third-party service).
        
        NOTE: This is NOT the official Suno API - it's a third-party service.
        
        CREDENTIALS NEEDED:
        - Set SUNOAPI_ORG_KEY environment variable
        - Get API key from: https://api.sunoapi.org/
        """
        api_key = os.getenv('SUNOAPI_ORG_KEY')
        
        if not api_key:
            pytest.skip("SUNOAPI_ORG_KEY not set. Get it from https://api.sunoapi.org/")
        
        url = 'https://api.sunoapi.org/v1/music/generate'
        
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'description': 'A cheerful folk song about coding and adventure',
            'model_version': 'v4.5',
            'title': 'Test Song - Official API'
        }
        
        print("\n🎵 Testing SunoAPI.org Service (third-party)...")
        print(f"Endpoint: {url}")
        print(f"Data: {data}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=data) as response:
                print(f"Response Status: {response.status}")
                response_text = await response.text()
                print(f"Response: {response_text[:500]}")
                
                assert response.status in [200, 201, 202], f"Failed with status {response.status}: {response_text}"
                
                result = await response.json()
                print(f"✅ Success! Result: {result}")
                
                # Verify we got some kind of task ID or song data
                assert result is not None
                assert isinstance(result, dict)


class TestDirectCookieBasedAPI:
    """Test DIRECT Suno access using browser session cookies (closest to "official")"""
    
    @pytest.mark.asyncio
    async def test_cookie_based_song_generation(self):
        """
        Test song generation using direct cookie-based approach.
        This is the most direct way to access Suno - using your actual Suno account.
        
        CREDENTIALS NEEDED:
        - Set SUNO_SESSION_COOKIE environment variable
        - Get cookie from browser:
          1. Go to https://suno.com
          2. Log in
          3. Open Developer Tools (F12)
          4. Go to Application/Storage -> Cookies
          5. Copy the value of the cookie (usually named 'session' or '__client')
        """
        session_cookie = os.getenv('SUNO_SESSION_COOKIE')
        
        if not session_cookie:
            pytest.skip("SUNO_SESSION_COOKIE not set. Get it from your browser when logged into suno.com")
        
        # Unofficial endpoint that accepts cookies
        url = 'https://studio-api.suno.ai/api/generate/v2/'
        
        headers = {
            'Cookie': session_cookie,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        }
        
        data = {
            'gpt_description_prompt': 'A mysterious jazz song about night coding',
            'make_instrumental': False,
            'mv': 'chirp-v3-5',
            'prompt': ''
        }
        
        print("\n🎵 Testing Direct Cookie-Based API (your actual Suno account)...")
        print(f"Endpoint: {url}")
        print(f"Data: {data}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=data) as response:
                print(f"Response Status: {response.status}")
                response_text = await response.text()
                print(f"Response: {response_text[:500]}")
                
                assert response.status in [200, 201, 202], f"Failed with status {response.status}: {response_text}"
                
                result = await response.json()
                print(f"✅ Success! Result: {result}")
                
                # Verify we got clips or task data
                assert result is not None
                assert isinstance(result, dict)


class TestAIMusicAPI:
    """Test AI Music API service (third-party aggregator)"""
    
    @pytest.mark.asyncio
    async def test_aimusic_api_song_generation(self):
        """
        Test song generation using AI Music API service.
        
        CREDENTIALS NEEDED:
        - Set AIMUSIC_API_KEY environment variable
        - Get API key from: https://aimusicapi.ai/
        """
        api_key = os.getenv('AIMUSIC_API_KEY')
        
        if not api_key:
            pytest.skip("AIMUSIC_API_KEY not set. Get it from https://aimusicapi.ai/")
        
        url = 'https://api.aimusicapi.com/v1/suno/create'
        
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'custom_mode': False,
            'gpt_description_prompt': 'An epic orchestral piece about conquering bugs',
            'make_instrumental': False,
            'mv': 'chirp-v4',
            'title': 'Test Song - AI Music API'
        }
        
        print("\n🎵 Testing AI Music API...")
        print(f"Endpoint: {url}")
        print(f"Data: {data}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=data) as response:
                print(f"Response Status: {response.status}")
                response_text = await response.text()
                print(f"Response: {response_text[:500]}")
                
                assert response.status in [200, 201, 202], f"Failed with status {response.status}: {response_text}"
                
                result = await response.json()
                print(f"✅ Success! Result: {result}")
                
                # Verify we got task data
                assert result is not None
                assert isinstance(result, dict)


class TestPiAPI:
    """Test PiAPI service (existing integration)"""
    
    @pytest.mark.asyncio
    async def test_piapi_song_generation(self):
        """
        Test song generation using PiAPI service.
        
        CREDENTIALS NEEDED:
        - Set PIAPI_KEY environment variable
        - Get API key from: https://piapi.ai/suno-api
        - Note: This is a paid service
        """
        api_key = os.getenv('PIAPI_KEY')
        
        if not api_key:
            pytest.skip("PIAPI_KEY not set. Get it from https://piapi.ai/suno-api")
        
        url = 'https://api.piapi.ai/api/suno/v1/music'
        
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-API-Key': api_key
        }
        
        data = {
            'custom_mode': False,
            'mv': 'chirp-v3-5',
            'input': {
                'title': 'Test Song - PiAPI',
                'tags': 'upbeat, electronic',
                'gpt_description_prompt': 'A high-energy electronic track about debugging code'
            }
        }
        
        print("\n🎵 Testing PiAPI...")
        print(f"Endpoint: {url}")
        print(f"Data: {data}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=data) as response:
                print(f"Response Status: {response.status}")
                response_text = await response.text()
                print(f"Response: {response_text[:500]}")
                
                assert response.status in [200, 201, 202], f"Failed with status {response.status}: {response_text}"
                
                result = await response.json()
                print(f"✅ Success! Result: {result}")
                
                # Verify we got task_id
                assert result is not None
                assert isinstance(result, dict)
                if 'data' in result:
                    assert 'task_id' in result['data'], "Expected task_id in response"
                    print(f"Task ID: {result['data']['task_id']}")


class TestSunoAPIOrgGateway:
    """Test sunoapi.org gateway endpoint (third-party service)"""
    
    @pytest.mark.asyncio
    async def test_sunoapi_org_gateway_song_generation(self):
        """
        Test song generation using sunoapi.org gateway endpoint.
        This is a different endpoint from the same third-party service.
        
        CREDENTIALS NEEDED:
        - Set SUNOAPI_ORG_KEY environment variable
        - Get API key from: https://sunoapi.org/
        """
        api_key = os.getenv('SUNOAPI_ORG_KEY')
        
        if not api_key:
            pytest.skip("SUNOAPI_ORG_KEY not set. Get it from https://sunoapi.org/")
        
        # Based on the docs at https://docs.sunoapi.org/
        url = 'https://api.sunoapi.org/api/v1/gateway/generate/music'
        
        headers = {
            'api-key': api_key,
            'Content-Type': 'application/json'
        }
        
        data = {
            'title': 'Test Song - SunoAPI.org',
            'tags': 'folk, acoustic',
            'prompt': 'A warm acoustic folk song about teamwork and perseverance',
            'mv': 'chirp-v3-5'
        }
        
        print("\n🎵 Testing SunoAPI.org Gateway (third-party)...")
        print(f"Endpoint: {url}")
        print(f"Data: {data}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=data) as response:
                print(f"Response Status: {response.status}")
                response_text = await response.text()
                print(f"Response: {response_text[:500]}")
                
                assert response.status in [200, 201, 202], f"Failed with status {response.status}: {response_text}"
                
                result = await response.json()
                print(f"✅ Success! Result: {result}")
                
                # Verify we got some response data
                assert result is not None
                assert isinstance(result, dict)


# Utility function to run a specific test manually
async def manual_test_runner(test_name: str):
    """Helper function to run individual tests manually"""
    test_classes = {
        'sunoapi_org': TestSunoAPIOrgService(),
        'cookie': TestDirectCookieBasedAPI(),
        'aimusic': TestAIMusicAPI(),
        'piapi': TestPiAPI(),
        'sunoapi_org_gateway': TestSunoAPIOrgGateway()
    }
    
    if test_name not in test_classes:
        print(f"Unknown test: {test_name}")
        print(f"Available tests: {', '.join(test_classes.keys())}")
        return
    
    test_instance = test_classes[test_name]
    test_method = list(filter(lambda x: x.startswith('test_'), dir(test_instance)))[0]
    
    print(f"\n{'='*60}")
    print(f"Running: {test_name}")
    print(f"{'='*60}")
    
    try:
        await getattr(test_instance, test_method)()
        print(f"\n✅ {test_name} PASSED!")
    except Exception as e:
        print(f"\n❌ {test_name} FAILED: {e}")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        test_name = sys.argv[1]
        asyncio.run(manual_test_runner(test_name))
    else:
        print("🎵 Suno API Integration Test Suite")
        print("\n⚠️  NOTE: Suno has NO official public API. All options are third-party or browser-based.")
        print("\nAvailable approaches to test:")
        print("  1. sunoapi_org         - SunoAPI.org Service (third-party)")
        print("  2. cookie              - Direct Cookie-Based (your Suno account)")
        print("  3. aimusic             - AI Music API Service (third-party)")
        print("  4. piapi               - PiAPI Service (third-party)")
        print("  5. sunoapi_org_gateway - SunoAPI.org Gateway (third-party)")
        print("\nRun with: python -m tests.integration.test_suno_approaches <test_name>")
        print("Or with pytest: pytest tests/integration/test_suno_approaches.py -v -s")

