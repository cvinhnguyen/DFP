-- Real token prices, so the cost figures we give the client are not guesses.
-- Jira: DM42-25
--
-- Prices are published in US dollars and converted at the ECB euro reference
-- rate, 1 EUR = 1.1537 USD on 16 September 2026. Both the price and the rate
-- move, so re-run this file with fresh numbers rather than trusting it a year
-- from now. Storing prices as data rather than in a workflow is what lets us
-- recalculate past spend when a price changes.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/06-pricing.sql

\connect newsletter

-- What we actually run today. The free tier costs nothing per token, so zero
-- here is the truth, not a placeholder. It is what makes llm_usage report what
-- we really spend rather than what we would spend on a paid plan.
UPDATE llm_pricing
   SET note = 'Ollama cloud free tier. No token charge at our volume. For the paid rate see the gemma4 row.'
 WHERE provider = 'ollama' AND model = 'gemma4:31b-cloud';

-- The published paid rate for the same model family, kept so the client can
-- see what it would cost if they outgrow the free tier. Nothing matches on
-- this row while llm_model stays gemma4:31b-cloud.
-- ollama.com/pricing, read 17 September 2026: 0.14 in, 0.05 cached in,
-- 0.40 out, all per million tokens, USD.
INSERT INTO llm_pricing (provider, model, input_eur_per_1k, output_eur_per_1k, note) VALUES
    ('ollama', 'gemma4', 0.00012134, 0.00034671,
     'Published paid rate, ollama.com/pricing read 17.9.2026: $0.14 in and $0.40 out per million tokens, converted at 1.1537 USD/EUR.')
ON CONFLICT (provider, model) DO UPDATE
   SET input_eur_per_1k  = EXCLUDED.input_eur_per_1k,
       output_eur_per_1k = EXCLUDED.output_eur_per_1k,
       note              = EXCLUDED.note,
       updated_at        = now();

-- The commercial API comparison is still open. It is deliberately left as a
-- placeholder rather than filled with a plausible-looking number, because
-- which provider we can use depends on an unanswered question: whether
-- article text may be processed outside the EU.
