import pytest
from unittest.mock import patch, MagicMock
import sys
import os

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'app'))

from llms.gpt import prompt_completion_chat


class TestGPTIntegration:
    """Test suite for LLM integration module (using litellm)"""

    def test_prompt_completion_chat_success(self):
        """Test successful Claude API call via litellm"""
        with patch('llms.gpt.completion') as mock_completion:
            # Mock successful API response
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = "Generated lyrics content"
            mock_completion.return_value = mock_response
            
            # Test the function
            result = prompt_completion_chat("Test article text", "musical")
            
            # Verify result
            assert result == "Generated lyrics content"
            
            # Verify API was called correctly
            mock_completion.assert_called_once()

    def test_prompt_completion_chat_api_error(self):
        """Test Claude API error handling via litellm"""
        with patch('llms.gpt.completion') as mock_completion:
            # Mock API error
            mock_completion.side_effect = Exception("API Error")
            
            # Test the function - expect exception to be raised
            with pytest.raises(Exception):
                prompt_completion_chat("Test article text", "musical")

    def test_prompt_completion_chat_with_different_song_types(self):
        """Test Claude integration via litellm with different song types"""
        song_types = ["musical", "spoken", "meme", "informative", "cute", "straight"]
        
        for song_type in song_types:
            with patch('llms.gpt.completion') as mock_completion:
                # Mock successful API response
                mock_response = MagicMock()
                mock_response.choices = [MagicMock()]
                mock_response.choices[0].message.content = f"Generated {song_type} lyrics"
                mock_completion.return_value = mock_response
                
                # Test the function
                result = prompt_completion_chat("Test article text", song_type)
                
                # Verify result
                assert result == f"Generated {song_type} lyrics"
                
                # Verify API was called
                mock_completion.assert_called_once()

    def test_prompt_completion_chat_empty_response(self):
        """Test handling of empty API response"""
        with patch('llms.gpt.completion') as mock_completion:
            # Mock empty response
            mock_response = MagicMock()
            mock_response.choices = []
            mock_completion.return_value = mock_response
            
            # Test the function - will raise IndexError due to empty choices
            with pytest.raises(IndexError):
                prompt_completion_chat("Test article text", "musical")

    def test_prompt_completion_chat_rate_limit(self):
        """Test handling of rate limit errors"""
        with patch('llms.gpt.completion') as mock_completion:
            # Mock rate limit error
            mock_completion.side_effect = Exception("Rate limit exceeded")
            
            # Test the function - should raise exception
            with pytest.raises(Exception):
                prompt_completion_chat("Test article text", "musical")

    def test_prompt_completion_chat_with_long_text(self):
        """Test Claude integration via litellm with very long text"""
        long_text = "A" * 10000  # Very long text
        
        with patch('llms.gpt.completion') as mock_completion:
            # Mock successful API response
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = "Generated lyrics from long text"
            mock_completion.return_value = mock_response
            
            # Test the function
            result = prompt_completion_chat(long_text, "musical")
            
            # Should handle long text
            assert result == "Generated lyrics from long text"

    def test_prompt_completion_chat_with_unicode(self):
        """Test Claude integration via litellm with unicode text"""
        unicode_text = "Hello 世界 🌍 café naïve résumé"
        
        with patch('llms.gpt.completion') as mock_completion:
            # Mock successful API response
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = "Generated lyrics with unicode"
            mock_completion.return_value = mock_response
            
            # Test the function
            result = prompt_completion_chat(unicode_text, "musical")
            
            # Should handle unicode text
            assert result == "Generated lyrics with unicode"

    def test_prompt_completion_chat_authentication_error(self):
        """Test handling of authentication errors"""
        with patch('llms.gpt.completion') as mock_completion:
            # Mock authentication error
            mock_completion.side_effect = Exception("Invalid API key")
            
            # Test the function - should raise exception
            with pytest.raises(Exception):
                prompt_completion_chat("Test article text", "musical")

    def test_prompt_completion_chat_timeout(self):
        """Test handling of timeout errors"""
        with patch('llms.gpt.completion') as mock_completion:
            # Mock timeout error
            import requests
            mock_completion.side_effect = requests.exceptions.Timeout("Request timed out")
            
            # Test the function - should raise exception
            with pytest.raises(requests.exceptions.Timeout):
                prompt_completion_chat("Test article text", "musical")

    def test_prompt_structure_validation(self):
        """Test that prompts are structured correctly for different song types"""
        with patch('llms.gpt.completion') as mock_completion:
            # Mock successful API response
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = "Generated lyrics"
            mock_completion.return_value = mock_response
            
            # Test the function
            result = prompt_completion_chat("Test article text", "musical")
            
            # Verify the prompt structure by checking the call arguments
            call_args = mock_completion.call_args
            assert call_args is not None
            
            # Check that messages were provided
            assert 'messages' in call_args.kwargs
            messages = call_args.kwargs['messages']
            assert len(messages) > 0
            
            # Check that the text content is included in the messages
            message_content = str(messages)
            assert "Test article text" in message_content


if __name__ == "__main__":
    pytest.main([__file__])
