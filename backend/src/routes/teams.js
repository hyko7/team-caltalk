// 팀 생성·내 팀 목록·구성원 목록 HTTP 경로 (FR-03, FR-04, UC-09)
import { Router } from 'express';
import { requireLogin } from '../middleware/auth.js';
import { requireTeamMember } from '../middleware/team.js';
import { createTeam, listMyTeams, listMembers } from '../services/teams.js';

export const teamsRouter = Router();

teamsRouter.post('/', requireLogin, async (req, res) => {
  res.status(201).json(await createTeam(req.user.id, req.body ?? {}));
});

teamsRouter.get('/', requireLogin, async (req, res) => {
  res.json(await listMyTeams(req.user.id));
});

teamsRouter.get('/:teamId/members', requireLogin, requireTeamMember, async (req, res) => {
  res.json(await listMembers(req.team.id));
});
