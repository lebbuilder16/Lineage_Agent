# ---- Stage 1: Python backend ----
FROM python:3.12-slim AS backend

WORKDIR /app

# Install system deps for Pillow / imagehash
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libjpeg62-turbo-dev zlib1g-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

# Run as non-root user for security
RUN useradd --create-home --shell /bin/bash appuser && \
    mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["python", "-m", "uvicorn", "lineage_agent.api:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "src"]


# ---- Stage 2: Next.js frontend ----
FROM node:20-alpine AS frontend-builder

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build


FROM node:20-alpine AS frontend

WORKDIR /app
COPY --from=frontend-builder /app/.next/standalone ./
COPY --from=frontend-builder /app/.next/static .next/static
COPY --from=frontend-builder /app/public ./public 2>/dev/null || true

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "server.js"]
