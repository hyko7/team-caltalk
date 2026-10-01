// Express 설정. 지금은 서버 상태 확인용 /health 하나만 있다.
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { query } from './db.js';
import { httpError } from './lib/httpError.js';
import { requestLogger, errorHandler } from './middleware/errorHandler.js';

export const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(requestLogger);
app.use(express.json());

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
