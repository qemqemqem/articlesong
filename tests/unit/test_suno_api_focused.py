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
    async def test_generate_audio_success_with_lyrics(self):
        """Test successful audio generation with lyrics"""
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

    @pytest.mark.asyncio
    async def test_generate_audio_success_with_prompt(self):
        """Test successful audio generation with prompt"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit, \
             patch('sunoapi.piapi_to_suno.check_status') as mock_check:
            
            # Mock successful API responses
            mock_submit.return_value = {
                'data': {
                    'task_id': 'test-task-456'
                }
            }
            
            mock_check.return_value = {
                'data': {
                    'clips': {
                        'clip1': {
                            'audio_url': 'https://cdn1.suno.ai/prompt-generated-song.mp3'
                        }
                    }
                }
            }
            
            # Test the function
            result = await generate_audio(prompt="A cheerful song about testing", tags="cheerful")
            
            # Verify result
            assert result == 'https://cdn1.suno.ai/prompt-generated-song.mp3'
            
            # Verify API was called correctly
            mock_submit.assert_called_once()
            mock_check.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_audio_no_clips_timeout(self):
        """Test timeout when no clips are returned"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit, \
             patch('sunoapi.piapi_to_suno.check_status') as mock_check:
            
            # Mock successful submission but no clips
            mock_submit.return_value = {
                'data': {
                    'task_id': 'test-task-789'
                }
            }
            
            mock_check.return_value = {
                'data': {
                    'clips': {}  # No clips available
                }
            }
            
            # Test the function should timeout
            with pytest.raises(Exception, match="Timed out waiting for audio URL"):
                await generate_audio(lyrics="Test lyrics", tags="test", max_retries=2)

    @pytest.mark.asyncio
    async def test_generate_audio_missing_both_prompt_and_lyrics(self):
        """Test error when both prompt and lyrics are missing"""
        with pytest.raises(ValueError, match="Either 'prompt' or 'lyrics' must be provided"):
            await generate_audio()

    @pytest.mark.asyncio
    async def test_generate_audio_input_truncation(self):
        """Test that long inputs are properly truncated"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit, \
             patch('sunoapi.piapi_to_suno.check_status') as mock_check:
            
            # Mock successful API responses
            mock_submit.return_value = {
                'data': {
                    'task_id': 'test-task-truncate'
                }
            }
            
            mock_check.return_value = {
                'data': {
                    'clips': {
                        'clip1': {
                            'audio_url': 'https://cdn1.suno.ai/truncated-song.mp3'
                        }
                    }
                }
            }
            
            # Test with very long lyrics (should be truncated)
            very_long_lyrics = "This is a very long lyric. " * 200  # Way over 3000 chars
            result = await generate_audio(lyrics=very_long_lyrics, tags="test")
            
            # Verify result
            assert result == 'https://cdn1.suno.ai/truncated-song.mp3'
            
            # Verify the lyrics were truncated in the call
            mock_submit.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_audio_with_environment_variable(self):
        """Test that PIAPI_KEY environment variable is required"""
        with patch('sunoapi.piapi_to_suno.PIAPI_KEY', None):
            with pytest.raises(ValueError, match="PIAPI_KEY environment variable is not set"):
                await generate_audio(lyrics="Test lyrics", tags="test")

    @pytest.mark.asyncio
    async def test_generate_audio_submit_request_error(self):
        """Test error handling in submit_request"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit:
            # Mock submission error
            mock_submit.side_effect = Exception("API submission failed")
            
            with pytest.raises(Exception, match="API submission failed"):
                await generate_audio(lyrics="Test lyrics", tags="test")

    @pytest.mark.asyncio
    async def test_generate_audio_check_status_error(self):
        """Test error handling in check_status"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit, \
             patch('sunoapi.piapi_to_suno.check_status') as mock_check:
            
            # Mock successful submission but status check error
            mock_submit.return_value = {
                'data': {
                    'task_id': 'test-task-error'
                }
            }
            
            mock_check.side_effect = Exception("Status check failed")
            
            with pytest.raises(Exception, match="Status check failed"):
                await generate_audio(lyrics="Test lyrics", tags="test")

    @pytest.mark.asyncio
    async def test_generate_audio_with_title_generation(self):
        """Test automatic title generation from lyrics/prompt"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit, \
             patch('sunoapi.piapi_to_suno.check_status') as mock_check:
            
            # Mock successful API responses
            mock_submit.return_value = {
                'data': {
                    'task_id': 'test-task-title'
                }
            }
            
            mock_check.return_value = {
                'data': {
                    'clips': {
                        'clip1': {
                            'audio_url': 'https://cdn1.suno.ai/auto-title-song.mp3'
                        }
                    }
                }
            }
            
            # Test with lyrics (should generate title from lyrics)
            result = await generate_audio(lyrics="This is a test song about testing", tags="test")
            
            # Verify result
            assert result == 'https://cdn1.suno.ai/auto-title-song.mp3'
            
            # Verify API was called
            mock_submit.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_audio_unicode_handling(self):
        """Test handling of unicode characters in lyrics"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit, \
             patch('sunoapi.piapi_to_suno.check_status') as mock_check:
            
            # Mock successful API responses
            mock_submit.return_value = {
                'data': {
                    'task_id': 'test-task-unicode'
                }
            }
            
            mock_check.return_value = {
                'data': {
                    'clips': {
                        'clip1': {
                            'audio_url': 'https://cdn1.suno.ai/unicode-song.mp3'
                        }
                    }
                }
            }
            
            # Test with unicode lyrics
            unicode_lyrics = "🎵 Hello world! 世界 café naïve résumé 🎵"
            result = await generate_audio(lyrics=unicode_lyrics, tags="international")
            
            # Verify result
            assert result == 'https://cdn1.suno.ai/unicode-song.mp3'
            
            # Verify API was called
            mock_submit.assert_called_once()
            mock_check.assert_called_once()

    def test_sync_wrapper_for_generate_audio(self):
        """Test creating a synchronous wrapper for the async function"""
        async def async_test():
            with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit, \
                 patch('sunoapi.piapi_to_suno.check_status') as mock_check:
                
                # Mock successful API responses
                mock_submit.return_value = {
                    'data': {
                        'task_id': 'test-task-sync'
                    }
                }
                
                mock_check.return_value = {
                    'data': {
                        'clips': {
                            'clip1': {
                                'audio_url': 'https://cdn1.suno.ai/sync-wrapper-song.mp3'
                            }
                        }
                    }
                }
                
                # Test the function
                result = await generate_audio(lyrics="Test sync wrapper", tags="test")
                return result
        
        # Run the async function synchronously
        result = asyncio.run(async_test())
        
        # Verify result
        assert result == 'https://cdn1.suno.ai/sync-wrapper-song.mp3'


# Helper function to run async tests synchronously for integration with the main application
def generate_audio_sync(lyrics=None, prompt=None, title="", tags="spoken word"):
    """
    Synchronous wrapper for the async generate_audio function.
    This is what the main application would use.
    """
    return asyncio.run(generate_audio(lyrics=lyrics, prompt=prompt, title=title, tags=tags))


class TestSunoAPISyncWrapper:
    """Test the synchronous wrapper for use in the main application"""
    
    def test_sync_wrapper_success(self):
        """Test the synchronous wrapper with successful generation"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit, \
             patch('sunoapi.piapi_to_suno.check_status') as mock_check:
            
            # Mock successful API responses
            mock_submit.return_value = {
                'data': {
                    'task_id': 'test-task-sync-wrapper'
                }
            }
            
            mock_check.return_value = {
                'data': {
                    'clips': {
                        'clip1': {
                            'audio_url': 'https://cdn1.suno.ai/sync-wrapper-test.mp3'
                        }
                    }
                }
            }
            
            # Test the synchronous wrapper
            result = generate_audio_sync(lyrics="Test synchronous wrapper", tags="test")
            
            # Verify result
            assert result == 'https://cdn1.suno.ai/sync-wrapper-test.mp3'
            
            # Verify API was called correctly
            mock_submit.assert_called_once()
            mock_check.assert_called_once()

    def test_sync_wrapper_error(self):
        """Test the synchronous wrapper with error handling"""
        with patch('sunoapi.piapi_to_suno.submit_request') as mock_submit:
            # Mock submission error
            mock_submit.side_effect = Exception("Sync wrapper test error")
            
            with pytest.raises(Exception, match="Sync wrapper test error"):
                generate_audio_sync(lyrics="Test error", tags="test")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
