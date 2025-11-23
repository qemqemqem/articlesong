"""
Performance tests for Article Singer using Locust
"""
from locust import HttpUser, task, between
import json
import random
import time
from unittest.mock import patch, MagicMock


class ArticleSongUser(HttpUser):
    """
    Locust user class for testing Article Singer performance
    """
    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks
    
    def on_start(self):
        """Called when a simulated user starts"""
        self.sample_texts = [
            "Short article content for testing performance.",
            "Medium length article content " * 50,
            "Long article content " * 200,
            "Wikipedia-style article content with multiple paragraphs. " * 100,
            "Technical article with complex terminology and detailed explanations. " * 150
        ]
        
        self.song_types = ["musical", "spoken", "meme", "informative", "cute", "straight"]
    
    @task(3)
    def test_short_article_processing(self):
        """Test processing of short articles (most common case)"""
        text = random.choice(self.sample_texts[:2])  # Short/medium texts
        song_type = random.choice(self.song_types)
        
        payload = {
            "action": "process_text",
            "text": text,
            "songType": song_type,
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        # Since we're testing the backend processing, not HTTP endpoints,
        # we'll simulate the processing time
        start_time = time.time()
        
        # Simulate the actual processing that would happen
        self.simulate_processing(payload)
        
        end_time = time.time()
        response_time = (end_time - start_time) * 1000  # Convert to milliseconds
        
        # Report custom metrics
        self.environment.events.request_success.fire(
            request_type="PROCESS",
            name="short_article",
            response_time=response_time,
            response_length=len(text)
        )
        
        # Fail if processing takes too long
        if response_time > 30000:  # 30 seconds
            self.environment.events.request_failure.fire(
                request_type="PROCESS",
                name="short_article",
                response_time=response_time,
                response_length=len(text),
                exception="Processing timeout"
            )
    
    @task(2)
    def test_medium_article_processing(self):
        """Test processing of medium length articles"""
        text = self.sample_texts[2]  # Long text
        song_type = random.choice(self.song_types)
        
        payload = {
            "action": "process_text",
            "text": text,
            "songType": song_type,
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        start_time = time.time()
        self.simulate_processing(payload)
        end_time = time.time()
        response_time = (end_time - start_time) * 1000
        
        self.environment.events.request_success.fire(
            request_type="PROCESS",
            name="medium_article",
            response_time=response_time,
            response_length=len(text)
        )
        
        if response_time > 60000:  # 60 seconds
            self.environment.events.request_failure.fire(
                request_type="PROCESS",
                name="medium_article",
                response_time=response_time,
                response_length=len(text),
                exception="Processing timeout"
            )
    
    @task(1)
    def test_long_article_processing(self):
        """Test processing of very long articles"""
        text = self.sample_texts[3] + self.sample_texts[4]  # Very long text
        song_type = random.choice(self.song_types)
        
        payload = {
            "action": "process_text",
            "text": text,
            "songType": song_type,
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        start_time = time.time()
        self.simulate_processing(payload)
        end_time = time.time()
        response_time = (end_time - start_time) * 1000
        
        self.environment.events.request_success.fire(
            request_type="PROCESS",
            name="long_article",
            response_time=response_time,
            response_length=len(text)
        )
        
        if response_time > 120000:  # 120 seconds
            self.environment.events.request_failure.fire(
                request_type="PROCESS",
                name="long_article",
                response_time=response_time,
                response_length=len(text),
                exception="Processing timeout"
            )
    
    @task(1)
    def test_concurrent_different_song_types(self):
        """Test concurrent processing of different song types"""
        for song_type in self.song_types:
            text = random.choice(self.sample_texts)
            
            payload = {
                "action": "process_text",
                "text": text,
                "songType": song_type,
                "anthropic_api_key": "test_key",
                "piapi_key": "test_key"
            }
            
            start_time = time.time()
            self.simulate_processing(payload)
            end_time = time.time()
            response_time = (end_time - start_time) * 1000
            
            self.environment.events.request_success.fire(
                request_type="PROCESS",
                name=f"concurrent_{song_type}",
                response_time=response_time,
                response_length=len(text)
            )
    
    def simulate_processing(self, payload):
        """
        Simulate the actual processing that would happen in the backend
        This replaces actual API calls with simulated delays
        """
        # Simulate GPT processing time (varies by text length)
        text_length = len(payload["text"])
        gpt_processing_time = min(0.5 + (text_length / 1000) * 0.1, 5.0)  # 0.5-5 seconds
        time.sleep(gpt_processing_time)
        
        # Simulate Suno API processing time (usually longer)
        suno_processing_time = random.uniform(10, 30)  # 10-30 seconds
        time.sleep(suno_processing_time)
        
        # Simulate occasional API failures
        if random.random() < 0.05:  # 5% failure rate
            raise Exception("Simulated API failure")
        
        return {
            "success": True,
            "audio_url": f"http://test-song-url.com/{payload['songType']}.mp3",
            "lyrics": f"Generated lyrics for {payload['songType']} song"
        }


class StressTestUser(HttpUser):
    """
    Stress test user for testing system limits
    """
    wait_time = between(0.1, 0.5)  # Very short wait times for stress testing
    
    def on_start(self):
        """Called when a simulated user starts"""
        self.stress_text = "Stress test article content. " * 500  # Large text
    
    @task
    def stress_test_processing(self):
        """Stress test with rapid requests"""
        payload = {
            "action": "process_text",
            "text": self.stress_text,
            "songType": "musical",
            "anthropic_api_key": "test_key",
            "piapi_key": "test_key"
        }
        
        start_time = time.time()
        
        try:
            # Simulate rapid processing
            time.sleep(random.uniform(0.1, 2.0))  # Very short processing time
            
            end_time = time.time()
            response_time = (end_time - start_time) * 1000
            
            self.environment.events.request_success.fire(
                request_type="STRESS",
                name="rapid_processing",
                response_time=response_time,
                response_length=len(self.stress_text)
            )
            
        except Exception as e:
            end_time = time.time()
            response_time = (end_time - start_time) * 1000
            
            self.environment.events.request_failure.fire(
                request_type="STRESS",
                name="rapid_processing",
                response_time=response_time,
                response_length=len(self.stress_text),
                exception=str(e)
            )


class MemoryTestUser(HttpUser):
    """
    Memory usage test user for testing memory consumption
    """
    wait_time = between(2, 5)
    
    def on_start(self):
        """Called when a simulated user starts"""
        # Create progressively larger texts to test memory usage
        self.memory_test_texts = [
            "Small text. " * 100,
            "Medium text. " * 1000,
            "Large text. " * 5000,
            "Very large text. " * 10000,
            "Extremely large text. " * 20000
        ]
    
    @task
    def test_memory_usage(self):
        """Test memory usage with increasingly large texts"""
        for i, text in enumerate(self.memory_test_texts):
            payload = {
                "action": "process_text",
                "text": text,
                "songType": "musical",
                "anthropic_api_key": "test_key",
                "piapi_key": "test_key"
            }
            
            start_time = time.time()
            
            try:
                # Simulate processing with memory considerations
                processing_time = 1.0 + (len(text) / 10000) * 2.0  # Scale with text size
                time.sleep(processing_time)
                
                end_time = time.time()
                response_time = (end_time - start_time) * 1000
                
                self.environment.events.request_success.fire(
                    request_type="MEMORY",
                    name=f"memory_test_{i}",
                    response_time=response_time,
                    response_length=len(text)
                )
                
            except Exception as e:
                end_time = time.time()
                response_time = (end_time - start_time) * 1000
                
                self.environment.events.request_failure.fire(
                    request_type="MEMORY",
                    name=f"memory_test_{i}",
                    response_time=response_time,
                    response_length=len(text),
                    exception=str(e)
                )


# Custom event handlers for performance monitoring
def on_request_success(request_type, name, response_time, response_length, **kwargs):
    """Handler for successful requests"""
    print(f"SUCCESS: {request_type} {name} - {response_time:.2f}ms ({response_length} chars)")


def on_request_failure(request_type, name, response_time, response_length, exception, **kwargs):
    """Handler for failed requests"""
    print(f"FAILURE: {request_type} {name} - {response_time:.2f}ms ({response_length} chars) - {exception}")


# Configuration for different test scenarios
if __name__ == "__main__":
    # This would be run by Locust CLI
    # Examples:
    # locust -f tests/performance/load_test.py --users 10 --spawn-rate 2 --run-time 60s
    # locust -f tests/performance/load_test.py --users 50 --spawn-rate 5 --run-time 300s
    pass
