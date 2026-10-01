// pg 연결 풀과 쿼리 함수. SQL 값은 항상 $1, $2 파라미터로 넘긴다 (B2-9).
import pg from 'pg';
pg.types.setTypeParser(20, Number); // bigint(int8)를 숫자로 받는다: swagger의 User.id는 integer
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

// 여러 테이블을 함께 바꿀 때 쓴다. fn은 client.query(sql, params)로 SQL을 실행한다 (B2-8).
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // ROLLBACK 실패가 원래 오류를 덮지 않게 한다
    await client.query('ROLLBACK').catch(() => {});
    logger.error('DB 트랜잭션 실패', {
      code: error.code,
      message: error.message,
      constraint: error.constraint,
    });
    throw error;
  } finally {
    client.release();
  }
}

export function closePool() {
  return pool.end();
}
