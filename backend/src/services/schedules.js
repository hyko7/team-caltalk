// 일정 추가·기간 조회 규칙과 SQL (FR-07, FR-08, UC-02, UC-03, BR-02, BR-13, BR-14, B2-7, B2-8, B2-9)
import { query, transaction } from '../db.js';
import { httpError } from '../lib/httpError.js';

// 시간대(Z 또는 ±hh:mm)가 있는 ISO 8601만 받는다. 날짜가 달력에 없으면(2월 30일 등) Invalid Date다.
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
function parseTime(value) {
  if (typeof value !== 'string' || !ISO_PATTERN.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const SCHEDULE_COLUMNS = `
  s.id, s.title, s.start_at, s.end_at, s.creator_id, s.updater_id, s.updated_at,
  COALESCE((
    SELECT json_agg(json_build_object('membershipId', m.id, 'userId', m.user_id, 'name', u.name) ORDER BY m.id)
    FROM schedule_participants p
    JOIN team_memberships m ON m.id = p.team_membership_id
    JOIN users u ON u.id = m.user_id
    WHERE p.schedule_id = s.id
  ), '[]'::json) AS participants`;

function toSchedule(r) {
  return {
    id: r.id,
    title: r.title,
    startAt: r.start_at.toISOString(),
    endAt: r.end_at.toISOString(),
    participants: r.participants,
    creatorId: r.creator_id,
    updaterId: r.updater_id,
    updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
  };
}

// 팀장 검사는 middleware에서 끝났다 (B2-5). 관련 팀원은 같은 팀의 member만 가능하다 (BR-13).
export async function createSchedule(teamId, userId, { title, startAt, endAt, participantMembershipIds = [] } = {}) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  const start = parseTime(startAt);
  const end = parseTime(endAt);
  const idsOk =
    Array.isArray(participantMembershipIds) &&
    participantMembershipIds.every((id) => Number.isSafeInteger(id) && id > 0);
  if (!trimmed || !start || !end || !idsOk) throw httpError(400, '제목과 일시를 올바르게 입력해 주세요'); // S5-12
  if (end < start) throw httpError(400, '종료 일시는 시작 일시와 같거나 이후여야 합니다'); // BR-14, 같으면 허용

  const ids = [...new Set(participantMembershipIds)];
  return transaction(async (client) => { // B2-8: 일정 + 관련 팀원
    if (ids.length > 0) {
      const { rows } = await client.query(
        'SELECT id, role FROM team_memberships WHERE team_id = $1 AND id = ANY($2::bigint[])',
        [teamId, ids],
      );
      if (rows.some((r) => r.role === 'leader')) throw httpError(400, '팀장은 관련 팀원이 될 수 없습니다'); // SC-06 E2
      if (rows.length !== ids.length) throw httpError(400, '같은 팀의 팀원만 선택할 수 있습니다'); // SC-06 E3, B2-7
    }
    const { rows } = await client.query(
      'INSERT INTO schedules (team_id, title, start_at, end_at, creator_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [teamId, trimmed, start, end, userId],
    );
    if (ids.length > 0) {
      await client.query(
        'INSERT INTO schedule_participants (schedule_id, team_membership_id) SELECT $1, UNNEST($2::bigint[])',
        [rows[0].id, ids],
      );
    }
    const created = await client.query(`SELECT ${SCHEDULE_COLUMNS} FROM schedules s WHERE s.id = $1`, [rows[0].id]);
    return toSchedule(created.rows[0]);
  });
}

// 기간 [from, to)와 겹치는 일정. 종료가 from과 같은 일정과 시작이 to와 같은 일정은 제외하고,
// 시작 = 종료인 일정은 from <= 시각 < to일 때 포함한다 (T4-4, R-04).
export async function listSchedules(teamId, { from, to } = {}) {
  const fromDate = parseTime(from);
  const toDate = parseTime(to);
  if (!fromDate || !toDate || fromDate >= toDate) throw httpError(400, '조회 기간이 올바르지 않습니다'); // S5-12
  const { rows } = await query(
    `SELECT ${SCHEDULE_COLUMNS} FROM schedules s
     WHERE s.team_id = $1 AND s.is_deleted = false AND s.start_at < $3 AND (s.end_at > $2 OR s.start_at >= $2)
     ORDER BY s.start_at ASC, s.id ASC`,
    [teamId, fromDate, toDate],
  );
  return rows.map(toSchedule);
}
