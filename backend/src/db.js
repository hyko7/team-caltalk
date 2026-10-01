// pg 연결 풀과 쿼리 함수. SQL 값은 항상 $1, $2 파라미터로 넘긴다 (B2-9).
import pg from 'pg';
import { config } from './config.js';
import { logger } from './lib/logger.js';

// 풀 크기는 DB_POOL_SIZE로 바꿀 수 있고 기본값은 10이다 (S5-15)
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: config.dbPoolSize });

export async function query(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    // 원인은 남기되 파라미터 값은 개수만 남긴다 (민감 정보 제외)
    logger.error('DB 쿼리 실패', {
      code: error.code,
      message: error.message,
      constraint: error.constraint,
      sql,
      paramCount: params.length,
    });
    throw error;
  }
}
