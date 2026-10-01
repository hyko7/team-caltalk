// 요청 로그와 logger 출력 조건 (BE-01, S5-13)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { config } from '../src/config.js';
import { closePool } from '../src/db.js';
import { logger } from '../src/lib/logger.js';
import { requestLogger, errorHandler } from '../src/middleware/errorHandler.js';
import { startServer } from './helpers.js';

const testApp = express();
testApp.use(requestLogger);
testApp.use(express.json());
testApp.get('/ok', (req, res) => res.json({ ok: true }));
testApp.post('/ok', (req, res) => res.json({ ok: true }));
testApp.get('/boom', () => {
  throw new Error('boom');
});
testApp.use((req, res) => res.status(404).json({ message: '요청한 경로를 찾을 수 없습니다' }));
testApp.use(errorHandler);

let server;
before(async () => {
  server = await startServer(testApp);
});
after(async () => {
  await server.close();
  // app.js를 직접 쓰지 않아도 db.js 풀이 열려 있을 수 있어 닫는다
  await closePool();
});

// 응답이 끝난 뒤(finish) 남는 요청 로그까지 기다린다
async function send(path, options) {
  const res = await fetch(`${server.baseUrl}${path}`, options);
  await res.text();
  await new Promise((resolve) => setImmediate(resolve));
  return res;
}

function requestLogs(infoLog) {
  return infoLog.mock.calls.filter((call) => call.arguments[0] === '요청').map((call) => call.arguments[1]);
}

test('요청 로그에는 method, path, status, durationMs만 남는다', async (t) => {
  const infoLog = t.mock.method(logger, 'info');
  await send('/ok');
  const logs = requestLogs(infoLog);
  assert.equal(logs.length, 1);
  const { durationMs, ...rest } = logs[0];
  assert.deepEqual(Object.keys(logs[0]).sort(), ['durationMs', 'method', 'path', 'status']);
  assert.deepEqual(rest, { method: 'GET', path: '/ok', status: 200 });
  assert.equal(typeof durationMs, 'number');
  assert.ok(durationMs >= 0);
});

test('요청 로그에 쿼리 문자열이 남지 않는다', async (t) => {
  const infoLog = t.mock.method(logger, 'info');
  await send('/ok?token=secret&password=1234');
  const text = JSON.stringify(infoLog.mock.calls.map((call) => call.arguments));
  for (const word of ['secret', '1234', 'token', 'password']) assert.ok(!text.includes(word), word);
});

test('토큰·비밀번호·메시지 본문은 로그에 남지 않는다', async (t) => {
  const infoLog = t.mock.method(logger, 'info');
  const errorLog = t.mock.method(logger, 'error');
  await send('/ok', {
    method: 'POST',
    headers: { Authorization: 'Bearer SUPER_SECRET_TOKEN', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'pw-1234', content: '메시지본문' }),
  });
  assert.equal(requestLogs(infoLog).length, 1);
  const text = JSON.stringify([...infoLog.mock.calls, ...errorLog.mock.calls].map((call) => call.arguments));
  for (const word of ['SUPER_SECRET_TOKEN', 'pw-1234', '메시지본문']) assert.ok(!text.includes(word), word);
});

for (const [path, status] of [['/no-such-path', 404], ['/boom', 500]]) {
  test(`${status} 응답에도 요청 로그가 남는다`, async (t) => {
    const infoLog = t.mock.method(logger, 'info');
    t.mock.method(logger, 'error');
    const res = await send(path);
    assert.equal(res.status, status);
    const logs = requestLogs(infoLog);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, status);
    assert.equal(logs[0].path, path);
  });
}

// config.isDevelopment를 바꾼 뒤 반드시 원래 값으로 되돌린다
function withDevelopment(t, value) {
  const original = config.isDevelopment;
  config.isDevelopment = value;
  t.after(() => {
    config.isDevelopment = original;
  });
}

test('개발 환경이 아니면 logger는 아무것도 출력하지 않는다', (t) => {
  withDevelopment(t, false);
  const log = t.mock.method(console, 'log', () => {});
  const error = t.mock.method(console, 'error', () => {});
  logger.info('x');
  logger.error('x', { a: 1 });
  assert.equal(log.mock.callCount(), 0);
  assert.equal(error.mock.callCount(), 0);
});

test('개발 환경에서는 수준과 메시지를 한 번 출력한다', (t) => {
  withDevelopment(t, true);
  const log = t.mock.method(console, 'log', () => {});
  const error = t.mock.method(console, 'error', () => {});
  logger.info('info-message');
  logger.error('error-message', { a: 1 });
  assert.equal(log.mock.callCount(), 1);
  assert.equal(error.mock.callCount(), 1);
  assert.match(log.mock.calls[0].arguments[0], /INFO info-message/);
  assert.equal(log.mock.calls[0].arguments.length, 1);
  assert.match(error.mock.calls[0].arguments[0], /ERROR error-message/);
  assert.deepEqual(error.mock.calls[0].arguments[1], { a: 1 });
});
