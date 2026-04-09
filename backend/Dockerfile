FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install PyTorch CPU-only via --extra-index-url (per user requirement)
RUN pip install --no-cache-dir torch==2.4.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu

# Copy application code
COPY app/ app/

# Create __init__.py files for proper Python packaging
RUN touch app/__init__.py app/routers/__init__.py app/models/__init__.py app/services/__init__.py

# Model weights are mounted via docker-compose volume at /app/model_weights/

ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
