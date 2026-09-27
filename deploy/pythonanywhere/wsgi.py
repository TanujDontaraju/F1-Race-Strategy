# Paste this over everything in your PythonAnywhere WSGI configuration file
# (Web tab -> "WSGI configuration file"), fill in the two CHANGE ME values, then Reload.
import os
import sys

# CHANGE ME: your PythonAnywhere username, and your Vercel site's URL.
USERNAME = "yourusername"
os.environ["ALLOWED_ORIGINS"] = "https://your-app.vercel.app"

# Keeps the session cache well inside the free plan's 512 MB disk quota.
os.environ["CACHE_MAX_MB"] = "250"

project = f"/home/{USERNAME}/F1-Race-Strategy"
if project not in sys.path:
    sys.path.insert(0, project)

from server.main import app as application  # noqa: E402
