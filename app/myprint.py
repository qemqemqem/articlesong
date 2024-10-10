import os
from datetime import datetime

def logprint(stringo):
    print(stringo)
    try:
        log_file = '/tmp/article_singer_log.txt'
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        with open(log_file, 'a') as f:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            f.write(f"[{timestamp}] {stringo}\n")
    except Exception:
        pass  # Fail silently if there's any issue
