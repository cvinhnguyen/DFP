# The editors' dashboard: the pages and the API behind them.
# Jira: DM42-80
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY web ./web

# Not root, so a fault in the service cannot change the container.
RUN useradd --system --uid 10001 dashboard
USER dashboard

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
