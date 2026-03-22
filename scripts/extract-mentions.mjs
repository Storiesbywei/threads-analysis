#!/usr/bin/env node
/**
 * extract-mentions.mjs — Extract @mentions from posts and conversations
 *
 * Populates the interactions table with:
 *   - reply_to: @mentions in reply posts from maybe_foucault
 *   - mention: additional @mentions in any post text
 *   - commented_on: comments from other users (conversations table)
 *   - quoted_by: quote posts, with any @mentions extracted
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnvIntoProcess } from './lib/threads-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvIntoProcess(path.join(__dirname, '..'));

import { query, close } from './db.mjs';

const MY_USERNAME = 'maybe_foucault';
const MENTION_RE = /@([a-zA-Z0-9._]+)/g;

function extractMentions(text) {
  if (!text) return [];
  const matches = [];
  let m;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const username = m[1].replace(/\.+$/, ''); // strip trailing dots
    if (username.length > 0 && username !== MY_USERNAME) {
      matches.push(username);
    }
  }
  return [...new Set(matches)];
}

async function upsertInteraction({ postId, from, to, type, text, timestamp }) {
  await query(`
    INSERT INTO interactions (post_id, from_username, to_username, interaction_type, post_text, timestamp)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (post_id, from_username, to_username, interaction_type) DO UPDATE SET
      post_text = COALESCE(EXCLUDED.post_text, interactions.post_text),
      timestamp = COALESCE(EXCLUDED.timestamp, interactions.timestamp)
  `, [postId, from, to, type, text, timestamp]);
}

async function processReplies() {
  console.log('Processing reply posts with @mentions...');
  const result = await query(`
    SELECT id, text, username, timestamp
    FROM posts
    WHERE variety = 'reply' AND text LIKE '%@%'
  `);

  let count = 0;
  for (const row of result.rows) {
    const mentions = extractMentions(row.text);
    for (const mention of mentions) {
      await upsertInteraction({
        postId: row.id,
        from: row.username || MY_USERNAME,
        to: mention,
        type: 'reply_to',
        text: row.text,
        timestamp: row.timestamp,
      });
      count++;
    }
  }
  console.log(`  -> ${count} reply_to interactions from ${result.rows.length} posts`);
  return count;
}

async function processQuotes() {
  console.log('Processing quote posts...');
  const result = await query(`
    SELECT id, text, username, timestamp
    FROM posts
    WHERE variety = 'quote'
  `);

  let count = 0;
  for (const row of result.rows) {
    const mentions = extractMentions(row.text);
    if (mentions.length > 0) {
      // Quote with explicit @mentions
      for (const mention of mentions) {
        await upsertInteraction({
          postId: row.id,
          from: row.username || MY_USERNAME,
          to: mention,
          type: 'quoted_by',
          text: row.text,
          timestamp: row.timestamp,
        });
        count++;
      }
    }
    // Note: we can't know who the original quoted post is from without the quoted post data
  }
  console.log(`  -> ${count} quoted_by interactions from ${result.rows.length} quote posts`);
  return count;
}

async function processConversations() {
  console.log('Processing conversations (comments from others)...');
  const result = await query(`
    SELECT c.root_post_id, c.reply_post_id, c.reply_username, c.reply_text, c.reply_timestamp
    FROM conversations c
    WHERE c.reply_username IS NOT NULL AND c.reply_username <> $1
  `, [MY_USERNAME]);

  let count = 0;
  for (const row of result.rows) {
    // The other user commented on our post
    await upsertInteraction({
      postId: row.reply_post_id,
      from: row.reply_username,
      to: MY_USERNAME,
      type: 'commented_on',
      text: row.reply_text,
      timestamp: row.reply_timestamp,
    });
    count++;

    // Also extract any @mentions in their comment
    const mentions = extractMentions(row.reply_text);
    for (const mention of mentions) {
      await upsertInteraction({
        postId: row.reply_post_id,
        from: row.reply_username,
        to: mention,
        type: 'mention',
        text: row.reply_text,
        timestamp: row.reply_timestamp,
      });
      count++;
    }
  }
  console.log(`  -> ${count} interactions from ${result.rows.length} conversation replies`);
  return count;
}

async function processAllMentions() {
  console.log('Processing all posts for @mentions (non-reply, non-quote)...');
  const result = await query(`
    SELECT id, text, username, timestamp
    FROM posts
    WHERE variety NOT IN ('reply', 'quote', 'repost')
      AND text LIKE '%@%'
  `);

  let count = 0;
  for (const row of result.rows) {
    const mentions = extractMentions(row.text);
    for (const mention of mentions) {
      await upsertInteraction({
        postId: row.id,
        from: row.username || MY_USERNAME,
        to: mention,
        type: 'mention',
        text: row.text,
        timestamp: row.timestamp,
      });
      count++;
    }
  }
  console.log(`  -> ${count} mention interactions from ${result.rows.length} posts`);
  return count;
}

async function main() {
  console.log('=== Extract Mentions ===\n');

  const replyCount = await processReplies();
  const quoteCount = await processQuotes();
  const convoCount = await processConversations();
  const mentionCount = await processAllMentions();

  const total = replyCount + quoteCount + convoCount + mentionCount;
  console.log(`\n=== Done ===`);
  console.log(`Total interactions upserted: ${total}`);

  // Print summary stats
  const stats = await query(`
    SELECT interaction_type, COUNT(*) as cnt
    FROM interactions
    GROUP BY interaction_type
    ORDER BY cnt DESC
  `);
  console.log('\nInteraction breakdown:');
  for (const row of stats.rows) {
    console.log(`  ${row.interaction_type}: ${row.cnt}`);
  }

  const uniqueUsers = await query(`
    SELECT COUNT(DISTINCT username) as cnt FROM (
      SELECT from_username AS username FROM interactions
      UNION
      SELECT to_username AS username FROM interactions
    ) u
  `);
  console.log(`\nUnique users: ${uniqueUsers.rows[0].cnt}`);

  const topInteracted = await query(`
    SELECT to_username, COUNT(*) as cnt
    FROM interactions
    WHERE from_username = $1
    GROUP BY to_username
    ORDER BY cnt DESC
    LIMIT 10
  `, [MY_USERNAME]);
  console.log(`\nTop 10 interacted-with users (from ${MY_USERNAME}):`);
  for (const row of topInteracted.rows) {
    console.log(`  @${row.to_username}: ${row.cnt}`);
  }

  await close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
