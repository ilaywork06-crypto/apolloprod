FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY frontend/ ./frontend/
COPY server.pyc .

# Create data volume mount point
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["python", "server.pyc"]
