# grokcli-2api — self-contained image (vendored grok-build-auth, no submodule)
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    GROK2API_HOST=0.0.0.0 \
    GROK2API_PORT=3000 \
    GROK2API_OPEN_BROWSER=0 \
    PYTHONPATH=/app/grok-build-auth

WORKDIR /app

# System deps: TLS + headless browser stack for grok-register
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        xvfb \
        chromium \
        chromium-driver \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -r /app/requirements.txt

# Copy full source last for better layer caching of deps
COPY . /app

# Ensure vendored registration packages are present
RUN test -f /app/vendors/grok-register/DrissionPage_example.py \
    && test -f /app/register_runner.py \
    && python -c "import register_runner, app; print('build-check', app.APP_VERSION, register_runner.ADAPTER_BUILD)"

EXPOSE 3000

# Persist runtime data
VOLUME ["/app/data"]

CMD ["python", "app.py"]
