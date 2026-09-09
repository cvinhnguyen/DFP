# What the AI will cost to run

Working notes for the client. Jira: DM42-25.

Kaisa asked two things in the kickoff: whether open source models could be
used instead of paid ones, and what the tokens cost. This is where we answer
both with measurements rather than opinion.

Status: first results below. Not finished. Still missing a commercial API
comparison, real prices, and more than one article.

## What we measured

Same Finnish news text, same prompt, asking for a two sentence summary.

| Model | Where it runs | Time | Tokens in / out | Quality |
|---|---|---|---|---|
| llama3.2:1b | Locally on a laptop | 13.1 s | 239 / 96 | Unusable |
| gemma4:31b-cloud | Ollama cloud | 1.6 s | 198 / 94 | Good |

The small local model was both worse and slower.

It opened with a meaningless sentence, then said the two organisations
"voivat kokeilla", may try, when the source says they are launching a
project. The Finnish was also grammatically wrong in a way a native reader
notices at once.

The cloud model produced an accurate two sentence summary in correct Finnish
and kept the details that matter, the funder and the end date.

## What this means

Running a model locally is only free if the machine is already paid for. A
model small enough to run on a laptop is not good enough for Finnish, and a
model large enough would need a much more expensive server. At the scale of
this newsletter, roughly 400 items a month, that hardware costs far more than
the tokens ever would.

Rough token cost at typical small commercial rates works out at well under a
euro a month for that volume. The running cost of this system is dominated by
hosting, not by AI.

## The three options

| | Token cost | Other cost | Where the text goes |
|---|---|---|---|
| Local model on our own server | none | a server big enough to run it | stays on the server |
| Ollama cloud | free tier, then paid | none | Ollama's servers |
| Commercial API | paid per token | none | the provider's servers |

## The question for the client

Both hosted options send article text to a third party, most likely outside
the EU. That is a decision for the association rather than for us. It is
worth deciding deliberately, given Kaisa asked that AI is not used where it
should not be.

If the answer is that text must not leave, the local option comes back and the
server cost goes up. If hosted is acceptable, a paid tier on a hosted service
is cheaper than the hardware and gives better Finnish.

## Still to do

- Real prices from ollama.com and one commercial provider, in `llm_pricing`
- The same comparison across 20 articles rather than one
- A check of where each hosted provider processes data
