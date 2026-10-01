// 사용법: router.get('/:teamId/x', requireLogin, requireTeamMember, requireLeader, handler) — requireLeader()처럼 호출하지 않는다(팩토리가 아님).
import { query } from '../db.js';
import { httpError } from '../lib/httpError.js';

const ID_PATTERN = /^[1-9]\d*$/;

// 팀 소속 확인 (BR-09, S5-11). 없는 팀과 소속 아닌 팀을 구분하지 않는다.
export async function requireTeamMember(req, res, next) {
  const raw = req.params.teamId;
  if (typeof raw !== 'string' || !ID_PATTERN.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw httpError(400, '팀 ID가 올바르지 않습니다');
  }
  const teamId = Number(raw);

  const { rows } = await query(
    'SELECT id, role FROM team_memberships WHERE user_id = $1 AND team_id = $2',
    [req.user.id, teamId],
  );
  if (rows.length === 0) throw httpError(403, '접근 권한이 없습니다');

  req.team = { id: teamId, membershipId: rows[0].id, role: rows[0].role };
  next();
}

// 팀장 확인 (BR-03, B2-5). requireTeamMember 뒤에 둔다.
export function requireLeader(req, res, next) {
  if (req.team.role !== 'leader') throw httpError(403, '팀장만 할 수 있습니다');
  next();
}
