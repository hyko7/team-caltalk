// 테스트 DB 연결과 query·transaction 도우미 (BE-01, T4-2, B2-8)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, transaction, closePool } from '../src/db.js';
import { config } from '../src/config.js';
import { logger } from '../src/lib/logger.js';
import { resetDatabase } from './helpers.js';

const INSERT_USER = 'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)';

async function countUsers() {
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  return rows[0].n;
}

before(resetDatabase);
after(closePool);

test('잘못된 SQL은 파라미터 값 없이 로그를 남기고 오류를 다시 던진다', async (t) => {
  const errorLog = t.mock.method(logger, 'error');
  await assert.rejects(query('SELEC $1', ['secret-param-value']));
  assert.equal(errorLog.mock.callCount(), 1);
  const [message, details] = errorLog.mock.calls[0].arguments;
  assert.equal(message, 'DB 쿼리 실패');
  assert.equal(details.sql, 'SELEC $1');
  assert.equal(details.paramCount, 1);
  assert.ok(!JSON.stringify(errorLog.mock.calls[0].arguments).includes('secret-param-value'));
});

test('트랜잭션 안에서 오류가 나면 앞선 INSERT를 되돌린다', async () => {
  await assert.rejects(
    transaction(async (client) => {
      await client.query(INSERT_USER, ['a@example.com', 'hash', 'A']);
      throw new Error('boom');
    }),
    { message: 'boom' },
  );
  assert.equal(await countUsers(), 0);
});

test('트랜잭션 안에서 UNIQUE 위반이 나면 23505로 실패하고 되돌린다', async () => {
  await assert.rejects(
    transaction(async (client) => {
      await client.query(INSERT_USER, ['dup@example.com', 'hash', 'A']);
      await client.query(INSERT_USER, ['dup@example.com', 'hash', 'B']);
    }),
    { code: '23505' },
  );
  assert.equal(await countUsers(), 0);
});

test('트랜잭션 실패 로그에는 code, message, constraint만 있다', async (t) => {
  const errorLog = t.mock.method(logger, 'error');
  await assert.rejects(
    transaction(async (client) => {
      await client.query(INSERT_USER, ['log@example.com', 'hash', 'A']);
      await client.query(INSERT_USER, ['log@example.com', 'hash', 'B']);
    }),
  );
  const call = errorLog.mock.calls.find((c) => c.arguments[0] === 'DB 트랜잭션 실패');
  assert.ok(call, 'DB 트랜잭션 실패 로그가 없다');
  const details = call.arguments[1];
  assert.deepEqual(Object.keys(details).sort(), ['code', 'constraint', 'message']);
  assert.equal(details.code, '23505');
  assert.equal(details.constraint, 'users_email_key');
  assert.ok(!('sql' in details) && !('params' in details));
  assert.ok(!JSON.stringify(call.arguments).includes('log@example.com'));
});

test('실패한 트랜잭션이 풀 크기보다 많아도 연결을 반납한다', { timeout: 5000 }, async () => {
  for (let i = 0; i < config.dbPoolSize + 2; i++) {
    await assert.rejects(transaction(async () => { throw new Error('boom'); }));
  }
  const { rows } = await query('SELECT 1 AS n');
  assert.equal(rows[0].n, 1);
});

test('테스트 DB(team_caltalk_test)에 연결해 쿼리를 실행한다', async () => {
  const { rows } = await query('SELECT 1 AS n');
  assert.equal(rows[0].n, 1);
  const db = await query('SELECT current_database() AS name');
  assert.equal(db.rows[0].name, 'team_caltalk_test');
});

test('resetDatabase 후 users는 비어 있다', async () => {
  await query(INSERT_USER, ['reset@example.com', 'hash', 'R']);
  await resetDatabase();
  assert.equal(await countUsers(), 0);
});

test('트랜잭션이 성공하면 COMMIT하고 fn의 반환값을 돌려준다', async () => {
  const result = await transaction(async (client) => {
    await client.query(INSERT_USER, ['ok@example.com', 'hash', 'OK']);
    return 'done';
  });
  assert.equal(result, 'done');
  const { rows } = await query('SELECT name FROM users WHERE email = $1', ['ok@example.com']);
  assert.deepEqual(rows, [{ name: 'OK' }]);
});
