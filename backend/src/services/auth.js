// 회원가입·로그인 규칙과 SQL (FR-01, FR-02, NFR-04, S5-6~S5-8, S5-12, BR-16)
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { httpError } from '../lib/httpError.js';

const scryptAsync = promisify(scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HASH_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{128}$/;

// 비밀번호는 salt를 붙여 scrypt로 해시한다 (NFR-04, S5-6)
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

// 해시 형식이 아닌 저장값은 예외 없이 false
async function verifyPassword(password, stored) {
  if (!HASH_PATTERN.test(stored)) return false;
  const [salt, keyHex] = stored.split(':');
  const key = await scryptAsync(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

export async function signup({ email, password, name }) {
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedEmail || !trimmedName || !EMAIL_PATTERN.test(trimmedEmail)) {
    throw httpError(400, '이메일과 이름을 올바르게 입력해 주세요');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw httpError(400, '비밀번호는 8자 이상이어야 합니다');
  }
  const passwordHash = await hashPassword(password);
  try {
    const { rows } = await query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, name',
      [trimmedEmail.toLowerCase(), passwordHash, trimmedName],
    );
    return { id: rows[0].id, name: rows[0].name };
  } catch (error) {
    // 이메일 중복은 DB 제약으로 판단한다 (FR-01)
    if (error.code === '23505' && error.constraint === 'users_email_key') {
      throw httpError(409, '이미 가입한 이메일입니다');
    }
    throw error;
  }
}

export async function login({ email, password }) {
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  if (!trimmedEmail || typeof password !== 'string' || password === '') {
    throw httpError(400, '이메일과 비밀번호를 입력해 주세요');
  }
  const { rows } = await query('SELECT id, name, password_hash FROM users WHERE email = $1', [
    trimmedEmail.toLowerCase(),
  ]);
  const row = rows[0];
  // 없는 이메일과 틀린 비밀번호는 같은 문구로 응답한다 (FR-02, S5-7)
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw httpError(401, '이메일 또는 비밀번호가 맞지 않습니다');
  }
  const token = jwt.sign({}, config.jwtSecret, {
    subject: String(row.id),
    expiresIn: config.jwtExpiresIn,
  });
  return { token, user: { id: row.id, name: row.name } };
}
