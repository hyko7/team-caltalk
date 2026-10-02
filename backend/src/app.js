// Express 설정. 서버 상태 확인용 /health와 인증 경로(/api/auth), 팀 경로(/api/teams), 일정 경로(/api/teams/:teamId/schedules)가 있다.
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { query } from './db.js';
import { httpError } from './lib/httpError.js';
import { requestLogger, errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { teamsRouter } from './routes/teams.js';
import { schedulesRouter } from './routes/schedules.js';

export const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(requestLogger);
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/teams/:teamId/schedules', schedulesRouter);

// 서버와 DB 연결이 살아 있는지 확인한다
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ message: '데이터베이스에 연결할 수 없습니다' });
  }
});

// 없는 경로는 404, 모든 오류는 마지막 errorHandler가 { message }로 응답한다 (S5-14)
app.use((req, res, next) => next(httpError(404, '요청한 경로를 찾을 수 없습니다')));
app.use(errorHandler);
