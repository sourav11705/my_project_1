const http = require('http');
const { randomUUID } = require('crypto');
const { parseJsonBody, sendJson } = require('./src/utils/http');
const { compare } = require('./src/services/comparisonService');

const HOST = process.env.API_HOST || '0.0.0.0';
const PORT = Number(process.env.API_PORT || 4174);

// In-memory analytics log (rotated at 1000 entries for demo)
const analyticsLog = [];
const MAX_LOG = 1000;

function emitAnalytics(event) {
  const entry = {
    event_id: randomUUID(),
    occurred_at: new Date().toISOString(),
    event_source: 'backend',
    app_version: '0.2.0',
    ...event,
  };
  analyticsLog.push(entry);
  if (analyticsLog.length > MAX_LOG) analyticsLog.shift();
  // Also console in dev for visibility
  console.info('[analytics/backend]', entry.event_name, JSON.stringify(entry.properties));
  return entry;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return sendJson(res, 400, { error: 'Bad request' });

  if (req.method === 'GET' && req.url === '/api/v1/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'pricepulse-prototype-api',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === 'POST' && req.url === '/api/v1/compare') {
    const startedAt = Date.now();
    try {
      const body = await parseJsonBody(req);
      const response = compare(body, { emitAnalytics, startedAt });
      return sendJson(res, 200, response);
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      emitAnalytics({
        event_name: 'compare_response_failed',
        properties: {
          category: error.category || 'unknown',
          error_code: error.message || 'Unknown error',
          response_latency_ms: latencyMs,
          http_status: error.statusCode || 400,
        },
      });
      return sendJson(res, error.statusCode || 400, { error: error.message || 'Failed to compare' });
    }
  }

  // Analytics ingestion endpoint (frontend posts events here too)
  if (req.method === 'POST' && req.url === '/api/v1/analytics') {
    try {
      const body = await parseJsonBody(req);
      const entry = {
        event_id: body.event_id || randomUUID(),
        event_name: body.event_name,
        occurred_at: body.occurred_at || new Date().toISOString(),
        event_source: body.event_source || 'frontend',
        user_id: body.user_id || null,
        anonymous_id: body.anonymous_id || null,
        session_id: body.session_id || null,
        app_version: body.app_version || '0.2.0',
        properties: body.properties || {},
      };
      analyticsLog.push(entry);
      if (analyticsLog.length > MAX_LOG) analyticsLog.shift();
      console.info('[analytics/frontend]', entry.event_name, JSON.stringify(entry.properties));
      return sendJson(res, 200, { status: 'ok', event_id: entry.event_id });
    } catch (error) {
      return sendJson(res, 400, { error: 'Failed to ingest analytics event' });
    }
  }

  // Debug endpoint to view recent events
  if (req.method === 'GET' && req.url === '/api/v1/analytics/recent') {
    return sendJson(res, 200, { count: analyticsLog.length, events: analyticsLog.slice(-50) });
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`PricePulse API listening on http://${HOST}:${PORT}`);
});

module.exports = { emitAnalytics };