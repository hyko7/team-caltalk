// 오류 응답 형식, 내부 정보 숨김, CORS (BE-01, A3-5, S5-14, S5-3)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import express from 'express';
import { app } from '../src/app.js';
import { config } from '../src/config.js';
import { closePool } from '../src/db.js';
import { httpError } from '../src/lib/httpError.js';
import { logger } from '../src/lib/logger.js';
import { requestLogger, errorHandler } from '../src/middleware/errorHandler.js';
import { startServer } from './helpers.js';

// 오류 처리를 확인하려고 실제 app과 같은 순서로 미들웨어를 연결한 테스트용 앱
function buildTestApp() {
  const testApp = express();
  testApp.use(requestLogger);
  testApp.use(express.json());
  testApp.get('/http-error/:status', (req) => {
    throw httpError(Number(req.params.status), `오류 ${req.params.status}`);
  });
  testApp.post('/echo', (req, res) => res.json({ ok: true }));
  testApp.get('/internal', (req, res, next) => {
    next(new Error('relation "users" does not exist: SELECT * FROM users'));
  });
  testApp.get('/sync-throw', () => {
    throw new Error('sync boom');
  });
  testApp.get('/async-reject', async () => {
    throw new Error('async boom');
  });
  testApp.get('/bad-status', () => {
    throw Object.assign(new Error('x'), { status: 'abc' });
  });
  testApp.use((req, res) => res.status(404).json({ message: '요청한 경로를 찾을 수 없습니다' }));
  testApp.use(errorHandler);
  return testApp;
}

let real;
let fake;
before(async () => {
  real = await startServer(app);
  fake = await startServer(buildTestApp());
});
after(async () => {
  await real.close();
  await fake.close();
  await closePool();
});

// fetch는 Origin 헤더를 바꾸지 못할 수 있어 node:http로 보낸다
function getWithOrigin(url, origin) {
  return new Promise((resolve, reject) => {
    request(url, { headers: { Origin: origin } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.headers));
    })
      .on('error', reject)
      .end();
  });
}

test('없는 경로 GET은 404 { message }로 응답한다', async () => {
  const res = await fetch(`${real.baseUrl}/no-such-path`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { message: '요청한 경로를 찾을 수 없습니다' });
});

test('없는 경로 POST도 404로 응답한다', async () => {
  const res = await fetch(`${real.baseUrl}/no-such-path`, { method: 'POST' });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { message: '요청한 경로를 찾을 수 없습니다' });
});

for (const status of [400, 401, 403, 404, 409]) {
  test(`httpError(${status})는 ${status}와 { message }로 응답한다`, async () => {
    const res = await fetch(`${fake.baseUrl}/http-error/${status}`);
    assert.equal(res.status, status);
    assert.deepEqual(await res.json(), { message: `오류 ${status}` });
  });
}

test('잘못된 JSON 본문은 400으로 응답하고 파싱 오류 원문을 숨긴다', async () => {
  const res = await fetch(`${fake.baseUrl}/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad',
  });
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { message: '요청 본문이 올바르지 않습니다' });
  assert.ok(!text.includes('JSON') && !text.includes('Unexpected'));
});

test('예상하지 못한 오류는 500으로 응답하고 SQL·스택을 담지 않는다', async () => {
  const res = await fetch(`${fake.baseUrl}/internal`);
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { message: '서버 오류가 발생했습니다' });
  for (const word of ['SELECT', 'users', 'stack']) assert.ok(!text.includes(word), word);
});

for (const [name, path] of [
  ['동기 throw', '/sync-throw'],
  ['async 핸들러 거부', '/async-reject'],
  ['숫자가 아닌 status', '/bad-status'],
]) {
  test(`${name}는 500으로 응답한다`, async () => {
    const res = await fetch(`${fake.baseUrl}${path}`);
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { message: '서버 오류가 발생했습니다' });
  });
}

test('오류 로그에는 원본 message·status·stack·method·path만 남는다', async (t) => {
  const errorLog = t.mock.method(logger, 'error');
  const res = await fetch(`${fake.baseUrl}/internal?token=abc`);
  const text = await res.text();
  assert.equal(errorLog.mock.callCount(), 1);
  const [message, details] = errorLog.mock.calls[0].arguments;
  assert.equal(message, '요청 처리 실패');
  assert.deepEqual(Object.keys(details).sort(), ['message', 'method', 'path', 'stack', 'status']);
  assert.equal(details.message, 'relation "users" does not exist: SELECT * FROM users');
  assert.equal(details.status, 500);
  assert.equal(details.method, 'GET');
  assert.equal(details.path, '/internal');
  assert.equal(typeof details.stack, 'string');
  assert.ok(!text.includes(details.message));
});

test('실제 app의 GET /health는 200 { status, db }로 응답한다', async () => {
  const res = await fetch(`${real.baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', db: 'ok' });
});

test('프론트엔드 주소가 아닌 Origin은 CORS로 허용되지 않는다', async () => {
  const headers = await getWithOrigin(`${real.baseUrl}/health`, 'http://evil.example');
  assert.notEqual(headers['access-control-allow-origin'], 'http://evil.example');
  assert.equal(headers['access-control-allow-origin'], config.corsOrigin);
});

test('프론트엔드 주소 Origin은 CORS로 허용된다', async () => {
  const headers = await getWithOrigin(`${real.baseUrl}/health`, config.corsOrigin);
  assert.equal(headers['access-control-allow-origin'], config.corsOrigin);
});
