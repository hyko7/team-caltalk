// 상태 코드가 담긴 오류를 만든다. 서비스·미들웨어에서 throw하고 errorHandler가 응답으로 바꾼다.
export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
