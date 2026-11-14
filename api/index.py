import os
import sys
from pathlib import Path

# Add project root directory to Python path
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Signal serverless environment
os.environ["VERCEL"] = "1"

# Import FastAPI instance
from hsb_learn.app import app

# Vercel entrypoint
handler = app
