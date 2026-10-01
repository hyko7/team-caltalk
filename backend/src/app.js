// Express 설정. 지금은 서버 상태 확인용 /health 하나만 있다.
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { query } from './db.js';

export const app = express();

app.use(cors({ origin: config.corsOrigin }));
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
