// 회원가입·로그인 API (BE-02, FR-01, FR-02, BR-16, NFR-04, S5-6, S5-8, S5-12, S5-13)
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { config } from '../src/config.js';
import { query, closePool } from '../src/db.js';
import { logger } from '../src/lib/logger.js';
import { resetDatabase, startServer, createUserAndLogin } from './helpers.js';

const MSG = {
  signupInput: '이메일과 이름을 올바르게 입력해 주세요',
  shortPassword: '비밀번호는 8자 이상이어야 합니다',
  emailTaken: '이미 가입한 이메일입니다',
  loginInput: '이메일과 비밀번호를 입력해 주세요',
  loginFailed: '이메일 또는 비밀번호가 맞지 않습니다',
  badJson: '요청 본문이 올바르지 않습니다',
};
const HASH_RE = /^[0-9a-f]{32}:[0-9a-f]{128}$/;
const valid = { email: 'hong@test.dev', password: 'password123', name: '홍길동' };

let server;
before(async () => {
  server = await startServer(app);
});
beforeEach(() => resetDatabase());
after(async () => {
  await server.close();
  await closePool();
});

// 응답이 끝난 뒤(finish) 남는 요청 로그까지 기다린다
async function send(path, options) {
  const res = await fetch(`${server.baseUrl}${path}`, { method: 'POST', ...options });
  const text = await res.text();
  await new Promise((resolve) => setImmediate(resolve));
  return { status: res.status, text, body: text ? JSON.parse(text) : undefined };
}

function post(path, body) {
  return send(path, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function userCount() {
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  return rows[0].n;
}

test('가입: 비밀번호 7자는 400이고 행이 늘지 않는다', async () => {
  const res = await post('/api/auth/signup', { ...valid, password: 'abcdefg' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: MSG.shortPassword });
  assert.equal(await userCount(), 0);
});

test('가입: 비밀번호가 문자열이 아니면(숫자·없음) 400이다', async () => {
  for (const password of [12345678, undefined]) {
    const res = await post('/api/auth/signup', { ...valid, password });
    assert.equal(res.status, 400, String(password));
    assert.deepEqual(res.body, { message: MSG.shortPassword });
  }
  assert.equal(await userCount(), 0);
});

test('가입: 비밀번호 8자는 201이다', async () => {
  const res = await post('/api/auth/signup', { ...valid, password: 'abcdefgh' });
  assert.equal(res.status, 201);
  assert.equal(await userCount(), 1);
});

test('가입: 이메일이 비었거나 형식이 틀리면 400이고 행이 0개다', async () => {
  for (const email of ['', '   ', 'abc', 'a@b', 'a b@c.d', 123]) {
    const res = await post('/api/auth/signup', { ...valid, email });
    assert.equal(res.status, 400, String(email));
    assert.deepEqual(res.body, { message: MSG.signupInput });
  }
  assert.equal(await userCount(), 0);
});

test('가입: 이름이 비었거나 공백뿐이거나 문자열이 아니면 400이고 행이 0개다', async () => {
  for (const name of ['', '   ', 123, null, undefined]) {
    const res = await post('/api/auth/signup', { ...valid, name });
    assert.equal(res.status, 400, String(name));
    assert.deepEqual(res.body, { message: MSG.signupInput });
  }
  assert.equal(await userCount(), 0);
});

test('가입: 이메일·이름 오류가 비밀번호 오류보다 먼저 검사된다', async () => {
  for (const body of [
    { ...valid, email: 'abc', password: 'short' },
    { ...valid, name: '', password: 'short' },
  ]) {
    const res = await post('/api/auth/signup', body);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { message: MSG.signupInput });
  }
});

test('가입: 본문이 없거나 JSON이 아니면 500이 아니라 400이다', async () => {
  const cases = [
    ['본문 없음', {}],
    ['text/plain', { headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(valid) }],
    ['빈 객체', { headers: { 'Content-Type': 'application/json' }, body: '{}' }],
    ['배열', { headers: { 'Content-Type': 'application/json' }, body: '[]' }],
  ];
  for (const [label, options] of cases) {
    const res = await send('/api/auth/signup', options);
    assert.equal(res.status, 400, label);
    assert.deepEqual(res.body, { message: MSG.signupInput }, label);
  }
  assert.equal(await userCount(), 0);
});

test("가입: 문법이 깨진 JSON은 400 '요청 본문이 올바르지 않습니다'이다", async () => {
  const res = await send('/api/auth/signup', { headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: MSG.badJson });
});

test('가입: 같은 이메일로 두 번째 가입은 409이고 행은 1개다', async () => {
  assert.equal((await post('/api/auth/signup', valid)).status, 201);
  const res = await post('/api/auth/signup', { ...valid, name: '다른사람' });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { message: MSG.emailTaken });
  assert.equal(await userCount(), 1);
});

test('가입: 대소문자만 다른 이메일도 409이다', async () => {
  assert.equal((await post('/api/auth/signup', { ...valid, email: 'case@test.dev' })).status, 201);
  const res = await post('/api/auth/signup', { ...valid, email: 'CASE@Test.DEV' });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { message: MSG.emailTaken });
  assert.equal(await userCount(), 1);
});

test('가입: 정상 요청은 201이고 응답 키는 정확히 [id, name]이다', async () => {
  const res = await post('/api/auth/signup', valid);
  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(res.body).sort(), ['id', 'name']);
  assert.equal(typeof res.body.id, 'number');
  assert.equal(res.body.name, valid.name);
  assert.ok(!res.text.includes(valid.password));
  assert.ok(!res.text.includes('password_hash'));
  assert.doesNotMatch(res.text, /[0-9a-f]{32}:[0-9a-f]{128}/);
});

test('가입: password_hash는 원문과 다르고 salt:key 형식이다', async () => {
  await post('/api/auth/signup', { ...valid, email: 'a@test.dev' });
  await post('/api/auth/signup', { ...valid, email: 'b@test.dev' });
  const { rows } = await query('SELECT password_hash FROM users ORDER BY id');
  assert.equal(rows.length, 2);
  for (const { password_hash: hash } of rows) {
    assert.notEqual(hash, valid.password);
    assert.match(hash, HASH_RE);
  }
  assert.notEqual(rows[0].password_hash, rows[1].password_hash);
});

test('가입: 이메일은 소문자로 저장된다', async () => {
  assert.equal((await post('/api/auth/signup', { ...valid, email: '  Upper@Test.DEV  ' })).status, 201);
  const { rows } = await query('SELECT email FROM users');
  assert.deepEqual(rows, [{ email: 'upper@test.dev' }]);
});

test('가입: 이름의 앞뒤 공백은 제거되어 저장·응답된다', async () => {
  const response = await post('/api/auth/signup', { ...valid, name: '  홍길동  ' });
  assert.equal(response.status, 201);
  assert.equal(response.body.name, '홍길동');
  const { rows } = await query('SELECT name FROM users');
  assert.deepEqual(rows, [{ name: '홍길동' }]);
});

test('로그인: 빈 값·문자열 아님·본문 없음은 400이다', async () => {
  for (const body of [
    { email: '', password: 'password123' },
    { email: 'hong@test.dev', password: '' },
    { email: 123, password: 'password123' },
    { email: 'hong@test.dev', password: 12345678 },
    { password: 'password123' },
    {},
  ]) {
    const res = await post('/api/auth/login', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { message: MSG.loginInput });
  }
  const res = await send('/api/auth/login', {});
  assert.equal(res.status, 400, '본문 없음');
  assert.deepEqual(res.body, { message: MSG.loginInput });
});

test('로그인: 틀린 비밀번호와 없는 이메일은 같은 401 메시지다', async () => {
  await post('/api/auth/signup', valid);
  const wrongPassword = await post('/api/auth/login', { email: valid.email, password: 'wrong-password' });
  const noEmail = await post('/api/auth/login', { email: 'nobody@test.dev', password: valid.password });
  assert.equal(wrongPassword.status, 401);
  assert.equal(noEmail.status, 401);
  assert.deepEqual(wrongPassword.body, { message: MSG.loginFailed });
  assert.deepEqual(noEmail.body, wrongPassword.body);
});

test("로그인: 이메일이나 비밀번호에 ' OR 1=1 -- 를 넣어도 401이다", async () => {
  await post('/api/auth/signup', valid);
  for (const body of [
    { email: "' OR 1=1 --", password: valid.password },
    { email: `${valid.email}' OR 1=1 --`, password: valid.password },
    { email: valid.email, password: "' OR 1=1 --" },
  ]) {
    const res = await post('/api/auth/login', body);
    assert.equal(res.status, 401, JSON.stringify(body));
    assert.deepEqual(res.body, { message: MSG.loginFailed });
  }
});

test('로그인: seed 자리 표시 해시 행으로 로그인해도 500이 아니라 401이다', async () => {
  await query('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)', [
    'seed01@caltalk.dev',
    'seed-placeholder-not-a-real-hash',
    '시드',
  ]);
  const res = await post('/api/auth/login', { email: 'seed01@caltalk.dev', password: 'password123' });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: MSG.loginFailed });
});

test('로그인: 성공하면 200과 { token, user:{id,name} }을 돌려준다', async () => {
  const signup = await post('/api/auth/signup', valid);
  const res = await post('/api/auth/login', { email: valid.email, password: valid.password });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['token', 'user']);
  assert.deepEqual(Object.keys(res.body.user).sort(), ['id', 'name']);
  assert.equal(typeof res.body.token, 'string');
  assert.deepEqual(res.body.user, { id: signup.body.id, name: valid.name });
  assert.ok(!res.text.includes(valid.email));
  assert.ok(!res.text.includes('password_hash'));
  assert.doesNotMatch(res.text, /[0-9a-f]{32}:[0-9a-f]{128}/);
});

test('로그인: 대문자가 섞인 이메일로도 로그인된다', async () => {
  await post('/api/auth/signup', { ...valid, email: 'user@test.dev' });
  const res = await post('/api/auth/login', { email: '  User@Test.DEV  ', password: valid.password });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.name, valid.name);
});

test('로그인: 토큰 payload 키는 exp, iat, sub뿐이고 sub는 사용자 id 문자열이다', async () => {
  const signup = await post('/api/auth/signup', valid);
  const res = await post('/api/auth/login', { email: valid.email, password: valid.password });
  const payload = jwt.verify(res.body.token, config.jwtSecret);
  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub']);
  assert.equal(payload.sub, String(signup.body.id));
});

test('로그인: 토큰 만료는 발급 후 약 7일이다', async () => {
  await post('/api/auth/signup', valid);
  const res = await post('/api/auth/login', { email: valid.email, password: valid.password });
  const { exp, iat } = jwt.verify(res.body.token, config.jwtSecret);
  assert.ok(Math.abs(exp - iat - 604800) <= 60, `exp-iat=${exp - iat}`);
});

test('로그: 가입·로그인·실패 요청 모두 로그에 비밀번호·해시·토큰이 없다', async (t) => {
  const password = 'pw-Zx9-secret';
  const shortPassword = 'pw-Zx9!';
  const user = { email: 'log@test.dev', password, name: '로그' };
  const info = t.mock.method(logger, 'info');
  const error = t.mock.method(logger, 'error');

  // 흐름마다 로그를 따로 모은다
  const flows = {};
  async function capture(label, fn) {
    info.mock.resetCalls();
    error.mock.resetCalls();
    const res = await fn();
    assert.ok(info.mock.calls.some((c) => c.arguments[0] === '요청'), `${label}: 요청 로그 없음`);
    flows[label] = {
      res,
      text: JSON.stringify([...info.mock.calls, ...error.mock.calls].map((c) => c.arguments)),
      errorMessages: error.mock.calls.map((c) => c.arguments[0]),
    };
  }

  await capture('가입 성공', () => post('/api/auth/signup', user));
  await capture('로그인 성공', () => post('/api/auth/login', { email: user.email, password }));
  await capture('중복 가입 409', () => post('/api/auth/signup', user));
  await capture('틀린 비밀번호 401', () => post('/api/auth/login', { email: user.email, password: `${password}x` }));
  await capture('짧은 비밀번호 400', () =>
    post('/api/auth/signup', { ...user, email: 'short@test.dev', password: shortPassword }),
  );

  assert.equal(flows['가입 성공'].res.status, 201);
  assert.equal(flows['로그인 성공'].res.status, 200);
  assert.equal(flows['중복 가입 409'].res.status, 409);
  assert.equal(flows['틀린 비밀번호 401'].res.status, 401);
  assert.equal(flows['짧은 비밀번호 400'].res.status, 400);

  // 409에서 오류 로그가 실제로 남아야 아래 검사가 빈 검사가 되지 않는다
  const conflictErrors = flows['중복 가입 409'].errorMessages;
  assert.ok(conflictErrors.filter((m) => m === 'DB 쿼리 실패').length >= 1, 'DB 쿼리 실패 로그 없음');
  assert.ok(conflictErrors.filter((m) => m === '요청 처리 실패').length >= 1, '요청 처리 실패 로그 없음');

  const { rows } = await query('SELECT password_hash FROM users WHERE email = $1', [user.email]);
  const secrets = [password, shortPassword, rows[0].password_hash, flows['로그인 성공'].res.body.token];
  for (const [label, { text }] of Object.entries(flows)) {
    for (const secret of secrets) assert.ok(!text.includes(secret), `${label}: ${secret.slice(0, 8)}...`);
  }
});

test('helpers: createUserAndLogin은 실제 API로 사용자를 만들고 { user, token, email, password }를 돌려준다', async () => {
  const result = await createUserAndLogin(server.baseUrl, { email: 'helper@test.dev', name: '도우미' });
  assert.deepEqual(Object.keys(result).sort(), ['email', 'password', 'token', 'user']);
  assert.equal(result.email, 'helper@test.dev');
  assert.equal(result.password, 'password123');
  assert.equal(typeof result.user.id, 'number');
  assert.equal(result.user.name, '도우미');
  assert.equal(jwt.verify(result.token, config.jwtSecret).sub, String(result.user.id));
  const { rows } = await query('SELECT id::int AS id, email FROM users');
  assert.deepEqual(rows, [{ id: result.user.id, email: 'helper@test.dev' }]);
});

test('helpers: createUserAndLogin은 email을 안 넘기면 서로 다른 user<N>@test.dev를 만든다', async () => {
  const first = await createUserAndLogin(server.baseUrl);
  const second = await createUserAndLogin(server.baseUrl);
  assert.match(first.email, /^user\d+@test\.dev$/);
  assert.match(second.email, /^user\d+@test\.dev$/);
  assert.notEqual(first.email, second.email);
  assert.notEqual(first.user.id, second.user.id);
});

test('helpers: createUserAndLogin은 가입이 실패하면 오류를 던진다', async () => {
  await createUserAndLogin(server.baseUrl, { email: 'dup@test.dev' });
  await assert.rejects(createUserAndLogin(server.baseUrl, { email: 'dup@test.dev' }), /이미 가입한 이메일입니다/);
});
