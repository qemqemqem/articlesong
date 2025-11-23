# Makefile for managing testing

.PHONY: test lint setup test-unit test-int test-e2e test-perf test-sec ci

setup:
	# Setup test environment
	pip install pytest pytest-asyncio pytest-mock coverage locust
	npm install

test:
	# Run all tests
	npm run ci

lint:
	# Lint JavaScript code
	npm run lint

lint-fix:
	# Lint and fix JavaScript code
	npm run lint:fix

test-unit:
	# Run unit tests
	pytest tests/unit
	npm run test:unit

test-int:
	# Run integration tests
	npm run test:integration

test-e2e:
	# Run end-to-end tests
	npm run test:e2e

test-perf:
	# Run performance tests
	locust -f tests/performance/load_test.py

test-sec:
	# Run security tests
	# Placeholder for security tests, assuming usage of OWASP ZAP or similar
	pytest tests/security

ci:
	# Continuous Integration script - run unit, integration and e2e tests
	make test-unit
	make test-int
	make test-e2e

