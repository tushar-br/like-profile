// How to use:
// 1. Set your Upstash Redis REST URL and TOKEN in Netlify environment variables:
//    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// 2. Deploy this function to Netlify in netlify/functions/like.js
// 3. Call /.netlify/functions/like (GET for count, POST to increment)

const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const UPSTASH_REDIS_REST_URL = "https://darling-rhino-14583.upstash.io";
const UPSTASH_REDIS_REST_TOKEN = "ATj3AAIjcDFiNGYxZGNmZGNjMWM0NmY3ODZlODRjMWYwZWQ3NjgxYnAxMA";
const COUNT_KEY = 'like-count';
const USERS_KEY = 'like-users';
const COMMENTS_KEY = 'like-comments';

// Helper to get/set comment object
async function getComments() {
  const res = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${COMMENTS_KEY}`, {
    headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}
async function setComments(comments) {
  await fetch(`${UPSTASH_REDIS_REST_URL}/set/${COMMENTS_KEY}/${encodeURIComponent(JSON.stringify(comments))}`,
    { headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` } });
}

exports.handler = async (event) => {
  const ip = event.headers['x-forwarded-for']?.split(',')[0] || event.headers['client-ip'] || 'unknown';
  let comments = await getComments();

  // Helper to mark ownership and format date for frontend
  function mapComment(c) {
    return {
      id: c.id,
      text: c.text,
      date: c.created || Date.now(),
      isOwner: c.ip === ip
    };
  }

  if (event.httpMethod === 'GET') {
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${COUNT_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
    const data = await res.json();
    // Only send mapped comments to frontend
    return {
      statusCode: 200,
      body: JSON.stringify({ count: parseInt(data.result) || 0, comments: comments.map(mapComment) })
    };
  }

  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body); } catch {}
    // Add comment
    if (body.comment) {
      const newComment = {
        id: uuidv4(),
        text: body.comment,
        ip,
        created: Date.now()
      };
      comments.unshift(newComment);
      if (comments.length > 100) comments = comments.slice(0, 100);
      await setComments(comments);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    // Edit comment
    if (body.id && body.text) {
      const idx = comments.findIndex(c => c.id === body.id && c.ip === ip);
      if (idx !== -1) {
        comments[idx].text = body.text;
        await setComments(comments);
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }
      return { statusCode: 403, body: 'Not allowed' };
    }
    // Delete comment
    if (body.id && body.text === undefined) {
      const idx = comments.findIndex(c => c.id === body.id && c.ip === ip);
      if (idx !== -1) {
        comments.splice(idx, 1);
        await setComments(comments);
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }
      return { statusCode: 403, body: 'Not allowed' };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
