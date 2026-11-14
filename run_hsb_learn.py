"""
HSB Learn Launcher Script
Starts Uvicorn server and launches web browser
"""

import sys
import time
import webbrowser
import threading
import uvicorn
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

def open_browser(port: int = 8000):
    time.sleep(1.2)
    url = f"http://127.0.0.1:{port}"
    print(f"\n[HSB Learn] Opening {url} in your browser...")
    webbrowser.open(url)

if __name__ == "__main__":
    port = 8000
    print("=" * 65)
    print("       HSB LEARN — AI-POWERED MBA LEARNING MANAGEMENT SYSTEM      ")
    print("       Hari Shankar Singhania School of Business (HSB) | Product Management    ")
    print("=" * 65)
    print(f"[HSB Learn] Initializing server at http://127.0.0.1:{port}")
    print("[HSB Learn] Grounded Document Parsing (PDF, DOCX, PPTX, TXT): ACTIVE")
    print("[HSB Learn] AI Revision Notes & Quiz Generation: ACTIVE")
    print("=" * 65)

    # Launch browser in separate background thread
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()

    uvicorn.run("hsb_learn.app:app", host="127.0.0.1", port=port, log_level="info")
