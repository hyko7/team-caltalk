// 팀 생성·내 팀 목록·구성원 목록 API (BE-04, FR-03, FR-04, UC-09, BR-10, BR-11, BR-17, S5-10, B2-8)
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { query, closePool } from '../src/db.js';
import { resetDatabase, startServer, createUserAndLogin, createTeam, addMember } from './helpers.js';

const MSG = {
  login: '로그인이 필요합니다',
  teamName: '팀 이름을 입력해 주세요',
  badTeamId: '팀 ID가 올바르지 않습니다',
  forbidden: '접근 권한이 없습니다',
  server: '서버 오류가 발생했습니다',
};
const INVITE_RE = /^[A-Za-z0-9_-]{12}$/;

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
async function send(path, options, token) {
  const headers = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${server.baseUrl}${path}`, { ...options, headers });
  const text = await res.text();
  await new Promise((resolve) => setImmediate(resolve));
  return { status: res.status, text, body: text ? JSON.parse(text) : undefined };
}
function get(path, token) {
  return send(path, { method: 'GET' }, token);
}
function post(path, body, token) {
  return send(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    token,
  );
}

async function count(table) {
  const { rows } = await query(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n;
}
async function assertNoRows() {
  for (const table of ['teams', 'team_memberships', 'chat_rooms']) assert.equal(await count(table), 0, table);
}
const user = () => createUserAndLogin(server.baseUrl);

// ---- 거부 ----

test('토큰 없이 팀을 만들면 401이고 teams에 행이 없다', async () => {
  const res = await post('/api/teams', { name: '팀' });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: MSG.login });
  assert.equal(await count('teams'), 0);
});

test('토큰 없이 내 팀 목록을 보면 401이다', async () => {
  const res = await get('/api/teams');
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: MSG.login });
});

test('토큰 없이 구성원 목록을 보면 401이다', async () => {
  const owner = await user();
  const team = await createTeam(owner.user.id);
  const res = await get(`/api/teams/${team.id}/members`);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { message: MSG.login });
});

test('팀 이름이 없거나(없음·{}·빈 문자열·공백·숫자·본문 없음) 문자열이 아니면 400이고 행이 없다', async () => {
  const { token } = await user();
  for (const body of [undefined, {}, { name: '' }, { name: '   ' }, { name: 123 }]) {
    const res = await post('/api/teams', body, token);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { message: MSG.teamName }, JSON.stringify(body));
  }
  const noBody = await send('/api/teams', { method: 'POST' }, token);
  assert.equal(noBody.status, 400);
  assert.deepEqual(noBody.body, { message: MSG.teamName });
  await assertNoRows();
});

test('소속되지 않은 팀의 구성원 목록은 403이고 다른 팀 정보가 없다', async () => {
  const owner = await user();
  const outsider = await user();
  const team = await createTeam(owner.user.id);
  const res = await get(`/api/teams/${team.id}/members`, outsider.token);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { message: MSG.forbidden });
  assert.ok(!res.text.includes(owner.email));
});

test('존재하지 않는 팀의 구성원 목록도 같은 403이다', async () => {
  const { token } = await user();
  const res = await get('/api/teams/999999/members', token);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { message: MSG.forbidden });
});

test('teamId가 abc면 400이다', async () => {
  const { token } = await user();
  const res = await get('/api/teams/abc/members', token);
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: MSG.badTeamId });
});

// ---- 팀 생성 ----

test('팀 생성: 201, 응답은 id·name·role뿐이고 초대 코드가 없다. 팀·소속·채팅방이 1행씩 생긴다', async () => {
  const creator = await user();
  const res = await post('/api/teams', { name: '개발팀' }, creator.token);
  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(res.body).sort(), ['id', 'name', 'role']);
  assert.deepEqual(res.body, { id: res.body.id, name: '개발팀', role: 'leader' });
  assert.equal(typeof res.body.id, 'number');

  assert.equal(await count('teams'), 1);
  assert.equal(await count('team_memberships'), 1);
  assert.equal(await count('chat_rooms'), 1);
  const team = await query('SELECT id, name, creator_id FROM teams');
  assert.deepEqual(team.rows, [{ id: res.body.id, name: '개발팀', creator_id: creator.user.id }]);
  const member = await query('SELECT user_id, team_id, role FROM team_memberships');
  assert.deepEqual(member.rows, [{ user_id: creator.user.id, team_id: res.body.id, role: 'leader' }]);
  const room = await query('SELECT team_id FROM chat_rooms');
  assert.deepEqual(room.rows, [{ team_id: res.body.id }]);
});

test('팀 이름은 앞뒤 공백을 지워 저장하고 300자 이름도 허용한다', async () => {
  const { token } = await user();
  const trimmed = await post('/api/teams', { name: '  공백 팀  ' }, token);
  assert.equal(trimmed.status, 201);
  assert.equal(trimmed.body.name, '공백 팀');

  const longName = '가'.repeat(300);
  const long = await post('/api/teams', { name: longName }, token);
  assert.equal(long.status, 201);
  assert.equal(long.body.name, longName);

  const { rows } = await query('SELECT name FROM teams ORDER BY id');
  assert.deepEqual(rows.map((row) => row.name), ['공백 팀', longName]);
});

test('초대 코드는 12자 base64url이고 팀마다 다르다', async () => {
  const { token } = await user();
  await post('/api/teams', { name: 'A' }, token);
  await post('/api/teams', { name: 'B' }, token);
  const { rows } = await query('SELECT invite_code FROM teams ORDER BY id');
  assert.equal(rows.length, 2);
  for (const row of rows) assert.match(row.invite_code, INVITE_RE);
  assert.notEqual(rows[0].invite_code, rows[1].invite_code);
});

test('채팅방 생성이 실패하면 500이고 팀·소속·채팅방이 모두 롤백된다', async () => {
  const db = await query('SELECT current_database() AS name');
  assert.equal(db.rows[0].name, 'team_caltalk_test');
  const { token } = await user();
  await query('ALTER TABLE chat_rooms ADD CONSTRAINT tmp_fail CHECK (false) NOT VALID');
  try {
    const res = await post('/api/teams', { name: '롤백팀' }, token);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { message: MSG.server });
    assert.ok(!/tmp_fail|chat_rooms|INSERT|violates/i.test(res.text));
  } finally {
    await query('ALTER TABLE chat_rooms DROP CONSTRAINT IF EXISTS tmp_fail');
  }
  await assertNoRows();
});

// ---- 내 팀 목록 ----

test('소속 팀이 없으면 내 팀 목록은 빈 배열이다', async () => {
  const { token } = await user();
  const res = await get('/api/teams', token);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('내 팀 목록은 내 팀만, id·name·role 키만 담고 초대 코드가 없다', async () => {
  const me = await user();
  const other = await user();
  const mine = await createTeam(me.user.id);
  await createTeam(other.user.id);
  const res = await get('/api/teams', me.token);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.deepEqual(Object.keys(res.body[0]).sort(), ['id', 'name', 'role']);
  assert.equal(res.body[0].id, mine.id);
  assert.equal(res.body[0].role, 'leader');
  const { rows } = await query('SELECT invite_code FROM teams');
  for (const row of rows) assert.ok(!res.text.includes(row.invite_code));
});

test('팀 A 팀장, 팀 B 팀원이면 팀마다 role이 다르고 id 오름차순이다', async () => {
  const me = await user();
  const other = await user();
  const teamA = await createTeam(me.user.id);
  const teamB = await createTeam(other.user.id);
  await addMember(me.user.id, teamB.id, 'member');
  const res = await get('/api/teams', me.token);
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.map((t) => [t.id, t.role]),
    [
      [teamA.id, 'leader'],
      [teamB.id, 'member'],
    ],
  );
});

// ---- 구성원 목록 ----

test('구성원 목록: 그 팀 구성원만, 키 4개, 민감 정보 없음, membershipId 오름차순', async () => {
  const leader = await user();
  const member = await user();
  const otherLeader = await user();
  const team = await createTeam(leader.user.id);
  const memberMembershipId = await addMember(member.user.id, team.id, 'member');
  await createTeam(otherLeader.user.id);

  const res = await get(`/api/teams/${team.id}/members`, leader.token);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    { membershipId: team.membershipId, userId: leader.user.id, name: leader.user.name, role: 'leader' },
    { membershipId: memberMembershipId, userId: member.user.id, name: member.user.name, role: 'member' },
  ]);
  for (const item of res.body) assert.deepEqual(Object.keys(item).sort(), ['membershipId', 'name', 'role', 'userId']);
  for (const word of ['email', 'passwordHash', 'password_hash', leader.email, member.email, otherLeader.email]) {
    assert.ok(!res.text.includes(word), word);
  }
  assert.ok(!res.body.some((item) => item.userId === otherLeader.user.id));
  assert.ok(res.body[0].membershipId < res.body[1].membershipId);
});

test('팀원도 같은 팀 구성원 목록을 200으로 본다', async () => {
  const leader = await user();
  const member = await user();
  const team = await createTeam(leader.user.id);
  await addMember(member.user.id, team.id, 'member');
  const res = await get(`/api/teams/${team.id}/members`, member.token);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((m) => m.role), ['leader', 'member']);
});
