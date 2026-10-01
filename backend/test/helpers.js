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
