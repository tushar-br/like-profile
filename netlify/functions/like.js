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

exports.handler = async (event) => {
  const ip = event.headers['x-forwarded-for']?.split(',')[0] || event.headers['client-ip'] || 'unknown';

  if (event.httpMethod === 'GET') {
    // Get like count
    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${COUNT_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
    const data = await res.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ count: parseInt(data.result) || 0 })
    };
  }

  if (event.httpMethod === 'POST') {
    // Check if user already liked
    const checkRes = await fetch(`${UPSTASH_REDIS_REST_URL}/sismember/${USERS_KEY}/${ip}`, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
    const checkData = await checkRes.json();
    if (checkData.result === 1) {
      // Already liked
      const countRes = await fetch(`${UPSTASH_REDIS_REST_URL}/get/${COUNT_KEY}`, {
        headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
      });
      const countData = await countRes.json();
      return {
        statusCode: 200,
        body: JSON.stringify({ count: parseInt(countData.result) || 0, liked: true })
      };
    }
    // Add user to set and increment count
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
