// How to use:
// 1. Set your Upstash Redis REST URL and TOKEN in Netlify environment variables:
//    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// 2. Deploy this function to Netlify in netlify/functions/like.js
// 3. Call /.netlify/functions/like (GET for count, POST to increment)

const fetch = require('node-fetch');

const UPSTASH_REDIS_REST_URL = "https://darling-rhino-14583.upstash.io";
const UPSTASH_REDIS_REST_TOKEN = "ATj3AAIjcDFiNGYxZGNmZGNjMWM0NmY3ODZlODRjMWYwZWQ3NjgxYnAxMA";
const COUNT_KEY = 'like-count';
const USERS_KEY = 'like-users'; // Set of user IPs who liked
const COMMENTS_KEY = 'like-comments';

exports.handler = async (event) => {
  const ip = event.headers['x-forwarded-for']?.split(',')[0] || event.headers['client-ip'] || 'unknown';

  // GET: like count and comments
  if (event.httpMethod === 'GET') {
    // If ?comments=1, return comments too
    const url = new URL(event.rawUrl || `http://dummy${event.path}${event.queryString ? '?' + event.queryString : ''}`);
    const wantComments = url.searchParams.get('comments');
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${COUNT_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
    const data = await res.json();
    let comments = [];
    if (wantComments) {
      const cres = await fetch(`${UPSTASH_REDIS_REST_URL}/lrange/${COMMENTS_KEY}/0/19`, {
        headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      });
      const cdata = await cres.json();
      comments = cdata.result || [];
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ count: parseInt(data.result) || 0, comments })
    };
  }

  // POST: like or comment
  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body); } catch {}
    // If comment, push to Redis list
    if (body.comment) {
      await fetch(`${UPSTASH_REDIS_REST_URL}/lpush/${COMMENTS_KEY}/${encodeURIComponent(body.comment)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
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
