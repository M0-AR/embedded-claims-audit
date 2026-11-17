FROM python:3.12-slim

LABEL org.opencontainers.image.source="https://github.com/M0-AR/embedded-claims-audit" \
      org.opencontainers.image.description="Reproducible audit of quantitative claims in motor-drive and embedded-systems education" \
      org.opencontainers.image.licenses="MIT"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MPLBACKEND=Agg \
    PYTHONPATH=/app/src

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends make \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["make", "experiments", "web"]
