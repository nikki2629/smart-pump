FROM python:3.13-slim

WORKDIR /app
COPY simulator/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY simulator/device_simulator.py .
COPY schemas/v1 /app/schemas/v1
COPY simulator/broker/.local/certs/ca.crt /app/certs/ca.crt

ENTRYPOINT ["python", "device_simulator.py"]
