FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY frontend/ ./frontend/
COPY server.pyc .
COPY data/ ./data/

EXPOSE 8000

CMD ["python", "server.pyc"]
