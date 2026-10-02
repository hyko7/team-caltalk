// 일정 추가·기간 조회 API (BE-06, FR-07, FR-08, UC-02, UC-03, BR-02, BR-03, BR-09, BR-13, BR-14, SC-05, SC-06, T4-3, T4-4, R-04, B2-7, B2-8)
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { query, closePool } from '../src/db.js';
import { resetDatabase, startServer, createUserAndLogin, createTeam, addMember } from './helpers.js';

const MSG = {
  login: '로그인이 필요합니다',
  badTeamId: '팀 ID가 올바르지 않습니다',
  forbidden: '접근 권한이 없습니다',
  leaderOnly: '팀장만 할 수 있습니다',
  input: '제목과 일시를 올바르게 입력해 주세요',
  endBeforeStart: '종료 일시는 시작 일시와 같거나 이후여야 합니다',
  leaderParticipant: '팀장은 관련 팀원이 될 수 없습니다',
  sameTeam: '같은 팀의 팀원만 선택할 수 있습니다',
  range: '조회 기간이 올바르지 않습니다',
  server: '서버 오류가 발생했습니다',
};
const START = '2026-09-09T01:00:00.000Z';
const END = '2026-09-09T02:00:00.000Z';

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
async function assertNoSchedules() {
  assert.equal(await count('schedules'), 0, 'schedules');
  assert.equal(await count('schedule_participants'), 0, 'schedule_participants');
}

// 팀장 1명 + 팀원 1명인 팀
async function setup() {
  const leader = await createUserAndLogin(server.baseUrl, { name: '팀장' });
  const member = await createUserAndLogin(server.baseUrl, { name: '팀원' });
  const team = await createTeam(leader.user.id);
  const memberMembershipId = await addMember(member.user.id, team.id, 'member');
  return { leader, member, team, memberMembershipId };
}
const schedulesPath = (teamId) => `/api/teams/${teamId}/schedules`;
const listPath = (teamId, from, to) =>
  `${schedulesPath(teamId)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
async function addSchedule(teamId, token, title, startAt, endAt, participantMembershipIds) {
  const res = await post(schedulesPath(teamId), { title, startAt, endAt, participantMembershipIds }, token);
  assert.equal(res.status, 201, res.text);
  return res.body;
}

// ---- 거부: 일정 추가 ----

test('토큰 없이 일정을 추가·조회하면 401이고 저장되지 않는다', async () => {
  const { team } = await setup();
  const created = await post(schedulesPath(team.id), { title: '회의', startAt: START, endAt: END });
  assert.equal(created.status, 401);
  assert.deepEqual(created.body, { message: MSG.login });
  const list = await get(listPath(team.id, START, END));
  assert.equal(list.status, 401);
  assert.deepEqual(list.body, { message: MSG.login });
  await assertNoSchedules();
});

test('teamId가 abc면 추가·조회 모두 400이다', async () => {
  const { leader } = await setup();
  const created = await post(schedulesPath('abc'), { title: '회의', startAt: START, endAt: END }, leader.token);
  assert.equal(created.status, 400);
  assert.deepEqual(created.body, { message: MSG.badTeamId });
  const list = await get(listPath('abc', START, END), leader.token);
  assert.equal(list.status, 400);
  assert.deepEqual(list.body, { message: MSG.badTeamId });
});

test('팀원이 일정을 추가하면 403이고 저장되지 않는다 (BR-03, SC-06 E4)', async () => {
  const { member, team } = await setup();
  const res = await post(schedulesPath(team.id), { title: '회의', startAt: START, endAt: END }, member.token);
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { message: MSG.leaderOnly });
  await assertNoSchedules();
});

test('다른 팀의 팀장·팀원이 이 팀 경로로 일정을 추가하면 403이다. 없는 팀도 같다 (BR-09)', async () => {
  const { team } = await setup();
  const other = await setup();
  for (const who of [other.leader, other.member]) {
    const res = await post(schedulesPath(team.id), { title: '회의', startAt: START, endAt: END }, who.token);
    assert.equal(res.status, 403, who.user.name);
    assert.deepEqual(res.body, { message: MSG.forbidden });
  }
  const missing = await post(schedulesPath(999999), { title: '회의', startAt: START, endAt: END }, other.leader.token);
  assert.equal(missing.status, 403);
  assert.deepEqual(missing.body, { message: MSG.forbidden });
  await assertNoSchedules();
});

test('종료가 시작보다 앞서면 400이고 저장되지 않는다 (BR-14, SC-06 E1)', async () => {
  const { leader, team } = await setup();
  const res = await post(schedulesPath(team.id), { title: '회의', startAt: END, endAt: START }, leader.token);
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: MSG.endBeforeStart });
  await assertNoSchedules();
});

test('제목이 비었거나 시각·관련 팀원 형식이 틀리면 400이고 저장되지 않는다 (S5-12)', async () => {
  const { leader, team, memberMembershipId } = await setup();
  const ok = { title: '회의', startAt: START, endAt: END };
  const bodies = [
    {},
    { ...ok, title: undefined },
    { ...ok, title: '' },
    { ...ok, title: '   ' },
    { ...ok, title: 123 },
    { ...ok, startAt: undefined },
    { ...ok, endAt: undefined },
    { ...ok, startAt: 'abc' },
    { ...ok, startAt: '2026-09-09' },
    { ...ok, startAt: '2026-09-09T01:00:00' }, // 시간대 없음
    { ...ok, endAt: '2026-09-09 02:00' },
    { ...ok, startAt: 1757379600000 },
    { ...ok, participantMembershipIds: String(memberMembershipId) },
    { ...ok, participantMembershipIds: [0] },
    { ...ok, participantMembershipIds: [-1] },
    { ...ok, participantMembershipIds: [1.5] },
    { ...ok, participantMembershipIds: [String(memberMembershipId)] },
  ];
  for (const body of bodies) {
    const res = await post(schedulesPath(team.id), body, leader.token);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { message: MSG.input }, JSON.stringify(body));
  }
  const noBody = await send(schedulesPath(team.id), { method: 'POST' }, leader.token);
  assert.equal(noBody.status, 400);
  assert.deepEqual(noBody.body, { message: MSG.input });
  await assertNoSchedules();
});

test('관련 팀원에 팀장의 소속 ID를 넣으면 400이고 저장되지 않는다 (BR-13, SC-06 E2)', async () => {
  const { leader, team, memberMembershipId } = await setup();
  const res = await post(
    schedulesPath(team.id),
    { title: '회의', startAt: START, endAt: END, participantMembershipIds: [memberMembershipId, team.membershipId] },
    leader.token,
  );
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: MSG.leaderParticipant });
  await assertNoSchedules();
});

test('관련 팀원에 다른 팀의 소속 ID를 넣으면 400이고 저장되지 않는다 (BR-13, SC-06 E3)', async () => {
  const { leader, team, memberMembershipId } = await setup();
  const other = await setup();
  for (const id of [other.memberMembershipId, other.team.membershipId]) {
    const res = await post(
      schedulesPath(team.id),
      { title: '회의', startAt: START, endAt: END, participantMembershipIds: [memberMembershipId, id] },
      leader.token,
    );
    assert.equal(res.status, 400, String(id));
    assert.deepEqual(res.body, { message: MSG.sameTeam });
  }
  await assertNoSchedules();
});

test('존재하지 않는 소속 ID를 넣으면 400이고 저장되지 않는다 (B2-7)', async () => {
  const { leader, team } = await setup();
  const res = await post(
    schedulesPath(team.id),
    { title: '회의', startAt: START, endAt: END, participantMembershipIds: [999999] },
    leader.token,
  );
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { message: MSG.sameTeam });
  await assertNoSchedules();
});

test('관련 팀원 저장이 실패하면 500이고 일정 행도 남지 않는다 (B2-8)', async () => {
  const db = await query('SELECT current_database() AS name');
  assert.equal(db.rows[0].name, 'team_caltalk_test');
  const { leader, team, memberMembershipId } = await setup();
  await query('ALTER TABLE schedule_participants ADD CONSTRAINT tmp_fail CHECK (false) NOT VALID');
  try {
    const res = await post(
      schedulesPath(team.id),
      { title: '롤백', startAt: START, endAt: END, participantMembershipIds: [memberMembershipId] },
      leader.token,
    );
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { message: MSG.server });
    assert.ok(!/tmp_fail|schedule_participants|INSERT|violates/i.test(res.text));
  } finally {
    await query('ALTER TABLE schedule_participants DROP CONSTRAINT IF EXISTS tmp_fail');
  }
  await assertNoSchedules();
});

// ---- 거부: 기간 조회 ----

test('from·to가 없거나 형식이 틀리거나 from >= to면 400이다 (S5-12)', async () => {
  const { member, team } = await setup();
  const base = schedulesPath(team.id);
  const paths = [
    base,
    `${base}?from=${encodeURIComponent(START)}`,
    `${base}?to=${encodeURIComponent(END)}`,
    listPath(team.id, 'abc', END),
    listPath(team.id, START, 'abc'),
    listPath(team.id, '2026-09-09', END),
    listPath(team.id, '2026-09-09T01:00:00', END), // 시간대 없음
    listPath(team.id, START, START), // from = to
    listPath(team.id, END, START), // from > to
  ];
  for (const path of paths) {
    const res = await get(path, member.token);
    assert.equal(res.status, 400, path);
    assert.deepEqual(res.body, { message: MSG.range }, path);
  }
});

test('소속되지 않은 팀·없는 팀의 일정을 조회하면 403이고 일정이 노출되지 않는다 (SC-05 E1, S5-11)', async () => {
  const { leader, team } = await setup();
  await addSchedule(team.id, leader.token, '비밀회의', START, END);
  const other = await setup();
  for (const id of [team.id, 999999]) {
    const res = await get(listPath(id, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'), other.leader.token);
    assert.equal(res.status, 403, String(id));
    assert.deepEqual(res.body, { message: MSG.forbidden });
    assert.ok(!res.text.includes('비밀회의'));
  }
});

// ---- 일정 추가 ----

test('팀장이 일정을 추가하면 201이고 제목·UTC 시각·관련 팀원·작성자가 응답과 DB에 있다 (FR-08, SC-06)', async () => {
  const { leader, member, team, memberMembershipId } = await setup();
  const res = await post(
    schedulesPath(team.id),
    {
      title: '  주간 회의  ',
      startAt: '2026-09-09T10:00:00+09:00',
      endAt: '2026-09-09T11:30:00+09:00',
      participantMembershipIds: [memberMembershipId, memberMembershipId],
    },
    leader.token,
  );
  assert.equal(res.status, 201);
  assert.equal(typeof res.body.id, 'number');
  assert.deepEqual(res.body, {
    id: res.body.id,
    title: '주간 회의',
    startAt: '2026-09-09T01:00:00.000Z',
    endAt: '2026-09-09T02:30:00.000Z',
    participants: [{ membershipId: memberMembershipId, userId: member.user.id, name: '팀원' }],
    creatorId: leader.user.id,
    updaterId: null,
    updatedAt: null,
  });

  const { rows } = await query(
    'SELECT team_id, title, start_at, end_at, creator_id, updater_id, updated_at, is_deleted FROM schedules',
  );
  assert.deepEqual(rows, [
    {
      team_id: team.id,
      title: '주간 회의',
      start_at: new Date('2026-09-09T01:00:00Z'),
      end_at: new Date('2026-09-09T02:30:00Z'),
      creator_id: leader.user.id,
      updater_id: null,
      updated_at: null,
      is_deleted: false,
    },
  ]);
  const parts = await query('SELECT schedule_id, team_membership_id FROM schedule_participants');
  assert.deepEqual(parts.rows, [{ schedule_id: res.body.id, team_membership_id: memberMembershipId }]);
});

test('시작과 종료가 같으면 201이다 (BR-14)', async () => {
  const { leader, team } = await setup();
  const res = await post(schedulesPath(team.id), { title: '마감', startAt: START, endAt: START }, leader.token);
  assert.equal(res.status, 201);
  assert.equal(res.body.startAt, START);
  assert.equal(res.body.endAt, START);
  assert.equal(await count('schedules'), 1);
});

test('관련 팀원은 생략·빈 배열이면 participants가 빈 배열이고, 제목 길이 제한이 없다', async () => {
  const { leader, team } = await setup();
  const omitted = await addSchedule(team.id, leader.token, '생략', START, END);
  assert.deepEqual(omitted.participants, []);
  const empty = await addSchedule(team.id, leader.token, '빈 배열', START, END, []);
  assert.deepEqual(empty.participants, []);
  const longTitle = '가'.repeat(300);
  const long = await addSchedule(team.id, leader.token, longTitle, START, END);
  assert.equal(long.title, longTitle);
  assert.equal(await count('schedules'), 3);
  assert.equal(await count('schedule_participants'), 0);
});

// ---- 기간 조회 ----

test('팀장과 팀원이 같은 기간을 조회하면 같은 일정을 본다. 시작·id 오름차순, 관련 팀원은 membershipId 오름차순 (BR-02, SC-05)', async () => {
  const { leader, member, team, memberMembershipId } = await setup();
  const member2 = await createUserAndLogin(server.baseUrl, { name: '팀원2' });
  const member2MembershipId = await addMember(member2.user.id, team.id, 'member');
  const late = await addSchedule(team.id, leader.token, '늦은 일정', '2026-09-09T05:00:00Z', '2026-09-09T06:00:00Z');
  const early1 = await addSchedule(team.id, leader.token, '이른 일정1', START, END, [
    member2MembershipId,
    memberMembershipId,
  ]);
  const early2 = await addSchedule(team.id, leader.token, '이른 일정2', START, END);

  const path = listPath(team.id, '2026-09-09T00:00:00Z', '2026-09-10T00:00:00Z');
  const byLeader = await get(path, leader.token);
  const byMember = await get(path, member.token);
  assert.equal(byLeader.status, 200);
  assert.equal(byMember.status, 200);
  assert.deepEqual(byLeader.body, byMember.body);
  assert.deepEqual(byLeader.body, [early1, early2, late]);
  assert.deepEqual(byLeader.body[0].participants, [
    { membershipId: memberMembershipId, userId: member.user.id, name: '팀원' },
    { membershipId: member2MembershipId, userId: member2.user.id, name: '팀원2' },
  ]);
});

test('한국 표준시 날짜 경계: 09-09 23:30~09-10 00:30 일정은 두 날 모두, 09-10 00:00 시작 일정은 09-10에만 나온다 (T4-4, R-04)', async () => {
  const { leader, member, team } = await setup();
  const a = await addSchedule(team.id, leader.token, 'A', '2026-09-09T14:30:00Z', '2026-09-09T15:30:00Z');
  const b = await addSchedule(team.id, leader.token, 'B', '2026-09-09T15:00:00Z', '2026-09-09T16:00:00Z');

  const day9 = await get(listPath(team.id, '2026-09-08T15:00:00Z', '2026-09-09T15:00:00Z'), member.token);
  assert.equal(day9.status, 200);
  assert.deepEqual(day9.body.map((s) => s.id), [a.id]);

  const day10 = await get(listPath(team.id, '2026-09-09T15:00:00Z', '2026-09-10T15:00:00Z'), member.token);
  assert.equal(day10.status, 200);
  assert.deepEqual(day10.body.map((s) => s.id), [a.id, b.id]);
});

test('기간 경계는 [from, to) 반열린 구간이다: 종료=from·시작=to 제외, 시작=종료 일정은 from <= t < to만 포함', async () => {
  const { leader, member, team } = await setup();
  const F = '2026-09-09T00:00:00.000Z';
  const T = '2026-09-10T00:00:00.000Z';
  const add = (title, s, e) => addSchedule(team.id, leader.token, title, s, e);
  await add('종료=from', '2026-09-08T23:00:00Z', F);
  const crossFrom = await add('from 걸침', '2026-09-08T23:00:00Z', '2026-09-09T00:01:00Z');
  const pointAtFrom = await add('순간=from', F, F);
  const covering = await add('기간 전체 덮음', '2026-09-08T00:00:00Z', '2026-09-11T00:00:00Z');
  const crossTo = await add('to 걸침', '2026-09-09T23:59:00Z', '2026-09-10T01:00:00Z');
  await add('시작=to', T, '2026-09-10T01:00:00Z');
  await add('순간=to', T, T);
  await add('순간<from', '2026-09-08T23:59:00Z', '2026-09-08T23:59:00Z');

  const res = await get(listPath(team.id, F, T), member.token);
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.map((s) => s.title),
    [covering, crossFrom, pointAtFrom, crossTo].map((s) => s.title),
  );
});

test('다른 팀 일정과 is_deleted = true인 일정은 조회 결과에 없다 (BR-09, FR-07, SC-05 E2)', async () => {
  const { leader, member, team } = await setup();
  const other = await setup();
  const kept = await addSchedule(team.id, leader.token, '남은 일정', START, END);
  const deleted = await addSchedule(team.id, leader.token, '지운 일정', START, END);
  await addSchedule(other.team.id, other.leader.token, '다른 팀 일정', START, END);
  await query('UPDATE schedules SET is_deleted = true WHERE id = $1', [deleted.id]);

  const res = await get(listPath(team.id, '2026-09-09T00:00:00Z', '2026-09-10T00:00:00Z'), member.token);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [kept]);
  assert.ok(!res.text.includes('다른 팀 일정'));
  assert.ok(!res.text.includes('지운 일정'));
});

test('기간에 일정이 없으면 빈 배열이다', async () => {
  const { member, team } = await setup();
  const res = await get(listPath(team.id, '2026-09-09T00:00:00+09:00', '2026-09-10T00:00:00+09:00'), member.token);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});
