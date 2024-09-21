#!/usr/bin/env python

import sys
import json
import struct

try:
    # Python 3.x version
    def getMessage():
        rawLength = sys.stdin.buffer.read(4)
        if len(rawLength) == 0:
            sys.exit(0)
        messageLength = struct.unpack('@I', rawLength)[0]
        message = sys.stdin.buffer.read(messageLength).decode('utf-8')
        return json.loads(message)

    def encodeMessage(messageContent):
        encodedContent = json.dumps(messageContent, separators=(',', ':')).encode('utf-8')
        encodedLength = struct.pack('@I', len(encodedContent))
        return {'length': encodedLength, 'content': encodedContent}

    def sendMessage(encodedMessage):
        sys.stdout.buffer.write(encodedMessage['length'])
        sys.stdout.buffer.write(encodedMessage['content'])
        sys.stdout.buffer.flush()

    def process_text(text):
        # Here you can implement your text processing logic
        # For now, we'll just return the length of the text
        return f"Processed text length: {len(text)} characters"

    while True:
        receivedMessage = getMessage()
        if isinstance(receivedMessage, dict) and receivedMessage.get('action') == 'process_text':
            result = process_text(receivedMessage.get('text', ''))
            sendMessage(encodeMessage(result))
        else:
            sendMessage(encodeMessage("Unknown command"))

except AttributeError as e:
    # Python 2.x version (similar changes as above)
    # ... (Python 2.x code remains the same as before)
    raise e
