# ============================================================
# Stage 1: Build React frontend (minified, source not shipped)
# ============================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/web/package*.json ./
RUN npm ci --silent
COPY frontend/web/ ./
RUN npm run build

# ============================================================
# Stage 2: Compile Python source → .pyc bytecode only
# ============================================================
FROM python:3.14-slim AS python-builder
WORKDIR /app
COPY src/ ./src/
# -b puts .pyc next to .py; then we delete all .py and __pycache__
RUN python -m compileall -b -q src/ && \
    find ./src -name "*.py" -delete && \
    find ./src -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null; true

# ============================================================
# Stage 3: Final image — only compiled artifacts, no source
# ============================================================
FROM python:3.14-slim
WORKDIR /app

# Runtime dependencies only
RUN pip install --no-cache-dir \
    fastapi>=0.135.1 \
    uvicorn>=0.42.0 \
    lxml>=6.0.2 \
    python-multipart>=0.0.22 \
    pydantic

# Compiled Python bytecode (no .py source files)
COPY --from=python-builder /app/src/ ./src/

# Minified React build (no React source)
COPY --from=frontend-builder /frontend/build/ ./frontend/web/build/

# Reference data and community data
COPY data/ ./data/
COPY community.json ./

EXPOSE 8000

CMD ["python", "-m", "src.api.app"]
