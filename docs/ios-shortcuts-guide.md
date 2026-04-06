# iOS Shortcuts Integration Guide — Threads Analysis API

**API Base URL:** `http://100.71.141.45:4322`
**Response shape:** `{ ok: boolean, data: any, meta: object }`

---

## 1. Setup Prerequisites

### Requirements

- iPhone or iPad running iOS 16+
- Tailscale installed from App Store and signed in to the same tailnet as the Mac mini
- Mac mini running the threads-analysis API server on port 4322

### Verify Tailscale Connectivity

Open Safari on your iPhone/iPad and navigate to:

```
http://100.71.141.45:4322/api/posts/stats
```

If you see JSON, the connection works. If not, open Tailscale and confirm the VPN is active and `100.71.141.45` appears as a peer.

### Quick Connectivity Test Shortcut

1. Open Shortcuts app
2. Tap **+** to create a new shortcut
3. Name it **"Tailscale Ping"**
4. Add action: **Get Contents of URL**
   - URL: `http://100.71.141.45:4322/api/posts/stats`
5. Add action: **If**
   - Input: *Get Contents of URL* result
   - Condition: *has any value*
6. Add action: **Show Notification**
   - Title: `API Connected`
   - Body: `Threads API is reachable`
7. **Otherwise** branch:
   - Add action: **Show Notification**
   - Title: `API Unreachable`
   - Body: `Check Tailscale and API server`
8. Add action: **End If**

---

## 2. Shortcut Recipes

### Recipe A: "My Last Posts"

Fetches your N most recent Threads posts and displays them.

1. Create new shortcut, name it **My Last Posts**
2. Add action: **Ask for Input**
   - Prompt: `How many recent posts?`
   - Input Type: **Number**
   - Default Answer: `5`
3. Add action: **Text**
   - Content: `http://100.71.141.45:4322/api/posts/recent?limit=`
4. Add action: **Text** (combine)
   - Content: combine the URL text with *Provided Input* (long-press on the Text variable to insert the Ask for Input result)
   - Alternatively, just use one Text action: `http://100.71.141.45:4322/api/posts/recent?limit={Ask for Input}`
5. Add action: **Get Contents of URL**
   - URL: *Text* from step 4
6. Add action: **Get Dictionary Value**
   - Key: `data`
   - From: *Contents of URL*
7. Add action: **Set Variable**
   - Name: `output`
   - Value: (empty text — we will build it)

   Actually, simpler approach for display:

8. Add action: **Repeat with Each**
   - Input: *Dictionary Value* (the data array)
9. Inside the repeat block:
   - Add action: **Get Dictionary Value** — Key: `text`, From: *Repeat Item*
   - Add action: **Get Dictionary Value** — Key: `timestamp`, From: *Repeat Item*
   - Add action: **Format Date** — Date: *timestamp value*, Format: `Short`
   - Add action: **Text** — Content: `[{Format Date}] {text value}` followed by two newlines
   - Add action: **Add to Variable** — Variable Name: `output`, Value: *Text*
10. After the repeat block:
    - Add action: **Get Variable** — `output`
    - Add action: **Quick Look**

**Test URL:** `http://100.71.141.45:4322/api/posts/recent?limit=3`

---

### Recipe B: "Search My Threads"

Full-text search across all posts.

1. Create new shortcut, name it **Search My Threads**
2. Add action: **Ask for Input**
   - Prompt: `Search for what?`
   - Input Type: **Text**
3. Add action: **URL Encode**
   - Input: *Provided Input*
4. Add action: **Text**
   - Content: `http://100.71.141.45:4322/api/posts/search?q={URL Encoded Text}`
5. Add action: **Get Contents of URL**
   - URL: *Text*
6. Add action: **Get Dictionary Value**
   - Key: `data`
7. Add action: **Count**
   - Input: *Dictionary Value*
8. Add action: **Set Variable** — Name: `count`, Value: *Count*
9. Add action: **Repeat with Each**
   - Input: *Dictionary Value* (the data array — you may need to re-get it with Get Variable)
10. Inside repeat:
    - **Get Dictionary Value** — Key: `text`, From: *Repeat Item*
    - **Get Dictionary Value** — Key: `timestamp`, From: *Repeat Item*
    - **Format Date** — Short
    - **Text** — `[{date}] {text}`
    - **Add to Variable** — Variable Name: `results`
11. After repeat:
    - **Text** — `Found {count} posts:\n\n{results}`
    - **Quick Look**

**Test URL:** `http://100.71.141.45:4322/api/posts/search?q=foucault`

---

### Recipe C: "Ask My Threads" (RAG)

Natural language question answered by the local Ollama RAG pipeline.

1. Create new shortcut, name it **Ask My Threads**
2. Add action: **Ask for Input**
   - Prompt: `What do you want to know about your posts?`
   - Input Type: **Text**
3. Add action: **URL Encode**
   - Input: *Provided Input*
4. Add action: **Text**
   - Content: `http://100.71.141.45:4322/api/ask?q={URL Encoded Text}`
5. Add action: **Get Contents of URL**
   - URL: *Text*
   - Advanced: set **Timeout** to 30 seconds (RAG queries can be slow)
6. Add action: **Get Dictionary Value**
   - Key: `data`
7. Add action: **Get Dictionary Value**
   - Key: `answer`
   - From: previous dictionary
8. Add action: **Show Result**
   - Input: *Dictionary Value*

If the API returns the answer nested directly as `data.answer`, you can also try getting the value for key path `data` first, then `answer` from that result. Shortcuts does not support dot-path keys natively, so two Get Dictionary Value actions are required.

**Test URL:** `http://100.71.141.45:4322/api/ask?q=what%20are%20my%20most%20common%20topics`

---

### Recipe D: "Threads Stats Dashboard"

Aggregated statistics in a formatted summary.

1. Create new shortcut, name it **Threads Stats**
2. Add action: **Get Contents of URL**
   - URL: `http://100.71.141.45:4322/api/posts/stats`
3. Add action: **Get Dictionary Value** — Key: `data`
4. Add action: **Set Variable** — Name: `stats`
5. Add action: **Get Contents of URL**
   - URL: `http://100.71.141.45:4322/api/metrics/summary`
6. Add action: **Get Dictionary Value** — Key: `data`
7. Add action: **Set Variable** — Name: `engagement`
8. Now extract individual values from each:
   - **Get Dictionary Value** — Key: `total_posts`, From: Variable `stats`
   - **Set Variable** — `totalPosts`
   - **Get Dictionary Value** — Key: `total_views`, From: Variable `engagement`
   - **Set Variable** — `totalViews`
   - **Get Dictionary Value** — Key: `total_likes`, From: Variable `engagement`
   - **Set Variable** — `totalLikes`
9. Add action: **Text**:
   ```
   Threads Dashboard
   -----------------
   Total posts: {totalPosts}
   Total views: {totalViews}
   Total likes: {totalLikes}
   ```
   (Insert each variable inline using the variable picker)
10. Add action: **Quick Look**

**Test URLs:**
- `http://100.71.141.45:4322/api/posts/stats`
- `http://100.71.141.45:4322/api/metrics/summary`

---

### Recipe E: "Random Thread"

Surface a random post for reflection or sharing.

1. Create new shortcut, name it **Random Thread**
2. Add action: **Get Contents of URL**
   - URL: `http://100.71.141.45:4322/api/posts/random`
3. Add action: **Get Dictionary Value** — Key: `data`
4. Add action: **Get Dictionary Value** — Key: `text`
5. Add action: **Show Result**

To include metadata:

3. (alternate) **Get Dictionary Value** — Key: `data` -> **Set Variable** `post`
4. **Get Dictionary Value** — Key: `text`, From: `post`
5. **Set Variable** — `postText`
6. **Get Dictionary Value** — Key: `primary_tag`, From: `post`
7. **Set Variable** — `tag`
8. **Get Dictionary Value** — Key: `timestamp`, From: `post`
9. **Format Date** — Medium style
10. **Text** — `[{tag}] {date}\n\n{postText}`
11. **Quick Look**

**Test URL:** `http://100.71.141.45:4322/api/posts/random`

---

### Recipe F: "Top Posts This Week"

Top 5 posts ranked by views.

1. Create new shortcut, name it **Top Posts**
2. Add action: **Get Contents of URL**
   - URL: `http://100.71.141.45:4322/api/metrics/top?by=views&limit=5`
3. Add action: **Get Dictionary Value** — Key: `data`
4. Add action: **Set Variable** — Name: `rank`, Value: `0`
5. Add action: **Repeat with Each** — Input: *Dictionary Value*
6. Inside repeat:
   - **Calculate** — `rank + 1` -> **Set Variable** `rank`
   - **Get Dictionary Value** — Key: `text`, From: *Repeat Item*
   - **Get Dictionary Value** — Key: `views`, From: *Repeat Item*
   - **Text** — `#{rank} ({views} views)\n{text}\n`
   - **Add to Variable** — `output`
7. After repeat:
   - **Text** — `Top 5 Posts by Views\n==================\n\n{output}`
   - **Quick Look**

**Test URL:** `http://100.71.141.45:4322/api/metrics/top?by=views&limit=5`

Other valid `by` values: `likes`, `replies`, `reposts`, `quotes`, `shares`.

---

### Recipe G: "Posts by Tag"

Browse posts filtered by one of the 20 discourse tags.

1. Create new shortcut, name it **Posts by Tag**
2. Add action: **Choose from Menu**
   - Prompt: `Choose a tag`
   - Options (one per line):
     ```
     reaction
     one-liner
     question
     political
     tech
     race
     philosophy
     media
     personal
     finance
     sex-gender
     language
     meta-social
     food
     work
     daily-life
     commentary
     creative
     url-share
     unclassified
     ```
3. For each menu item, set the same flow:
   - Add action: **Text** — the tag name (e.g., `philosophy`)
   - Add action: **Set Variable** — Name: `selectedTag`

   Shortcut tip: to avoid repeating 20 times, use a **Choose from List** action instead:

   **Alternative (simpler):**
   2. Add action: **List**
      - Items: `reaction`, `one-liner`, `question`, `political`, `tech`, `race`, `philosophy`, `media`, `personal`, `finance`, `sex-gender`, `language`, `meta-social`, `food`, `work`, `daily-life`, `commentary`, `creative`, `url-share`, `unclassified`
   3. Add action: **Choose from List** — Input: *List*
   4. Add action: **URL Encode** — Input: *Chosen Item* (handles the hyphens)

4. Add action: **Text**
   - `http://100.71.141.45:4322/api/tags/{URL Encoded Text}?limit=10`
5. Add action: **Get Contents of URL** — URL: *Text*
6. Add action: **Get Dictionary Value** — Key: `data`
7. Add action: **Repeat with Each**
   - **Get Dictionary Value** — Key: `text`, From: *Repeat Item*
   - **Get Dictionary Value** — Key: `timestamp`, From: *Repeat Item*
   - **Format Date** — Short
   - **Text** — `[{date}] {text}\n`
   - **Add to Variable** — `output`
8. After repeat:
   - **Text** — `Posts tagged "{Chosen Item}":\n\n{output}`
   - **Quick Look**

**Test URL:** `http://100.71.141.45:4322/api/tags/philosophy?limit=10`

---

## 3. Advanced Patterns

### Time-Based Automations

Open Shortcuts > **Automation** tab > **+** > **Time of Day**.

**Morning digest (8 AM daily):**
1. Trigger: Time of Day, 8:00 AM, Daily
2. Run Shortcut: **My Last Posts** with input `10`
3. Or build a custom automation that fetches `/api/posts/today` and shows a notification with the count

**Weekly top posts (Sunday 9 PM):**
1. Trigger: Time of Day, 9:00 PM, Weekly (Sunday)
2. Action: Get Contents of URL `http://100.71.141.45:4322/api/metrics/top?by=views&limit=5`
3. Parse and send as a notification or save to Notes

### Chaining Shortcuts Together

Use **Run Shortcut** action to call one shortcut from another.

Example pipeline:
1. **Random Thread** shortcut returns a post
2. Pass the result to a second shortcut that copies it to clipboard or shares to Messages

To pass data between shortcuts:
- In the calling shortcut: **Run Shortcut** > select target > provide Input
- In the target shortcut: use **Shortcut Input** as the data source

### Saving Results to Notes

After any of the recipes above, replace the final **Quick Look** with:

1. Add action: **Create Note**
   - Body: *output variable*
   - Folder: pick a folder like "Threads Archive"
2. Or use **Append to Note** to add to a running log

### Sending to Obsidian

If you use Obsidian on iOS:

1. After getting your formatted text, add action: **Open URL**
   - URL: `obsidian://new?vault=YourVault&name=Threads%20{Current Date}&content={URL Encoded output}`

Or use the Obsidian Shortcuts actions if the Obsidian app exposes them.

### Sending to Other Apps

- **Messages/Mail**: Add action **Send Message** or **Send Email** with the output as body
- **Clipboard**: Add action **Copy to Clipboard** for quick paste anywhere
- **Files**: Add action **Save File** to save as a `.txt` to iCloud Drive

### Siri Integration

Every shortcut you create is automatically available via Siri. To customize the trigger phrase:

1. Open the shortcut in edit mode
2. Tap the shortcut name at the top
3. Tap **Add to Siri** (or it may be automatic in iOS 17+)
4. Record or type a phrase like "Search my threads"

Then say: **"Hey Siri, search my threads"** — Siri will run the shortcut and ask for your search query.

Good phrases to assign:
- "My last posts" -> Recipe A
- "Search my threads" -> Recipe B
- "Ask my threads" -> Recipe C
- "Threads stats" -> Recipe D
- "Random thread" -> Recipe E
- "Top posts" -> Recipe F

### Home Screen Widgets

1. Long-press your home screen > tap **+** > search **Shortcuts**
2. Choose a widget size (small = 1 shortcut, medium = 4, large = 8)
3. Long-press the widget > **Edit Widget** > select your Threads shortcuts
4. Tapping the widget runs the shortcut directly

For a single-tap daily random post, put the **Random Thread** shortcut on a small widget.

---

## 4. Troubleshooting

### Tailscale Not Connected

**Symptom:** "Could not connect to the server" error in Shortcuts.

**Fix:**
1. Open Tailscale app on your device
2. Toggle the VPN on
3. Verify `100.71.141.45` appears in the peer list
4. If missing, sign out and sign back in to Tailscale

### API Server Not Running

**Symptom:** Tailscale is connected but requests fail or timeout.

**Fix:**
1. SSH into the Mac mini: `ssh weixiangzhang@100.71.141.45`
2. Check if the server is running: `lsof -i :4322`
3. Start the server if needed (refer to the project's start command)
4. Verify with `curl http://localhost:4322/api/posts/stats`

### Timeout Issues

**Symptom:** Shortcuts shows a timeout error, especially on `/api/ask`.

**Fix:**
- The RAG endpoint (`/api/ask`) depends on Ollama and can take 10-30 seconds
- In the **Get Contents of URL** action, tap **Show More** and increase the timeout
- iOS Shortcuts has a hard timeout around 60 seconds for background execution; keep it in foreground
- If running as an automation, enable **Ask Before Running** to keep it foreground

### JSON Parsing Issues

**Symptom:** "The data couldn't be read because it isn't in the correct format."

**Fix:**
- Ensure **Get Contents of URL** is returning JSON (not HTML error page)
- Add a **Get Dictionary from Input** action after the URL fetch if Shortcuts doesn't auto-parse
- Check that dictionary key names match exactly (case-sensitive): `data`, `text`, `timestamp`, etc.
- Use **Quick Look** on the raw URL result first to inspect what you are actually getting

### "No Value" Errors in Repeat Loops

**Symptom:** Variables inside repeat loops show "No Value."

**Fix:**
- In Shortcuts, tap and hold the variable token to verify it references **Repeat Item**, not the outer dictionary
- Use explicit **Get Dictionary Value** actions rather than relying on Shortcuts' magic variable coercion

---

## 5. Alternative Approaches

### Direct API via Shortcuts (this guide)

The simplest approach. No extra apps required, works entirely within iOS Shortcuts with Tailscale as the network layer. Best for quick queries and automations.

### Scriptable (JavaScript on iOS)

[Scriptable](https://scriptable.app/) runs JavaScript natively on iOS and gives full control over HTTP requests, JSON parsing, and UI (tables, alerts, web views).

```javascript
const BASE = "http://100.71.141.45:4322";
const req = new Request(`${BASE}/api/posts/recent?limit=5`);
const res = await req.loadJSON();
const table = new UITable();
for (const post of res.data) {
  const row = new UITableRow();
  row.addText(post.text, new Date(post.timestamp).toLocaleDateString());
  table.addRow(row);
}
table.present();
```

Advantages: real programming language, better error handling, custom UI widgets, Siri integration.

### Pythonista (Python on iOS)

[Pythonista 3](http://omz-software.com/pythonista/) runs Python 3 on iOS with `requests`, `json`, and a native UI toolkit.

```python
import requests, json
r = requests.get("http://100.71.141.45:4322/api/posts/stats")
data = r.json()["data"]
print(f"Total posts: {data['total_posts']}")
```

Advantages: full Python ecosystem, pandas for analysis, matplotlib for charts.

### a-Shell (SSH + Direct Postgres)

[a-Shell](https://holzschu.github.io/a-Shell_iOS/) provides a terminal on iOS. SSH into the Mac mini and query Postgres directly:

```bash
ssh weixiangzhang@100.71.141.45
psql -U threads -d threads -h localhost -p 5433 \
  -c "SELECT text, timestamp FROM posts ORDER BY timestamp DESC LIMIT 5;"
```

Advantages: full SQL access, no API dependency, can run any analysis script.

### Pushcut (Webhook Automation)

[Pushcut](https://www.pushcut.io/) can receive webhooks and trigger Shortcuts or show rich notifications. Useful for push-based workflows:

1. Set up a Pushcut server action
2. Have the Mac mini cron job hit the Pushcut webhook when new posts are synced
3. Pushcut triggers a shortcut or shows a notification with the new post count

### IFTTT / Make (Zapier Alternative)

If the API were exposed via a Cloudflare Tunnel or public URL, you could use IFTTT/Make to build automations like:

- New post synced -> send Telegram/Slack/Discord message
- Daily digest -> email summary

This requires exposing the API publicly, which adds security considerations.

### Obsidian + Dataview

Export posts as markdown files and sync to Obsidian via iCloud:

1. A cron job on the Mac mini runs a script that exports recent posts to `.md` files
2. Files sync to iCloud -> Obsidian on iOS picks them up
3. Use Dataview plugin to query posts: `TABLE text, primary_tag FROM "threads"`

Advantages: offline access, full-text search in Obsidian, backlinks and tagging.

### Apple Notes + Shortcuts Periodic Sync

Use a Shortcuts automation to periodically fetch and append posts to an Apple Note:

1. Create a note called "Threads Daily Log"
2. Set up a daily automation at 11 PM
3. Fetch `/api/posts/today`
4. Format and append to the note using **Append to Note**

This builds a searchable archive in Apple Notes with zero extra apps.

---

## Appendix: API Endpoint Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/posts/recent?limit=N` | GET | Last N posts (default varies) |
| `/api/posts/search?q=term` | GET | Full-text search |
| `/api/posts/:id` | GET | Single post by ID |
| `/api/posts/random` | GET | Random post |
| `/api/posts/today` | GET | Today's posts |
| `/api/posts/stats` | GET | Aggregate corpus stats |
| `/api/metrics/top?by=views&limit=N` | GET | Top posts by metric |
| `/api/metrics/summary` | GET | Total engagement numbers |
| `/api/tags` | GET | All 20 tags with counts |
| `/api/tags/:tag` | GET | Posts filtered by tag |
| `/api/analysis/surprise?above=N` | GET | High-surprise posts |
| `/api/ask?q=question` | GET | RAG natural language query |
| `/api/openapi.json` | GET | OpenAPI spec |

All endpoints return: `{ ok: true, data: ..., meta: { ... } }`

Base URL for all examples: `http://100.71.141.45:4322`
