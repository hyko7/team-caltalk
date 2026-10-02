// 팀 생성·내 팀 목록·구성원 목록·초대 코드·팀 참여 HTTP 경로 (FR-03~06, UC-09, UC-10)
import { Router } from 'express';
import { requireLogin } from '../middleware/auth.js';
import { requireTeamMember, requireLeader } from '../middleware/team.js';
import { httpError } from '../lib/httpError.js';
import { createTeam, listMyTeams, listMembers, getInviteCode, joinTeam } from '../services/teams.js';

export const teamsRouter = Router();

teamsRouter.post('/', requireLogin, async (req, res) => {
  res.status(201).json(await createTeam(req.user.id, req.body ?? {}));
});

teamsRouter.get('/', requireLogin, async (req, res) => {
  res.json(await listMyTeams(req.user.id));
});

// join은 /:teamId 경로보다 먼저 등록한다
teamsRouter.post('/join', requireLogin, async (req, res) => {
  res.status(201).json(await joinTeam(req.user.id, req.body ?? {}));
});

// 팀장 검사는 requireLeader가 하고, 이 경로 전용 문구(swagger)만 바꾼다
function requireLeaderForInviteCode(req, res, next) {
  try {
    requireLeader(req, res, () => {});
  } catch {
    throw httpError(403, '팀장만 초대 코드를 볼 수 있습니다');
  }
  next();
}

teamsRouter.get('/:teamId/invite-code', requireLogin, requireTeamMember, requireLeaderForInviteCode, async (req, res) => {
  res.json(await getInviteCode(req.team.id));
});

teamsRouter.get('/:teamId/members', requireLogin, requireTeamMember, async (req, res) => {
  res.json(await listMembers(req.team.id));
});
