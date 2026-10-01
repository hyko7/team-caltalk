// 요청 로그와 오류 응답. 오류 응답은 { message }만 담고 SQL·스택은 로그에만 남긴다 (S5-14).
import { logger } from '../lib/logger.js';

export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const details = {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - start) / 1e6,
    };
    if (req.user) details.userId = req.user.id;
    if (req.team) details.teamId = req.team.id;
    logger.info('요청', details);
  });
  next();
}

// 인자 4개를 유지해야 Express가 오류 처리기로 인식한다
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = 500;
  let message = '서버 오류가 발생했습니다';
  if (error.type === 'entity.parse.failed') {
    // body-parser 오류에도 status 400이 있으므로 먼저 검사한다
    status = 400;
    message = '요청 본문이 올바르지 않습니다';
  } else if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) {
    status = error.status;
    message = error.message;
  }

  logger.error('요청 처리 실패', {
    message: error.message,
    status,
    stack: error.stack,
    method: req.method,
    path: req.originalUrl.split('?')[0],
  });
  res.status(status).json({ message });
}
