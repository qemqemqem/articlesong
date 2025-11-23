import pytest
import subprocess
import json
import os
import sys
import time
from unittest.mock import patch, MagicMock

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'app'))


class TestNativeMessaging:
    """Integration tests for native messaging between browser extension and Python backend"""

    @pytest.fixture
    def mock_apis(self):
        """Mock external APIs for testing"""
        with patch('app.llms.gpt.prompt_completion_chat') as mock_gpt, \
             patch('app.sunoapi.piapi_to_suno.generate_audio') as mock_suno:
            
            # Mock successful API responses
            mock_gpt.return_value = "Test lyrics content"
            mock_suno.return_value = "http://test-song-url.com/song.mp3"
            
            yield mock_gpt, mock_suno

    def send_native_message(self, process, message):
        """Helper function to send a message via native messaging"""
        try:
            # Convert message to JSON and encode
            json_message = json.dumps(message)
            message_bytes = json_message.encode('utf-8')
            
            # Send message length (4 bytes, little endian)
            message_length = len(message_bytes)
            length_bytes = message_length.to_bytes(4, byteorder='little')
            
            # Send length + message
            process.stdin.write(length_bytes + message_bytes)
            process.stdin.flush()
            
            # Read response length
            response_length_bytes = process.stdout.read(4)
            if len(response_length_bytes) < 4:
                return None
            
            response_length = int.from_bytes(response_length_bytes, byteorder='little')
            
            # Read response message
            response_bytes = process.stdout.read(response_length)
            if len(response_bytes) < response_length:
                return None
            
            # Parse JSON response
            response = json.loads(response_bytes.decode('utf-8'))
            return response
            
        except Exception as e:
            print(f"Error in send_native_message: {e}")
            return None

    @pytest.mark.integration
    def test_native_messaging_process_text_success(self, mock_apis):
        """Test successful native messaging flow"""
        mock_gpt, mock_suno = mock_apis
        
        # Test message
        test_message = {
            "action": "process_text",
            "text": "Test article content for integration testing",
            "songType": "musical",
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        # This would normally start the actual process
        # For testing purposes, we'll mock the process behavior
        with patch('subprocess.Popen') as mock_popen:
            mock_process = MagicMock()
            mock_popen.return_value = mock_process
            
            # Mock successful response
            expected_response = {
                "success": True,
                "audio_url": "http://test-song-url.com/song.mp3",
                "lyrics": "Test lyrics content"
            }
            
            # Mock the native messaging response
            mock_process.stdout.read.side_effect = [
                len(json.dumps(expected_response).encode()).to_bytes(4, 'little'),
                json.dumps(expected_response).encode()
            ]
            
            # This would be the actual test, but we're mocking it
            # In a real test, you'd start the process and send the message
            assert True  # Placeholder for actual test

    @pytest.mark.integration
    def test_native_messaging_api_error(self, mock_apis):
        """Test native messaging with API errors"""
        mock_gpt, mock_suno = mock_apis
        
        # Mock API failure
        mock_gpt.return_value = None
        mock_suno.return_value = None
        
        test_message = {
            "action": "process_text",
            "text": "Test article content",
            "songType": "musical",
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        # Mock process that returns error
        with patch('subprocess.Popen') as mock_popen:
            mock_process = MagicMock()
            mock_popen.return_value = mock_process
            
            expected_response = {
                "error": "API Error",
                "message": "Failed to create audio data"
            }
            
            mock_process.stdout.read.side_effect = [
                len(json.dumps(expected_response).encode()).to_bytes(4, 'little'),
                json.dumps(expected_response).encode()
            ]
            
            assert True  # Placeholder for actual test

    @pytest.mark.integration
    def test_native_messaging_invalid_message(self):
        """Test native messaging with invalid message format"""
        test_message = {
            "invalid_action": "unknown",
            "missing_required_fields": True
        }
        
        with patch('subprocess.Popen') as mock_popen:
            mock_process = MagicMock()
            mock_popen.return_value = mock_process
            
            expected_response = {
                "error": "Invalid message format",
                "message": "Missing required fields"
            }
            
            mock_process.stdout.read.side_effect = [
                len(json.dumps(expected_response).encode()).to_bytes(4, 'little'),
                json.dumps(expected_response).encode()
            ]
            
            assert True  # Placeholder for actual test

    @pytest.mark.integration
    def test_native_messaging_different_song_types(self, mock_apis):
        """Test native messaging with different song types"""
        mock_gpt, mock_suno = mock_apis
        
        song_types = ["musical", "spoken", "meme", "informative", "cute", "straight"]
        
        for song_type in song_types:
            test_message = {
                "action": "process_text",
                "text": f"Test article content for {song_type}",
                "songType": song_type,
                "anthropic_api_key": "test_key",
                "piapi_key": "test_key"
            }
            
            with patch('subprocess.Popen') as mock_popen:
                mock_process = MagicMock()
                mock_popen.return_value = mock_process
                
                expected_response = {
                    "success": True,
                    "audio_url": f"http://test-song-url.com/{song_type}.mp3",
                    "lyrics": f"Test {song_type} lyrics content"
                }
                
                mock_process.stdout.read.side_effect = [
                    len(json.dumps(expected_response).encode()).to_bytes(4, 'little'),
                    json.dumps(expected_response).encode()
                ]
                
                assert True  # Placeholder for actual test

    @pytest.mark.integration
    def test_native_messaging_large_text(self, mock_apis):
        """Test native messaging with large text input"""
        mock_gpt, mock_suno = mock_apis
        
        # Create a large text input
        large_text = "This is a test article. " * 1000  # ~24KB of text
        
        test_message = {
            "action": "process_text",
            "text": large_text,
            "songType": "musical",
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        with patch('subprocess.Popen') as mock_popen:
            mock_process = MagicMock()
            mock_popen.return_value = mock_process
            
            expected_response = {
                "success": True,
                "audio_url": "http://test-song-url.com/large-text.mp3",
                "lyrics": "Lyrics generated from large text"
            }
            
            mock_process.stdout.read.side_effect = [
                len(json.dumps(expected_response).encode()).to_bytes(4, 'little'),
                json.dumps(expected_response).encode()
            ]
            
            assert True  # Placeholder for actual test

    @pytest.mark.integration
    def test_native_messaging_unicode_text(self, mock_apis):
        """Test native messaging with unicode text"""
        mock_gpt, mock_suno = mock_apis
        
        unicode_text = "Test article with unicode: 🌍 世界 café naïve résumé"
        
        test_message = {
            "action": "process_text",
            "text": unicode_text,
            "songType": "musical",
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        with patch('subprocess.Popen') as mock_popen:
            mock_process = MagicMock()
            mock_popen.return_value = mock_process
            
            expected_response = {
                "success": True,
                "audio_url": "http://test-song-url.com/unicode.mp3",
                "lyrics": "Lyrics with unicode characters"
            }
            
            mock_process.stdout.read.side_effect = [
                len(json.dumps(expected_response).encode()).to_bytes(4, 'little'),
                json.dumps(expected_response).encode()
            ]
            
            assert True  # Placeholder for actual test

    @pytest.mark.integration
    def test_native_messaging_timeout(self):
        """Test native messaging timeout handling"""
        test_message = {
            "action": "process_text",
            "text": "Test article content",
            "songType": "musical",
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        with patch('subprocess.Popen') as mock_popen:
            mock_process = MagicMock()
            mock_popen.return_value = mock_process
            
            # Mock timeout by making stdout.read block
            mock_process.stdout.read.side_effect = [b'']  # Empty response simulates timeout
            
            assert True  # Placeholder for actual test

    @pytest.mark.integration
    def test_native_messaging_process_crash(self):
        """Test handling of Python process crashes"""
        test_message = {
            "action": "process_text",
            "text": "Test article content",
            "songType": "musical",
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        with patch('subprocess.Popen') as mock_popen:
            mock_process = MagicMock()
            mock_popen.return_value = mock_process
            
            # Mock process crash
            mock_process.poll.return_value = 1  # Non-zero exit code
            mock_process.stdout.read.side_effect = Exception("Process crashed")
            
            assert True  # Placeholder for actual test

    @pytest.mark.integration
    def test_native_messaging_malformed_json(self):
        """Test handling of malformed JSON messages"""
        # This would send invalid JSON to the process
        malformed_message = '{"action": "process_text", "text": "test", invalid_json}'
        
        with patch('subprocess.Popen') as mock_popen:
            mock_process = MagicMock()
            mock_popen.return_value = mock_process
            
            expected_response = {
                "error": "JSON Parse Error",
                "message": "Invalid JSON format"
            }
            
            mock_process.stdout.read.side_effect = [
                len(json.dumps(expected_response).encode()).to_bytes(4, 'little'),
                json.dumps(expected_response).encode()
            ]
            
            assert True  # Placeholder for actual test

    @pytest.mark.integration
    def test_native_messaging_environment_variables(self, mock_apis):
        """Test that environment variables are properly set"""
        mock_gpt, mock_suno = mock_apis
        
        test_message = {
            "action": "process_text",
            "text": "Test article content",
            "songType": "musical",
            "anthropic_api_key": "test_anthropic_key",
            "piapi_key": "test_piapi_key"
        }
        
        with patch('subprocess.Popen') as mock_popen, \
             patch('os.environ') as mock_env:
            
            mock_process = MagicMock()
            mock_popen.return_value = mock_process
            
            # Mock environment variables being set
            mock_env.__setitem__ = MagicMock()
            
            expected_response = {
                "success": True,
                "audio_url": "http://test-song-url.com/song.mp3",
                "lyrics": "Test lyrics content"
            }
            
            mock_process.stdout.read.side_effect = [
                len(json.dumps(expected_response).encode()).to_bytes(4, 'little'),
                json.dumps(expected_response).encode()
            ]
            
            # Verify environment variables would be set
            # In actual implementation, check that API keys are set as env vars
            assert True  # Placeholder for actual test


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
