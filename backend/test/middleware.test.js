// 로그인·팀 소속·팀장 확인 미들웨어 (BE-03, BR-01, BR-03, BR-09, BR-10, SC-02, SC-14, S5-8, S5-9, S5-11, S5-12)
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { config } from '../src/config.js';
import { query, closePool } from '../src/db.js';
import { httpError } from '../src/lib/httpError.js';
import { logger } from '../src/lib/logger.js';
import { requestLogger, errorHandler } from '../src/middleware/errorHandler.js';
import { requireLogin } from '../src/middleware/auth.js';
import { requireTeamMember, requireLeader } from '../src/middleware/team.js';
import { authRouter } from '../src/routes/auth.js';
import { resetDatabase, startServer, createUserAndLogin, createTeam, addMember } from './helpers.js';

const MSG = {
  login: '로그인이 필요합니다',
  badTeamId: '팀 ID가 올바르지 않습니다',
  forbidden: '접근 권한이 없습니다',
  leaderOnly: '팀장만 할 수 있습니다',
};

// 제품 라우트 없이 미들웨어만 확인하는 테스트용 앱 (제품 코드에 넣지 않는다)
let handlerCalls = 0;
const testApp = express();
testApp.use(requestLogger);
testApp.use(express.json());
testApp.use('/api/auth', authRouter);
testApp.get('/api/teams/:teamId/ping', requireLogin, requireTeamMember, (req, res) => {
  handlerCalls += 1;
  res.json({ user: req.user, team: req.team });
});
testApp.get('/api/teams/:teamId/leader-only', requireLogin, requireTeamMember, requireLeader, (req, res) => {
  handlerCalls += 1;
  res.json({ ok: true });
});
testApp.use((req, res, next) => next(httpError(404, '요청한 경로를 찾을 수 없습니다')));
testApp.use(errorHandler);

let testServer;
let appServer;
let leaderUser;
let memberUser;
let outsider;
let teamA;
let teamB;
let memberAId;

before(async () => {
  await resetDatabase();
  testServer = await startServer(testApp);
  appServer = await startServer(app);
  leaderUser = await createUserAndLogin(testServer.baseUrl);
  memberUser = await createUserAndLogin(testServer.baseUrl);
  outsider = await createUserAndLogin(testServer.baseUrl);
  teamA = await createTeam(leaderUser.user.id);
  teamB = await createTeam(memberUser.user.id);
  // memberUser는 팀 A에서 팀원, 팀 B에서 팀장이다
  memberAId = await addMember(memberUser.user.id, teamA.id, 'member');
});
beforeEach(() => {
  handlerCalls = 0;
});
after(async () => {
  await testServer.close();
  await appServer.close();
  await closePool();
});

// 응답이 끝난 뒤(finish) 남는 요청 로그까지 기다린다
async function getWithHeader(path, headerValue) {
  const headers = headerValue === undefined ? {} : { Authorization: headerValue };
  const res = await fetch(`${testServer.baseUrl}${path}`, { headers });
  const text = await res.text();
  await new Promise((resolve) => setImmediate(resolve));
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}
function get(path, token) {
  return getWithHeader(path, token ? `Bearer ${token}` : undefined);
}
function requestLogs(infoLog) {
  return infoLog.mock.calls.filter((c) => c.arguments[0] === '요청').map((c) => c.arguments[1]);
}
const ping = (teamId) => `/api/teams/${teamId}/ping`;
const leaderOnly = (teamId) => `/api/teams/${teamId}/leader-only`;
const expiredToken = () => jwt.sign({}, config.jwtSecret, { subject: '1', expiresIn: -10 });
const otherSecretToken = () => jwt.sign({}, 'other-secret', { subject: '1' });

// ---- 토큰·로그인 (완료 조건 1, 2, 10) ----

test('토큰이 없으면 401이고 핸들러가 실행되지 않는다', async () => {
  const res = await get(ping(teamA.id));
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: MSG.login });
  assert.equal(handlerCalls, 0);
});

test('Authorization 형식이 틀리면 401이다', async () => {
  // 'Bearer '는 fetch가 끝 공백을 지워 'Bearer'로 보낼 수 있다. 어느 쪽이든 401이어야 한다
  for (const header of ['Bearer abc', 'Bearer', 'Bearer ', 'Basic xxx']) {
    const res = await getWithHeader(ping(teamA.id), header);
    assert.equal(res.status, 401, header);
    assert.deepEqual(res.body, { message: MSG.login }, header);
  }
  assert.equal(handlerCalls, 0);
});

test('다른 비밀키로 서명한 토큰은 401이다', async () => {
  const res = await get(ping(teamA.id), otherSecretToken());
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: MSG.login });
  assert.equal(handlerCalls, 0);
});

test('만료된 토큰은 401이다', async () => {
  const res = await get(ping(teamA.id), expiredToken());
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: MSG.login });
  assert.equal(handlerCalls, 0);
});

test('sub가 없는 토큰은 401이다', async () => {
  const res = await get(ping(teamA.id), jwt.sign({}, config.jwtSecret));
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: MSG.login });
  assert.equal(handlerCalls, 0);
});

test('문자열 payload 토큰은 401이다', async () => {
  const res = await get(ping(teamA.id), jwt.sign('plain-string', config.jwtSecret));
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: MSG.login });
  assert.equal(handlerCalls, 0);
});

test('sub가 숫자 형식이 아닌 토큰은 401이다', async () => {
  for (const sub of ['', 'abc', '1e3', '0', '-1', '99999999999999999999']) {
    // 빈 문자열은 subject 옵션 대신 payload에 직접 넣는다
    const token = sub === '' ? jwt.sign({ sub }, config.jwtSecret) : jwt.sign({}, config.jwtSecret, { subject: sub });
    const res = await get(ping(teamA.id), token);
    assert.equal(res.status, 401, JSON.stringify(sub));
    assert.deepEqual(res.body, { message: MSG.login }, JSON.stringify(sub));
  }
  assert.equal(handlerCalls, 0);
});

test("모든 401의 본문이 { message: '로그인이 필요합니다' }로 같다", async () => {
  const responses = [
    await getWithHeader(ping(teamA.id)),
    await getWithHeader(ping(teamA.id), 'Basic xxx'),
    await get(ping(teamA.id), otherSecretToken()),
    await get(ping(teamA.id), expiredToken()),
  ];
  for (const res of responses) assert.equal(res.status, 401);
  const bodies = new Set(responses.map((res) => JSON.stringify(res.body)));
  assert.deepEqual([...bodies], [JSON.stringify({ message: MSG.login })]);
});

test('토큰이 없으면 teamId가 abc여도 401이다', async () => {
  for (const path of [ping('abc'), leaderOnly('abc')]) {
    const res = await get(path);
    assert.equal(res.status, 401, path);
    assert.deepEqual(res.body, { message: MSG.login }, path);
  }
});

test('토큰이 없으면 존재하지 않는 팀이어도 401이다', async () => {
  for (const path of [ping(999999), leaderOnly(999999)]) {
    const res = await get(path);
    assert.equal(res.status, 401, path);
    assert.deepEqual(res.body, { message: MSG.login }, path);
  }
});

// ---- 로그인 경로 (완료 조건 3) ----

function postToApp(path, body) {
  return fetch(`${appServer.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('/api/auth/signup은 토큰 없이도 통과한다(실제 app)', async () => {
  const res = await postToApp('/api/auth/signup', { email: 'no-token@test.dev', password: 'password123', name: '가입' });
  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(await res.json()).sort(), ['id', 'name']);
});

test('/api/auth/login은 토큰 없이도 통과한다(실제 app)', async () => {
  const wrong = await postToApp('/api/auth/login', { email: leaderUser.email, password: 'wrong-password' });
  assert.equal(wrong.status, 401);
  const wrongBody = await wrong.json();
  assert.deepEqual(wrongBody, { message: '이메일 또는 비밀번호가 맞지 않습니다' });
  assert.notEqual(wrongBody.message, MSG.login);

  const ok = await postToApp('/api/auth/login', { email: leaderUser.email, password: leaderUser.password });
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(await ok.json()).sort(), ['token', 'user']);
});

// ---- 팀 ID·소속 (완료 조건 4, 5, 6) ----

test('숫자가 아닌 teamId는 400이다', async () => {
  for (const teamId of ['abc', '0', '-1', '1.5', '007', '99999999999999999999']) {
    const res = await get(ping(teamId), leaderUser.token);
    assert.equal(res.status, 400, teamId);
    assert.deepEqual(res.body, { message: MSG.badTeamId }, teamId);
  }
  assert.equal(handlerCalls, 0);
});

test('소속되지 않은 팀은 403이고 핸들러가 실행되지 않는다', async () => {
  const res = await get(ping(teamA.id), outsider.token);
  assert.equal(res.status, 403);
  assert.deepEqual(Object.keys(res.body), ['message']);
  assert.deepEqual(res.body, { message: MSG.forbidden });
  assert.equal(handlerCalls, 0);
});

test('다른 팀 소속이어도 소속 아닌 팀은 403이다', async () => {
  for (const path of [ping(teamB.id), leaderOnly(teamB.id)]) {
    const res = await get(path, leaderUser.token);
    assert.equal(res.status, 403, path);
    assert.deepEqual(res.body, { message: MSG.forbidden }, path);
  }
  assert.equal(handlerCalls, 0);
});

test('존재하지 않는 팀 ID는 비소속 팀과 상태·본문이 완전히 같다', async () => {
  const notMember = await get(ping(teamB.id), leaderUser.token);
  const noTeam = await get(ping(999999), leaderUser.token);
  assert.equal(notMember.status, 403);
  assert.deepEqual(noTeam, notMember);
  assert.equal(handlerCalls, 0);
});

// ---- 팀장 전용 (완료 조건 7, 8, 9) ----

test('팀원이 팀장 전용 경로를 요청하면 403이다', async () => {
  const res = await get(leaderOnly(teamA.id), memberUser.token);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { message: MSG.leaderOnly });
  assert.equal(handlerCalls, 0);
});

test('팀장은 팀장 전용 경로를 통과한다', async () => {
  const res = await get(leaderOnly(teamA.id), leaderUser.token);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(handlerCalls, 1);
});

test('소속된 팀의 ping은 200이고 req.user·req.team이 정확하다', async () => {
  const member = await get(ping(teamA.id), memberUser.token);
  assert.equal(member.status, 200);
  assert.deepEqual(member.body, {
    user: { id: memberUser.user.id },
    team: { id: teamA.id, membershipId: memberAId, role: 'member' },
  });
  for (const value of [member.body.user.id, member.body.team.id, member.body.team.membershipId]) {
    assert.equal(typeof value, 'number');
  }

  const leader = await get(ping(teamA.id), leaderUser.token);
  assert.equal(leader.status, 200);
  assert.deepEqual(leader.body, {
    user: { id: leaderUser.user.id },
    team: { id: teamA.id, membershipId: teamA.membershipId, role: 'leader' },
  });
  assert.equal(handlerCalls, 2);
});

test('한 사용자가 팀 A에서 팀원, 팀 B에서 팀장이면 팀별로 판단한다', async () => {
  const inA = await get(leaderOnly(teamA.id), memberUser.token);
  assert.equal(inA.status, 403);
  assert.deepEqual(inA.body, { message: MSG.leaderOnly });
  const inB = await get(leaderOnly(teamB.id), memberUser.token);
  assert.equal(inB.status, 200);
  assert.deepEqual(inB.body, { ok: true });

  assert.equal((await get(ping(teamA.id), memberUser.token)).body.team.role, 'member');
  assert.equal((await get(ping(teamB.id), memberUser.token)).body.team.role, 'leader');
});

test('같은 토큰이라도 DB의 역할을 바꾸면 다음 요청부터 바뀐 역할로 판단한다', async () => {
  // 다른 케이스와 데이터를 공유하지 않도록 사용자·팀을 따로 만든다
  const owner = await createUserAndLogin(testServer.baseUrl);
  const user = await createUserAndLogin(testServer.baseUrl);
  const team = await createTeam(owner.user.id);
  const membershipId = await addMember(user.user.id, team.id, 'member');
  const setRole = (role) => query('UPDATE team_memberships SET role = $1 WHERE id = $2', [role, membershipId]);

  assert.equal((await get(leaderOnly(team.id), user.token)).status, 403);
  await setRole('leader');
  const promoted = await get(leaderOnly(team.id), user.token);
  assert.equal(promoted.status, 200);
  assert.deepEqual(promoted.body, { ok: true });
  await setRole('member');
  const demoted = await get(leaderOnly(team.id), user.token);
  assert.equal(demoted.status, 403);
  assert.deepEqual(demoted.body, { message: MSG.leaderOnly });
});

// ---- 요청 로그 ----

test('로그인한 요청의 로그에는 userId가, 소속을 통과한 요청에는 teamId가 숫자로 남는다', async (t) => {
  const infoLog = t.mock.method(logger, 'info');
  assert.equal((await get(ping(teamA.id), memberUser.token)).status, 200);
  const logs = requestLogs(infoLog);
  assert.equal(logs.length, 1);
  assert.deepEqual(Object.keys(logs[0]).sort(), ['durationMs', 'method', 'path', 'status', 'teamId', 'userId']);
  assert.equal(logs[0].userId, memberUser.user.id);
  assert.equal(logs[0].teamId, teamA.id);
  assert.equal(typeof logs[0].userId, 'number');
  assert.equal(typeof logs[0].teamId, 'number');
});

test('401로 끝난 요청의 로그에는 userId·teamId 키가 없고 키는 정확히 4개다', async (t) => {
  const infoLog = t.mock.method(logger, 'info');
  t.mock.method(logger, 'error');
  assert.equal((await get(ping(teamA.id))).status, 401);
  assert.equal((await get(ping(teamA.id), otherSecretToken())).status, 401);
  const logs = requestLogs(infoLog);
  assert.equal(logs.length, 2);
  for (const log of logs) {
    assert.deepEqual(Object.keys(log).sort(), ['durationMs', 'method', 'path', 'status']);
    assert.equal(log.status, 401);
  }
});

test('400·403으로 끝난 요청의 로그에는 userId만 있고 teamId는 없다', async (t) => {
  const infoLog = t.mock.method(logger, 'info');
  t.mock.method(logger, 'error');
  assert.equal((await get(ping('abc'), outsider.token)).status, 400);
  assert.equal((await get(ping(teamA.id), outsider.token)).status, 403);
  const logs = requestLogs(infoLog);
  assert.deepEqual(logs.map((log) => log.status), [400, 403]);
  for (const log of logs) {
    assert.deepEqual(Object.keys(log).sort(), ['durationMs', 'method', 'path', 'status', 'userId']);
    assert.equal(log.userId, outsider.user.id);
  }
});

test('Authorization 값은 로그 인자 어디에도 없다', async (t) => {
  const infoLog = t.mock.method(logger, 'info');
  const errorLog = t.mock.method(logger, 'error');
  const expired = expiredToken();
  const wrongSecret = otherSecretToken();
  assert.equal((await get(ping(teamA.id), memberUser.token)).status, 200);
  assert.equal((await get(ping(teamA.id), expired)).status, 401);
  assert.equal((await get(ping(teamA.id), wrongSecret)).status, 401);
  assert.equal((await get(ping(teamA.id), outsider.token)).status, 403);

  assert.equal(requestLogs(infoLog).length, 4);
  const text = JSON.stringify([...infoLog.mock.calls, ...errorLog.mock.calls].map((c) => c.arguments));
  for (const secret of [memberUser.token, expired, wrongSecret, outsider.token, 'Bearer ']) {
    assert.ok(!text.includes(secret), secret.slice(0, 12));
  }
  // 401 오류 로그의 message는 jwt 라이브러리 원문이 아니라 고정 문구뿐이다
  const unauthorized = errorLog.mock.calls
    .filter((c) => c.arguments[0] === '요청 처리 실패' && c.arguments[1].status === 401)
    .map((c) => c.arguments[1].message);
  assert.deepEqual(unauthorized, [MSG.login, MSG.login]);
});

// ---- helpers ----

test('createTeam은 팀과 만든 사람의 leader 소속을 만들고 { id, membershipId }를 돌려준다', async () => {
  const creator = await createUserAndLogin(testServer.baseUrl);
  const first = await createTeam(creator.user.id);
  const second = await createTeam(creator.user.id);
  assert.deepEqual(Object.keys(first).sort(), ['id', 'membershipId']);
  assert.equal(typeof first.id, 'number');
  assert.equal(typeof first.membershipId, 'number');
  assert.notEqual(first.id, second.id);

  const memberships = await query('SELECT user_id, team_id, role FROM team_memberships WHERE id = $1', [first.membershipId]);
  assert.deepEqual(memberships.rows, [{ user_id: creator.user.id, team_id: first.id, role: 'leader' }]);
  const teams = await query('SELECT creator_id, invite_code FROM teams WHERE id = ANY($1) ORDER BY id', [[first.id, second.id]]);
  assert.equal(teams.rows.length, 2);
  for (const row of teams.rows) assert.equal(row.creator_id, creator.user.id);
  assert.notEqual(teams.rows[0].invite_code, teams.rows[1].invite_code);
});

test('addMember는 소속을 만들고 membership id를 숫자로 돌려준다', async () => {
  const owner = await createUserAndLogin(testServer.baseUrl);
  const user = await createUserAndLogin(testServer.baseUrl);
  const team = await createTeam(owner.user.id);
  const id = await addMember(user.user.id, team.id);
  assert.equal(typeof id, 'number');
  const { rows } = await query('SELECT user_id, team_id, role FROM team_memberships WHERE id = $1', [id]);
  assert.deepEqual(rows, [{ user_id: user.user.id, team_id: team.id, role: 'member' }]);
  await assert.rejects(addMember(user.user.id, team.id), (error) => error.code === '23505');
});
