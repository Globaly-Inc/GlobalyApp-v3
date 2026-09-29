# Institution counselling memory — demo script

Dev DB, institution **49 (AIT)**, widget key `d472fa3f-1a1f-43e5-b369-7547ab6b4688`.
Backend on :3000, frontend on :3001. **Restart the backend first** if it was started before
today's wiring (it has no file watcher), and run `npm run migrate:globalyapp` (20260928_001 adds the
widget's greeting/subtitle columns).

## Prepare (once, before the demo)

```bash
cd backend
npm run demo:institution-memory -- --inst 49 --reset   # clean slate
npm run demo:institution-memory -- --inst 49           # seed
```

The seed writes, for AIT:
- 7 **admin rules** (an avoidance rule, a refund policy, a closing guideline, a style preference,
  a recommendation rule, a terminology rule, a concern pattern) — active, real embeddings;
- 2 **learned candidates** the counsellor "picked up" from past chats, still waiting for a human
  or for more students;
- 1 learned candidate that **contradicts** the refund policy — stored linked, can never
  self-promote;
- a **widget conversation** in which the AI wrongly quoted "refunds within 14 days", sitting in
  the review queue.

## Act 1 — the widget follows the institution's rules (2 min)

The widget is not on any GlobalyHub page. It is a script tag the institution pastes on its
**own** website, and AIT has no website in the dev DB. Two ways to show it:

- **As a website visitor sees it:** open `docs/ai-counsellor/2026-09-28-demo-site.html` in a
  browser (a stand-in for AIT's site with the script tag). The orb appears bottom-right.
- **Just the chat panel:** `http://localhost:3001/embed/d472fa3f-1a1f-43e5-b369-7547ab6b4688`.
- **Inside the portal:** log in as AIT, open AI assistant (`/business/ai-widget`) and press the eye
  icon on the widget card. `/business/ai-widget/preview/<key>` is a sample page with the live orb.

The portal's AI assistant page (`/business/ai-widget`, logged in as AIT) shows the widget card
with that script tag — that is where an institution gets it.

Ask, in this order, and point at what changed:

| Ask | What to show |
|---|---|
| `What is your refund policy?` | The reply refuses to quote a timeline and points to the policy page. The thinking indicator shows **"Institution memory"** while it retrieves. |
| `I want to study nursing but I haven't done IELTS yet` | It asks about the English test before recommending anything (avoidance rule). |
| `Can I work part time while I study?` | It asks which visa first (concern pattern). |
| anything | Every reply ends by offering a human AIT counsellor, and stays short (guideline + preference). |

To show the contrast, run `--reset` first and ask the refund question: the reply is generic.
Then seed and ask again. (Reseeding takes ~20 s for the embeddings.)

## Act 2 — what the institution sees (2 min)

No portal page exists yet; use the API with an institution member's token
(log in to the portal as AIT, then in the browser console: `localStorage.getItem("globaly_access_token")`).

```bash
T="Bearer <token>"; A=http://localhost:3000/api/v3/ai-chat

curl -s -H "Authorization: $T" "$A/institution/memories" | jq '.memories[] | {status, source, type, confidence, content}'
curl -s -H "Authorization: $T" "$A/institution/memories?conflicting=true" | jq '.memories[] | {content, conflicts_with_id}'
curl -s -H "Authorization: $T" "$A/institution/conversations?unreviewed=true" | jq
curl -s -H "Authorization: $T" "$A/institution/conversations/<session_id>/messages" | jq '.messages[] | {id, role, content, memory_ids}'
```

Talking points: admin rules are active immediately; learned ones are candidates until three
distinct students reinforce them or a human approves; the contradicting one shows its link.

## Act 3 — it learns from a counsellor (2 min)

Either through the API:

```bash
curl -s -X POST -H "Authorization: $T" -H 'Content-Type: application/json' \
  "$A/messages/<reply_id>/review" \
  -d '{"status":"corrected","correction":"I can'\''t go into refund timelines until you have an offer letter — our refund policy page has the full terms. Have you started an application yet?","note":"Never quote a number of days before an offer."}'
# the worker picks the job up:  npm run job:institution-memory
```

or, with no token and no worker, in-process:

```bash
npm run demo:institution-memory -- --inst 49 --learn
```

What it prints, in order:
1. the counsellor's correction is stored **verbatim and active** (a human said it);
2. the extractor + Jev derive up to two **rules as candidates** from it;
3. a student's thumbs-down on the same wrong reply: Jev decides the reply did **not** follow
   the refund policy, so the policy is **not** voted against (the vote lands on nothing);
4. two more students reinforce the scholarship technique → it **promotes itself** to active.

Then list memories again (`curl … /institution/memories`) and approve a candidate:

```bash
curl -s -X POST -H "Authorization: $T" "$A/institution/memories/<id>/approve" | jq '{status, history}'
```

## Reset between runs

```bash
npm run demo:institution-memory -- --inst 49 --reset && npm run demo:institution-memory -- --inst 49
```

## If something looks off

- "Institution memory: N rules, 0 relevant" on a refund question → embeddings missing; check
  `EMBEDDING_PROVIDER` and that the seed printed `created` for every rule.
- No "Institution memory" trace at all → the backend is running old code; restart it.
- Widget replies ignore the rules → check the reply came from the embed path (the widget key is
  in the request), not the platform `/ai` chat, which has no institution.
