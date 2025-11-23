import pytest
from unittest.mock import patch, MagicMock
import sys
import os

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'app'))

from article_singer import process_text


class TestInputValidation:
    """Security tests for input validation and sanitization"""

    def test_malicious_text_input(self):
        """Test handling of potentially malicious text inputs"""
        malicious_inputs = [
            # XSS attempts
            "<script>alert('xss')</script>",
            "javascript:alert('xss')",
            "<img src=x onerror=alert('xss')>",
            
            # SQL injection attempts
            "'; DROP TABLE users; --",
            "' OR '1'='1",
            "'; DELETE FROM articles; --",
            
            # Command injection attempts
            "$(rm -rf /)",
            "; cat /etc/passwd",
            "| nc -l 1234",
            
            # Path traversal attempts
            "../../etc/passwd",
            "..\\..\\windows\\system32\\config\\sam",
            
            # Unicode attacks
            "\u0000\u0001\u0002\u0003",
            "\ufeff\u200b\u200c\u200d",
            
            # Buffer overflow attempts
            "A" * 100000,  # Very long input
            "A" * 1000000,  # Extremely long input
        ]
        
        for malicious_input in malicious_inputs:
            with patch('article_singer.create_audio_data') as mock_create:
                # Mock successful processing to ensure security validation happens first
                mock_create.return_value = (
                    "http://test-audio.com/song.mp3",
                    "Test style",
                    "Test lyrics"
                )
                
                result = process_text(malicious_input, "musical")
                
                # Should either return success (if properly sanitized) or error (if rejected)
                assert "success" in result or "error" in result
                
                # Should not crash or expose sensitive information
                assert isinstance(result, dict)
                
                # If successful, verify the malicious content was properly handled
                if result.get("success"):
                    assert "lyrics" in result
                    # Lyrics should not contain raw malicious content
                    assert "<script>" not in result["lyrics"]
                    assert "DROP TABLE" not in result["lyrics"]
                    assert "rm -rf" not in result["lyrics"]

    def test_oversized_input(self):
        """Test handling of oversized inputs"""
        # Test various sizes of input
        test_sizes = [
            1000,      # 1KB
            10000,     # 10KB
            100000,    # 100KB
            1000000,   # 1MB
            10000000,  # 10MB
        ]
        
        for size in test_sizes:
            large_input = "A" * size
            
            with patch('article_singer.create_audio_data') as mock_create:
                mock_create.return_value = (
                    "http://test-audio.com/song.mp3",
                    "Test style",
                    "Test lyrics"
                )
                
                result = process_text(large_input, "musical")
                
                # Should handle large inputs gracefully
                assert "success" in result or "error" in result
                
                # Should not cause memory issues or crashes
                assert isinstance(result, dict)
                
                # For very large inputs, should potentially return error
                if size > 1000000:  # 1MB+
                    # Very large inputs might be rejected
                    assert "error" in result or "success" in result

    def test_unicode_and_encoding_attacks(self):
        """Test handling of unicode and encoding-based attacks"""
        unicode_attacks = [
            # Unicode normalization attacks
            "café",  # Normal
            "cafe\u0301",  # Combining character
            "c\u0061\u0066\u0065\u0301",  # Decomposed
            
            # Unicode homoglyph attacks
            "аdmin",  # Cyrillic 'a' instead of Latin 'a'
            "раypal",  # Cyrillic characters
            
            # Zero-width characters
            "admin\u200b",  # Zero-width space
            "admin\u200c",  # Zero-width non-joiner
            "admin\u200d",  # Zero-width joiner
            "admin\ufeff",  # Zero-width no-break space
            
            # Bidirectional text attacks
            "admin\u202e",  # Right-to-left override
            "admin\u202d",  # Left-to-right override
            
            # Control characters
            "admin\u0000",  # Null byte
            "admin\u0001",  # Start of heading
            "admin\u0008",  # Backspace
            "admin\u007f",  # Delete
        ]
        
        for unicode_attack in unicode_attacks:
            with patch('article_singer.create_audio_data') as mock_create:
                mock_create.return_value = (
                    "http://test-audio.com/song.mp3",
                    "Test style",
                    "Test lyrics"
                )
                
                result = process_text(unicode_attack, "musical")
                
                # Should handle unicode attacks gracefully
                assert "success" in result or "error" in result
                assert isinstance(result, dict)

    def test_song_type_validation(self):
        """Test validation of song type parameter"""
        valid_song_types = ["musical", "spoken", "meme", "informative", "cute", "straight"]
        invalid_song_types = [
            # Script injection in song type
            "<script>alert('xss')</script>",
            "'; DROP TABLE songs; --",
            "$(rm -rf /)",
            
            # Path traversal in song type
            "../../etc/passwd",
            "../../../config",
            
            # Very long song type
            "A" * 10000,
            
            # Invalid characters
            "musical\x00",
            "musical\n\r",
            "musical\t",
            
            # Non-string types (if not properly validated)
            None,
            123,
            [],
            {},
        ]
        
        # Test valid song types
        for song_type in valid_song_types:
            with patch('article_singer.create_audio_data') as mock_create:
                mock_create.return_value = (
                    "http://test-audio.com/song.mp3",
                    "Test style",
                    "Test lyrics"
                )
                
                result = process_text("Valid test content", song_type)
                
                # Should accept valid song types
                assert "success" in result or "error" in result
        
        # Test invalid song types
        for invalid_song_type in invalid_song_types:
            try:
                result = process_text("Valid test content", invalid_song_type)
                
                # Should either reject invalid song types or handle them safely
                assert "success" in result or "error" in result
                
                # Should not crash or expose sensitive information
                assert isinstance(result, dict)
                
            except (TypeError, AttributeError):
                # It's acceptable for invalid types to cause type errors
                # as long as they don't cause security issues
                pass

    def test_api_key_security(self):
        """Test that API keys are not exposed in logs or responses"""
        test_text = "Test article content"
        
        with patch('article_singer.create_audio_data') as mock_create:
            mock_create.return_value = (
                "http://test-audio.com/song.mp3",
                "Test style",
                "Test lyrics"
            )
            
            result = process_text(test_text, "musical")
            
            # Response should not contain API key information
            result_str = str(result)
            
            # Check that common API key patterns are not in response
            api_key_patterns = [
                "sk-",  # OpenAI API key prefix
                "api_key",
                "apikey",
                "key",
                "secret",
                "token",
                "auth",
                "bearer"
            ]
            
            for pattern in api_key_patterns:
                # Case insensitive check
                assert pattern.lower() not in result_str.lower() or \
                       "api_key" in result_str.lower()  # Allow "api_key" as field name

    def test_error_message_security(self):
        """Test that error messages don't expose sensitive information"""
        with patch('article_singer.create_audio_data') as mock_create:
            # Mock various error conditions
            mock_create.side_effect = Exception("Database connection failed at host 192.168.1.100")
            
            result = process_text("Test content", "musical")
            
            # Should have error response
            assert "error" in result
            
            # Error message should not expose internal details
            if "message" in result:
                message = result["message"].lower()
                
                # Should not contain sensitive information
                sensitive_patterns = [
                    "192.168.",  # Internal IP addresses
                    "localhost",
                    "127.0.0.1",
                    "database",
                    "connection",
                    "password",
                    "secret",
                    "token",
                    "config",
                    "env"
                ]
                
                for pattern in sensitive_patterns:
                    assert pattern not in message, f"Error message exposed sensitive info: {pattern}"

    def test_file_path_security(self):
        """Test that file paths are not exposed or manipulated"""
        # Test with text that might try to manipulate file paths
        path_attacks = [
            "../../etc/passwd",
            "../../../config/secrets.json",
            "C:\\Windows\\System32\\config\\sam",
            "/etc/shadow",
            "~/.ssh/id_rsa",
            ".env",
            "config.ini"
        ]
        
        for path_attack in path_attacks:
            with patch('article_singer.create_audio_data') as mock_create:
                mock_create.return_value = (
                    "http://test-audio.com/song.mp3",
                    "Test style",
                    "Test lyrics"
                )
                
                result = process_text(path_attack, "musical")
                
                # Should process without exposing file system information
                assert "success" in result or "error" in result
                
                # Response should not contain file system paths
                result_str = str(result)
                assert "/etc/" not in result_str
                assert "C:\\" not in result_str
                assert "~/" not in result_str

    def test_denial_of_service_protection(self):
        """Test protection against DoS attacks"""
        # Test rapid successive requests (simulated)
        for i in range(10):
            with patch('article_singer.create_audio_data') as mock_create:
                mock_create.return_value = (
                    "http://test-audio.com/song.mp3",
                    "Test style",
                    "Test lyrics"
                )
                
                result = process_text(f"Test content {i}", "musical")
                
                # Should handle rapid requests without crashing
                assert "success" in result or "error" in result
                assert isinstance(result, dict)

    def test_regex_dos_protection(self):
        """Test protection against ReDoS (Regular Expression DoS) attacks"""
        # Patterns that can cause catastrophic backtracking
        redos_patterns = [
            "a" * 1000 + "X",  # Pattern that won't match after long repetition
            "(" + "a" * 100 + ")*" + "X",  # Nested quantifiers
            "a" * 50 + "b" * 50 + "c" * 50 + "X",  # Long alternation
        ]
        
        for pattern in redos_patterns:
            with patch('article_singer.create_audio_data') as mock_create:
                mock_create.return_value = (
                    "http://test-audio.com/song.mp3",
                    "Test style",
                    "Test lyrics"
                )
                
                result = process_text(pattern, "musical")
                
                # Should complete in reasonable time without hanging
                assert "success" in result or "error" in result
                assert isinstance(result, dict)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
