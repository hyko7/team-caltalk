// 로그인 확인: Authorization 헤더의 JWT를 검사해 req.user를 채운다 (BR-01, S5-8).
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { httpError } from '../lib/httpError.js';

const SUB_PATTERN = /^[1-9]\d*$/;

export function requireLogin(req, res, next) {
  const [scheme, token, ...rest] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token || rest.length > 0) {
    throw httpError(401, '로그인이 필요합니다');
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    // 원래 오류와 토큰이 로그에 남지 않도록 다시 던지지 않는다
    throw httpError(401, '로그인이 필요합니다');
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.sub !== 'string' ||
    !SUB_PATTERN.test(payload.sub) ||
    !Number.isSafeInteger(Number(payload.sub))
  ) {
    throw httpError(401, '로그인이 필요합니다');
  }

  req.user = { id: Number(payload.sub) };
  next();
}
