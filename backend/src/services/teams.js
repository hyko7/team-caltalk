// 팀 생성·내 팀 목록·구성원 목록·초대 코드·팀 참여 규칙과 SQL (FR-03~06, UC-09, UC-10, BR-10~12, BR-17, S5-10, B2-6, B2-8)
import { randomBytes } from 'node:crypto';
import { query, transaction } from '../db.js';
import { httpError } from '../lib/httpError.js';

export async function createTeam(userId, { name } = {}) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw httpError(400, '팀 이름을 입력해 주세요'); // S5-12, 길이 제한 없음(결정-11)
  const inviteCode = randomBytes(9).toString('base64url'); // 12자 무작위, 충돌은 DB 유니크 제약이 최후 보장 (S5-10, BR-12)
  return transaction(async (client) => { // B2-8: 팀 + 팀장 소속 + 채팅방
    const { rows } = await client.query(
      'INSERT INTO teams (name, invite_code, creator_id) VALUES ($1, $2, $3) RETURNING id, name',
      [trimmed, inviteCode, userId],
    );
    await client.query("INSERT INTO team_memberships (user_id, team_id, role) VALUES ($1, $2, 'leader')", [userId, rows[0].id]); // BR-11
    await client.query('INSERT INTO chat_rooms (team_id) VALUES ($1)', [rows[0].id]); // BR-17
    return { id: rows[0].id, name: rows[0].name, role: 'leader' };
  });
}

// 내가 속한 팀 목록. invite_code는 조회하지 않는다.
export async function listMyTeams(userId) {
  const { rows } = await query(
    'SELECT t.id, t.name, m.role FROM team_memberships m JOIN teams t ON t.id = m.team_id WHERE m.user_id = $1 ORDER BY t.id ASC',
    [userId],
  );
  return rows;
}

// 팀 구성원 목록. email·password_hash는 내보내지 않는다.
export async function listMembers(teamId) {
  const { rows } = await query(
    'SELECT m.id AS membership_id, m.user_id, u.name, m.role FROM team_memberships m JOIN users u ON u.id = m.user_id WHERE m.team_id = $1 ORDER BY m.id ASC',
    [teamId],
  );
  return rows.map((r) => ({ membershipId: r.membership_id, userId: r.user_id, name: r.name, role: r.role }));
}

// 초대 코드. 팀장 검사는 middleware에서 끝났다 (B2-5).
export async function getInviteCode(teamId) {
  const { rows } = await query('SELECT invite_code FROM teams WHERE id = $1', [teamId]);
  return { inviteCode: rows[0].invite_code };
}

// 초대 코드로 참여. 항상 member (BR-11). 중복은 (user_id, team_id) UNIQUE 위반을 409로 바꾼다 (B2-6, UC-10).
export async function joinTeam(userId, { inviteCode } = {}) {
  const code = typeof inviteCode === 'string' ? inviteCode.trim() : '';
  if (!code) throw httpError(400, '초대 코드를 입력해 주세요'); // S5-12
  const { rows } = await query('SELECT id, name FROM teams WHERE invite_code = $1', [code]);
  if (rows.length === 0) throw httpError(404, '초대 코드가 올바르지 않습니다'); // SC-04 E1
  try {
    await query("INSERT INTO team_memberships (user_id, team_id, role) VALUES ($1, $2, 'member')", [userId, rows[0].id]);
  } catch (error) {
    if (error.code === '23505') throw httpError(409, '이미 참여한 팀입니다'); // SC-04 E2
    throw error;
  }
  return { id: rows[0].id, name: rows[0].name, role: 'member' };
}
