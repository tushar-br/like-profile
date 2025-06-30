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

  if (event.httpMethod === 'GET') {
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${COUNT_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
    const data = await res.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ count: parseInt(data.result) || 0, comments })
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
        likes: [],
        dislikes: [],
        created: Date.now()
      };
      comments.unshift(newComment);
      if (comments.length > 100) comments = comments.slice(0, 100);
      await setComments(comments);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    // Edit comment
    if (body.edit && body.id) {
      const idx = comments.findIndex(c => c.id === body.id && c.ip === ip);
      if (idx !== -1) {
        comments[idx].text = body.edit;
        await setComments(comments);
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }
      return { statusCode: 403, body: 'Not allowed' };
    }
    // Delete comment
    if (body.delete && body.id) {
      const idx = comments.findIndex(c => c.id === body.id && c.ip === ip);
      if (idx !== -1) {
        comments.splice(idx, 1);
        await setComments(comments);
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }
      return { statusCode: 403, body: 'Not allowed' };
    }
    // Like/dislike comment
    if ((body.like || body.dislike) && body.id) {
      const idx = comments.findIndex(c => c.id === body.id);
      if (idx !== -1) {
        if (body.like) {
          if (!comments[idx].likes.includes(ip)) comments[idx].likes.push(ip);
          comments[idx].dislikes = comments[idx].dislikes.filter(x => x !== ip);
        }
        if (body.dislike) {
          if (!comments[idx].dislikes.includes(ip)) comments[idx].dislikes.push(ip);
          comments[idx].likes = comments[idx].likes.filter(x => x !== ip);
        }
        await setComments(comments);
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      }
      return { statusCode: 404, body: 'Not found' };
    }
    // Like logic (same as before)
    const checkRes = await fetch(`${UPSTASH_REDIS_REST_URL}/sismember/${USERS_KEY}/${ip}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
    const checkData = await checkRes.json();
    if (checkData.result === 1) {
      const countRes = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${COUNT_KEY}`, {
        headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      });
      const countData = await countRes.json();
      return {
        statusCode: 200,
        body: JSON.stringify({ count: parseInt(countData.result) || 0, liked: true })
      };
    }
    await fetch(`${UPSTASH_REDIS_REST_URL}/sadd/${USERS_KEY}/${ip}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
    const incRes = await fetch(`${UPSTASH_REDIS_REST_URL}/incr/${COUNT_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
    const incData = await incRes.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ count: parseInt(incData.result), liked: true })
    };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
