-- Runs once, the first time the Postgres volume is created.
-- POSTGRES_DB already created the "newsletter" database. This adds the
-- separate one n8n uses for its own workflows and credentials.

CREATE DATABASE n8n;
