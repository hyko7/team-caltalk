// 서버 시작 (포트 열기)
import { app } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';

app.listen(config.port, () => {
  logger.info(`서버 시작: http://localhost:${config.port}`);
});
