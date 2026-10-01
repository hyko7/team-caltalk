// 환경변수는 이 파일에서만 읽는다 (S5-1). 빠진 값이 있으면 시작 단계에서 멈춘다 (S5-2).
import { fileURLToPath } from 'node:url';

// 테스트(NODE_ENV=test)는 .env.test를 읽어 테스트용 DB에 연결한다
const envFile = process.env.NODE_ENV === 'test' ? '../.env.test' : '../.env';
try {
  process.loadEnvFile(fileURLToPath(new URL(envFile, import.meta.url)));
} catch (error) {
  // .env가 없으면 실제 환경변수만 쓴다 (배포 환경)
  if (error.code !== 'ENOENT') throw error;
}

const REQUIRED_KEYS = ['PORT', 'DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'CORS_ORIGIN', 'NODE_ENV'];
const missing = REQUIRED_KEYS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`필수 환경변수가 없습니다: ${missing.join(', ')}`);
}

export const config = {
  port: Number(process.env.PORT),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  corsOrigin: process.env.CORS_ORIGIN,
  dbPoolSize: Number(process.env.DB_POOL_SIZE || 10),
  isDevelopment: process.env.NODE_ENV === 'development',
};
