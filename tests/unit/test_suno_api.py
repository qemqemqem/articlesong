import pytest
from unittest.mock import patch, MagicMock, Mock, AsyncMock
import asyncio
import sys
import os

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'app'))

from sunoapi.piapi_to_suno import generate_audio


class TestSunoAPI:
    """Test suite for Suno API integration via PiAPI"""

    @pytest.mark.asyncio
    async def test_generate_audio_success(self):
        """Test successful audio generation"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit, \
             patch('sunoapi.piapi_to_suno.check_status') as mock_check:
            
            # Mock successful API responses
            mock_submit.return_value = {
                'data': {
                    'task_id': 'test-task-123'
                }
            }
            
            mock_check.return_value = {
                'data': {
                    'clips': {
                        'clip1': {
                            'audio_url': 'https://cdn1.suno.ai/12345678-1234-5678-9012-123456789012.mp3'
                        }
                    }
                }
            }
            
            # Test the function
            result = await generate_audio(lyrics="Test lyrics for a musical song", tags="musical")
            
            # Verify result
            assert result == 'https://cdn1.suno.ai/12345678-1234-5678-9012-123456789012.mp3'
            
            # Verify API was called correctly
            mock_submit.assert_called_once()
            mock_check.assert_called_once()

    def test_generate_audio_api_error(self):
        """Test handling of API errors"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock API error response
            mock_response = Mock()
            mock_response.status_code = 400
            mock_response.json.return_value = {
                'error': 'Invalid request',
                'message': 'Lyrics too long'
            }
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio("Test lyrics", "musical")
            
            # Should handle error gracefully
            assert result is None

    def test_generate_audio_network_error(self):
        """Test handling of network errors"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock network error
            mock_post.side_effect = Exception("Connection failed")
            
            # Test the function
            result = generate_audio("Test lyrics", "musical")
            
            # Should handle network error gracefully
            assert result is None

    def test_generate_audio_timeout(self):
        """Test handling of request timeouts"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock timeout error
            import requests
            mock_post.side_effect = requests.exceptions.Timeout("Request timed out")
            
            # Test the function
            result = generate_audio("Test lyrics", "musical")
            
            # Should handle timeout gracefully
            assert result is None

    def test_generate_audio_rate_limit(self):
        """Test handling of rate limit errors"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock rate limit response
            mock_response = Mock()
            mock_response.status_code = 429
            mock_response.json.return_value = {
                'error': 'Rate limit exceeded',
                'retry_after': 60
            }
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio("Test lyrics", "musical")
            
            # Should handle rate limit gracefully
            assert result is None

    def test_generate_audio_different_styles(self):
        """Test audio generation with different song styles"""
        styles = ["musical", "spoken", "meme", "informative", "cute", "straight"]
        
        for style in styles:
            with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
                # Mock successful response
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    'success': True,
                    'audio_url': f'https://cdn1.suno.ai/{style}-12345678.mp3',
                    'id': f'{style}-12345678',
                    'status': 'complete'
                }
                mock_post.return_value = mock_response
                
                # Test the function
                result = generate_audio(f"Test lyrics for {style} song", style)
                
                # Verify result
                assert result == f'https://cdn1.suno.ai/{style}-12345678.mp3'
                
                # Verify correct style was sent
                call_args = mock_post.call_args
                assert call_args.kwargs['json']['style'] == style

    def test_generate_audio_long_lyrics(self):
        """Test audio generation with long lyrics"""
        long_lyrics = "This is a very long lyric. " * 100  # ~2700 characters
        
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock successful response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                'success': True,
                'audio_url': 'https://cdn1.suno.ai/long-song-12345678.mp3',
                'id': 'long-song-12345678',
                'status': 'complete'
            }
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio(long_lyrics, "musical")
            
            # Should handle long lyrics
            assert result == 'https://cdn1.suno.ai/long-song-12345678.mp3'
            
            # Verify full lyrics were sent
            call_args = mock_post.call_args
            assert call_args.kwargs['json']['lyrics'] == long_lyrics

    def test_generate_audio_unicode_lyrics(self):
        """Test audio generation with unicode lyrics"""
        unicode_lyrics = "🎵 Hello world! 世界 café naïve résumé 🎵"
        
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock successful response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                'success': True,
                'audio_url': 'https://cdn1.suno.ai/unicode-song-12345678.mp3',
                'id': 'unicode-song-12345678',
                'status': 'complete'
            }
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio(unicode_lyrics, "musical")
            
            # Should handle unicode lyrics
            assert result == 'https://cdn1.suno.ai/unicode-song-12345678.mp3'
            
            # Verify unicode lyrics were sent correctly
            call_args = mock_post.call_args
            assert call_args.kwargs['json']['lyrics'] == unicode_lyrics

    def test_generate_audio_empty_lyrics(self):
        """Test audio generation with empty lyrics"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock error response for empty lyrics
            mock_response = Mock()
            mock_response.status_code = 400
            mock_response.json.return_value = {
                'error': 'Invalid request',
                'message': 'Lyrics cannot be empty'
            }
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio("", "musical")
            
            # Should handle empty lyrics gracefully
            assert result is None

    def test_generate_audio_invalid_style(self):
        """Test audio generation with invalid style"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock error response for invalid style
            mock_response = Mock()
            mock_response.status_code = 400
            mock_response.json.return_value = {
                'error': 'Invalid request',
                'message': 'Invalid style parameter'
            }
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio("Test lyrics", "invalid_style")
            
            # Should handle invalid style gracefully
            assert result is None

    def test_generate_audio_malformed_response(self):
        """Test handling of malformed API responses"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock malformed response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                # Missing required fields
                'status': 'complete'
            }
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio("Test lyrics", "musical")
            
            # Should handle malformed response gracefully
            assert result is None

    def test_generate_audio_json_decode_error(self):
        """Test handling of JSON decode errors"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock response with invalid JSON
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.side_effect = ValueError("Invalid JSON")
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio("Test lyrics", "musical")
            
            # Should handle JSON decode error gracefully
            assert result is None

    def test_generate_audio_pending_status(self):
        """Test handling of pending audio generation"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock pending response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                'success': True,
                'id': 'pending-12345678',
                'status': 'pending'
            }
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio("Test lyrics", "musical")
            
            # Should handle pending status (implementation dependent)
            # This depends on how the actual API handles pending requests
            assert result is None or isinstance(result, str)

    def test_generate_audio_with_api_key(self):
        """Test that API key is properly included in requests"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post, \
             patch('os.environ.get') as mock_env:
            
            # Mock API key
            mock_env.return_value = "test_api_key"
            
            # Mock successful response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                'success': True,
                'audio_url': 'https://cdn1.suno.ai/12345678.mp3',
                'id': '12345678',
                'status': 'complete'
            }
            mock_post.return_value = mock_response
            
            # Test the function
            result = generate_audio("Test lyrics", "musical")
            
            # Verify API key was used
            call_args = mock_post.call_args
            assert 'headers' in call_args.kwargs
            headers = call_args.kwargs['headers']
            assert 'Authorization' in headers or 'X-API-Key' in headers or 'api_key' in call_args.kwargs['json']

    def test_generate_audio_request_parameters(self):
        """Test that request parameters are correctly formatted"""
        with patch('sunoapi.piapi_to_suno.requests.post') as mock_post:
            # Mock successful response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                'success': True,
                'audio_url': 'https://cdn1.suno.ai/12345678.mp3',
                'id': '12345678',
                'status': 'complete'
            }
            mock_post.return_value = mock_response
            
            # Test the function
            lyrics = "Test lyrics for parameter validation"
            style = "musical"
            result = generate_audio(lyrics, style)
            
            # Verify request parameters
            call_args = mock_post.call_args
            
            # Check URL
            assert call_args.args[0] or call_args.kwargs.get('url')
            
            # Check request format
            assert 'json' in call_args.kwargs
            json_data = call_args.kwargs['json']
            assert 'lyrics' in json_data
            assert 'style' in json_data
            assert json_data['lyrics'] == lyrics
            assert json_data['style'] == style
            
            # Check headers
            assert 'headers' in call_args.kwargs
            headers = call_args.kwargs['headers']
            assert 'Content-Type' in headers
            assert headers['Content-Type'] == 'application/json'


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
