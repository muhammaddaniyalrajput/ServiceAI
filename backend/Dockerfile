# ── KaamEasy AI Backend — production image ──────────────────────────────
# Slim base image. Python 3.13-slim is the sweet spot for FastAPI:
# small footprint, full stdlib, no build tools we don't need.
FROM python:3.13-slim AS base

# System deps
#   build-essential: only needed for wheels that compile C extensions
#   (we drop it in the runtime stage to keep the image small).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python env
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install Python deps first (better Docker layer caching — re-uses
# the deps layer when only source code changes).
COPY requirements.txt .
RUN pip install -r requirements.txt

# Drop build tools (smaller runtime image)
RUN apt-get purge -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy the rest of the source
COPY . .

# Drop privileges — uvicorn does not need root.
RUN useradd --create-home --shell /bin/bash appuser
USER appuser

EXPOSE 8080

# Health-check target — App Platform / Docker / k8s all use this.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=2).read()" || exit 1

# Entrypoint — bind to 0.0.0.0 so the host can reach us.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
