# What the AI will cost to run

For the client. Jira: DM42-25. Written 17 September 2026.

Kaisa asked two things in the kickoff: whether open source models could be used
instead of paid ones, and what the tokens cost. Both are answered below from
measurements on the association's own articles rather than from estimates.

Short version: at the newsletter's likely volume the AI costs around ten cents
a month. Whatever this system ends up costing to run, the AI is not the part
worth worrying about.

## What we measured

Twenty real news articles from eoppimiskeskus.fi, published between May and
September 2026, summarised through the workflow the project actually uses. The
prompt asked for a three sentence Finnish summary of each. Model:
`gemma4:31b-cloud`, running on Ollama's cloud.

| | Lowest | Median | Mean | Highest |
|---|---|---|---|---|
| Tokens in (the article) | 1 080 | 1 300 | 1 581 | 3 197 |
| Tokens out (the summary) | 76 | 114 | 108 | 128 |
| Time per article | 0.8 s | 1.0 s | 1.2 s | 3.2 s |

All twenty summaries completed. None was cut short. Total model time for the
whole set was 23 seconds.

One of the summaries, so you can judge the quality yourself. The article was
about the AITO project's findings on AI and work:

> AITO-hanke selvitti tekoälyn vaikutuksia työnkuviin ja osaamisvaatimuksiin
> kone-, rakennus-, media- ja ICT-aloilla. Tekoäly ei korvaa kokonaisia
> ammatteja, vaan se muuttaa työn sisältöä ottamalla hoitaakseen yksittäisiä
> tehtäviä. Tulevaisuuden osaaminen syntyy oman alan ammattitaidon, tekoälyn
> hyödyntämiskyvyn ja jatkuvan oppimisen yhdistelmästä.

## What the tokens cost

At roughly 400 collected items a month, the measured averages come to about
632 000 input tokens and 43 000 output tokens.

Ollama publishes $0.14 per million input tokens and $0.40 per million output
tokens for the gemma4 family, read on 17 September 2026. Converted at the ECB
euro reference rate of 1.1537 USD per euro on 16 September:

| | Tokens a month | Cost |
|---|---|---|
| Articles going in | 632 000 | €0.077 |
| Summaries coming out | 43 000 | €0.015 |
| **Total** | | **€0.09 a month** |

The association is currently on Ollama's free tier, so today this costs
nothing at all. The figure above is what it would cost after outgrowing that.

Two things make the real bill lower still. The same text is never paid for
twice, because the system stores every answer and reuses it. And an article
that the filter rejects before the AI step never costs a call at all.

We had estimated 1 500 tokens in and 200 out per article when this work was
planned. The input figure held up. The output was half what we assumed, because
a three sentence summary is short.

## Can open source models be used instead?

Yes, and the system already does. `gemma4` is an open weights model. What
decides the cost is where it runs: on a machine the association pays for, or on
somebody else's.

We tried a model small enough to run on a laptop, `llama3.2:1b`. On a Finnish
article it took 13 seconds, opened with a meaningless sentence, and said two
organisations "voivat kokeilla", may try, where the source said they were
launching a project. The Finnish was wrong in a way a native reader notices at
once. It is not usable for this.

A model large enough to write correct Finnish needs a server with a lot of
memory. At this newsletter's volume that hardware costs far more per month than
ten cents of tokens. Paying for a machine to avoid a ten cent bill is not a
saving.

## The three options

| | Token cost | Other cost | Where the article text goes |
|---|---|---|---|
| Open model on our own server | none | a server big enough to run it | stays on that server |
| Open model on Ollama's cloud | free tier, then about €0.09 a month | none | Ollama's servers |
| Commercial API | not yet measured | none | that provider's servers |

## The question for the client

Both hosted options send the text of collected articles to a company outside
the association, most likely outside the EU. That is the association's decision
to make, not ours, and Kaisa asked in the kickoff that AI is not used where it
should not be.

If article text must stay in the EU, or must not leave the association's own
machines, the self-hosted option comes back and the cost moves from ten cents
of tokens to a monthly server bill. If hosted processing is acceptable, the
cloud option is cheaper and writes better Finnish than anything that would run
on a modest server.

The articles we collect are already published publicly on the web, which makes
this a lighter question than it would be for member data. Nothing about members
goes near a model.

## Still open

- A commercial API measured on the same twenty articles. Which provider we can
  even consider depends on the EU question above, so this is waiting on the
  client rather than on us.
- The monthly cost of a server for the self-hosted option, which needs a
  decision on where it would run.
- The local model has only been tried on one article. It was clearly unusable,
  so we did not repeat it twenty times.
