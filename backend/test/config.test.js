// 환경변수 분리 규칙 (BE-01, S5-1, S5-2, S5-4)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.join(backendDir, '..');
const REQUIRED_KEYS = ['PORT', 'DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'CORS_ORIGIN', 'NODE_ENV'];

// 키를 지우면 .env.test가 값을 다시 채우므로 빈 문자열로 넘긴다
function startServerWith(overrides) {
  return spawnSync(process.execPath, ['src/server.js'], {
    cwd: backendDir,
    env: { ...process.env, PORT: '0', ...overrides },
    encoding: 'utf8',
    timeout: 10000,
  });
}

for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  test(`${key}가 비어 있으면 서버가 시작 단계에서 오류로 종료한다`, () => {
    const result = startServerWith({ [key]: '' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(key));
  });
}

test('config.js 밖의 src 파일에는 process.env가 없다', () => {
  const srcDir = path.join(backendDir, 'src');
  const files = readdirSync(srcDir, { recursive: true })
    .filter((file) => file.endsWith('.js') && path.basename(file) !== 'config.js');
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readFileSync(path.join(srcDir, file), 'utf8');
    assert.ok(!text.includes('process.env'), `${file}에서 process.env를 읽는다`);
  }
});

for (const name of ['.env.example', '.env.test.example']) {
  test(`${name}에는 키 이름만 있고 값은 비어 있다`, () => {
    const lines = readFileSync(path.join(backendDir, name), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    for (const line of lines) {
      assert.match(line, /^[A-Z0-9_]+=$/, `값이 들어 있다: ${line.split('=')[0]}`);
    }
    const keys = lines.map((line) => line.slice(0, -1));
    for (const key of REQUIRED_KEYS) assert.ok(keys.includes(key), `${key}가 없다`);
  });
}

test('.env와 .env.test는 Git 추적 대상이 아니다', () => {
  const result = spawnSync('git', ['ls-files', 'backend/.env', 'backend/.env.test'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});
