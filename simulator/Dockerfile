FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir paho-mqtt==2.1.0 numpy==1.26.4

COPY sensor_simulator.py .

CMD ["python", "-u", "sensor_simulator.py"]
