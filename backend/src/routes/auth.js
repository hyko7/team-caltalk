// 회원가입·로그인 HTTP 경로 (FR-01, FR-02). 본문이 없으면 빈 객체로 받아 서비스가 400을 낸다.
import { Router } from 'express';
import { signup, login } from '../services/auth.js';

export const authRouter = Router();

authRouter.post('/signup', async (req, res) => {
  res.status(201).json(await signup(req.body ?? {}));
});

authRouter.post('/login', async (req, res) => {
  res.json(await login(req.body ?? {}));
});
