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
