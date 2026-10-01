// 테스트 공통 도우미: 테스트 DB 비우기, 서버 기동·종료 (BE-01)
import { query } from '../src/db.js';

// 개발 DB를 지우는 사고를 막기 위해 테스트 DB인지 먼저 확인한다
export async function resetDatabase() {
  const { rows } = await query('SELECT current_database() AS name');
  if (rows[0].name !== 'team_caltalk_test') {
    throw new Error(`테스트 DB가 아닙니다: ${rows[0].name}`);
  }
  await query(
    'TRUNCATE users, teams, team_memberships, chat_rooms, schedules, schedule_participants, messages RESTART IDENTITY CASCADE',
  );
}

// 빈 포트(0)로 서버를 띄운다. 개발 서버 포트와 겹치지 않는다.
export async function startServer(app) {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

// 실제 API로 가입한 뒤 로그인해 토큰을 받는다 (BE-02)
let userCounter = 0;
export async function createUserAndLogin(baseUrl, { email, password = 'password123', name = '테스트' } = {}) {
  email ??= `user${++userCounter}@test.dev`;
  const post = (path, body) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const signup = await post('/api/auth/signup', { email, password, name });
  if (signup.status !== 201) throw new Error(`가입 실패 ${signup.status}: ${(await signup.json()).message}`);
  const login = await post('/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`로그인 실패 ${login.status}: ${(await login.json()).message}`);
  const { user, token } = await login.json();
  return { user, token, email, password };
}

// 팀을 만들고 만든 사람을 팀장으로 넣는다. chat_rooms는 만들지 않는다 (BE-03)
let teamCounter = 0;
export async function createTeam(creatorId) {
  ++teamCounter;
  const { rows } = await query('INSERT INTO teams (name, invite_code, creator_id) VALUES ($1, $2, $3) RETURNING id', [
    `팀${teamCounter}`,
    `TEST-${teamCounter}`,
    creatorId,
  ]);
  const id = rows[0].id;
  return { id, membershipId: await addMember(creatorId, id, 'leader') };
}

// 팀 소속을 만들고 membership id를 돌려준다 (BE-03)
export async function addMember(userId, teamId, role = 'member') {
  const { rows } = await query('INSERT INTO team_memberships (user_id, team_id, role) VALUES ($1, $2, $3) RETURNING id', [
    userId,
    teamId,
    role,
  ]);
  return rows[0].id;
}
