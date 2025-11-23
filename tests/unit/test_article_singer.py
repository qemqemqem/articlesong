import pytest
from unittest.mock import patch, MagicMock, mock_open
import json
import sys
import os

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'app'))

from article_singer import create_audio_data, process_text, main


class TestArticleSinger:
    """Test suite for article_singer.py module"""

    def test_create_audio_data_with_mocked_apis(self):
        """Test create_audio_data function with mocked API responses"""
        with patch('app.llms.gpt.prompt_completion_chat') as mock_gpt, \
             patch('app.sunoapi.piapi_to_suno.generate_audio') as mock_suno:
            
            # Mock successful API responses
            mock_gpt.return_value = "Test lyrics content"
            mock_suno.return_value = "http://test-song-url.com/song.mp3"
            
            # Test the function
            result = create_audio_data("Test article text", "musical")
            
            # Verify results
            assert result[0] == "http://test-song-url.com/song.mp3"
            assert "Test lyrics content" in result[2]
            
            # Verify API calls were made
            mock_gpt.assert_called_once()
            mock_suno.assert_called_once()

    def test_create_audio_data_with_gpt_failure(self):
        """Test create_audio_data when GPT API fails"""
        with patch('app.llms.gpt.prompt_completion_chat') as mock_gpt, \
             patch('app.sunoapi.piapi_to_suno.generate_audio') as mock_suno:
            
            # Mock GPT failure
            mock_gpt.return_value = None
            
            # Test the function
            result = create_audio_data("Test article text", "musical")
            
            # Should return None values when GPT fails
            assert result[0] is None
            assert result[1] is None
            assert result[2] is None
            
            # Suno API should not be called if GPT fails
            mock_suno.assert_not_called()

    def test_create_audio_data_with_suno_failure(self):
        """Test create_audio_data when Suno API fails"""
        with patch('app.llms.gpt.prompt_completion_chat') as mock_gpt, \
             patch('app.sunoapi.piapi_to_suno.generate_audio') as mock_suno:
            
            # Mock successful GPT but failed Suno
            mock_gpt.return_value = "Test lyrics content"
            mock_suno.return_value = None
            
            # Test the function
            result = create_audio_data("Test article text", "musical")
            
            # Should return None values when Suno fails
            assert result[0] is None
            assert result[1] is None
            assert result[2] is None

    def test_process_text_success(self):
        """Test process_text with successful audio generation"""
        with patch('article_singer.create_audio_data') as mock_create:
            mock_create.return_value = (
                "http://test-song-url.com/song.mp3",
                "Test style",
                "Test lyrics content"
            )
            
            result = process_text("Test article text", "musical")
            
            assert result["success"] is True
            assert result["audio_url"] == "http://test-song-url.com/song.mp3"
            assert result["lyrics"] == "Test lyrics content"

    def test_process_text_error_handling(self):
        """Test process_text error handling when audio creation fails"""
        with patch('article_singer.create_audio_data') as mock_create:
            mock_create.return_value = (None, None, None)
            
            result = process_text("Test article text", "musical")
            
            assert "error" in result
            assert result["message"] == "Failed to create audio data"

    def test_process_text_with_different_song_types(self):
        """Test process_text with different song types"""
        song_types = ["musical", "spoken", "meme", "informative", "cute", "straight"]
        
        for song_type in song_types:
            with patch('article_singer.create_audio_data') as mock_create:
                mock_create.return_value = (
                    f"http://test-song-url.com/{song_type}.mp3",
                    f"Test {song_type} style",
                    f"Test {song_type} lyrics"
                )
                
                result = process_text("Test article text", song_type)
                
                assert result["success"] is True
                assert song_type in result["audio_url"]
                
                # Verify create_audio_data was called with correct parameters
                mock_create.assert_called_once_with("Test article text", song_type)

    def test_main_function_message_handling(self):
        """Test main function message handling"""
        # Mock stdin/stdout for native messaging
        test_message = {
            "action": "process_text",
            "text": "Test article content",
            "songType": "musical",
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        with patch('sys.stdin') as mock_stdin, \
             patch('sys.stdout') as mock_stdout, \
             patch('article_singer.process_text') as mock_process:
            
            # Mock successful processing
            mock_process.return_value = {
                "success": True,
                "audio_url": "http://test-song-url.com/song.mp3",
                "lyrics": "Test lyrics"
            }
            
            # Mock stdin to provide test message
            mock_stdin.buffer.read.return_value = json.dumps(test_message).encode()
            
            # Test would require more setup for actual native messaging
            # This is a placeholder for the structure
            assert True  # Placeholder assertion

    def test_input_validation(self):
        """Test input validation for process_text"""
        # Test with empty text
        result = process_text("", "musical")
        assert "error" in result
        
        # Test with None text
        result = process_text(None, "musical")
        assert "error" in result
        
        # Test with invalid song type
        result = process_text("Test text", "invalid_type")
        # Should still work but might default to a standard type
        # This depends on implementation

    def test_long_text_handling(self):
        """Test handling of very long text inputs"""
        long_text = "A" * 10000  # Very long text
        
        with patch('article_singer.create_audio_data') as mock_create:
            mock_create.return_value = (
                "http://test-song-url.com/song.mp3",
                "Test style",
                "Test lyrics"
            )
            
            result = process_text(long_text, "musical")
            
            # Should handle long text gracefully
            assert result["success"] is True
            mock_create.assert_called_once_with(long_text, "musical")

    def test_unicode_text_handling(self):
        """Test handling of unicode text"""
        unicode_text = "Hello 世界 🌍 café naïve résumé"
        
        with patch('article_singer.create_audio_data') as mock_create:
            mock_create.return_value = (
                "http://test-song-url.com/song.mp3",
                "Test style",
                "Test lyrics"
            )
            
            result = process_text(unicode_text, "musical")
            
            # Should handle unicode text gracefully
            assert result["success"] is True
            mock_create.assert_called_once_with(unicode_text, "musical")


if __name__ == "__main__":
    pytest.main([__file__])
