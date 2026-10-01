// 모든 로그는 이 logger로만 남긴다. 개발 환경(NODE_ENV=development)에서만 출력한다 (backend/CLAUDE.md 5장).
// 비밀번호, 토큰, 연결 문자열 같은 민감 정보는 넘기지 않는다.
import { config } from '../config.js';

function write(print, level, message, details) {
  if (!config.isDevelopment) return;
  const line = `[${new Date().toISOString()}] ${level} ${message}`;
  details === undefined ? print(line) : print(line, details);
}

export const logger = {
  info: (message, details) => write(console.log, 'INFO', message, details),
  error: (message, details) => write(console.error, 'ERROR', message, details),
};
