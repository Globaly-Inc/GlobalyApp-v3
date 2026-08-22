# Eval runs

Dated reports from `npm run ai:evals -- --token <jwt>` (see `backend/scripts/ai-evals/`).

Each report holds the full reply to all 30 fixed questions plus structural check results.
Keep them: the point is diffing runs — before and after a prompt change, a retrieval change,
or seeding a new country's documents.

Checks are structural (did it ask, cite, hedge, emit a card). Whether the advice is *good*
is the human read the replies are printed for.
