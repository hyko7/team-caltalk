// 일정 추가·기간 조회 HTTP 경로 (FR-07, FR-08, UC-02, UC-03). /api/teams/:teamId/schedules 아래에 붙는다.
import { Router } from 'express';
import { requireLogin } from '../middleware/auth.js';
import { requireTeamMember, requireLeader } from '../middleware/team.js';
import { createSchedule, listSchedules } from '../services/schedules.js';

export const schedulesRouter = Router({ mergeParams: true });

schedulesRouter.post('/', requireLogin, requireTeamMember, requireLeader, async (req, res) => {
  res.status(201).json(await createSchedule(req.team.id, req.user.id, req.body ?? {}));
});

schedulesRouter.get('/', requireLogin, requireTeamMember, async (req, res) => {
  res.json(await listSchedules(req.team.id, req.query));
});
