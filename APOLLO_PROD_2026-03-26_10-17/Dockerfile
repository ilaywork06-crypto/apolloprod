FROM python:3.14-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Compiled Python modules
COPY src/ ./src/
COPY server.pyc .

# Static data files
COPY data/ ./data/

# Built React frontend
COPY frontend/ ./frontend/

# Community data (persisted via volume in production)
COPY community.json . 2>/dev/null || true

EXPOSE 8000

CMD ["python", "server.pyc"]
