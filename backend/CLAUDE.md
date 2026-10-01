# backend/ 작업 규칙

최상위 `CLAUDE.md`의 규칙을 모두 따르고, 백엔드에서는 아래를 추가로 지킨다.
근거 문서: `docs/5-project-principle.md`(2.1, 3.3, 5장, 7장), `docs/8-pan.md`(BE Task), `docs/swagger.json`(API 명세).

## 1. 환경변수 분리

배포할 때 바뀔 수 있는 값은 코드에 적지 않고 환경변수로 받는다 (설계 원칙 S5-1~S5-5).

| 환경변수 | 용도 |
|----------|------|
| `PORT` | 서버 포트 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `JWT_SECRET` | 토큰 서명 키 (비밀값) |
| `JWT_EXPIRES_IN` | 토큰 유효 기간 (값은 미결-3) |
| `CORS_ORIGIN` | 허용할 프론트엔드 주소 |
| `NODE_ENV` | 실행 환경. `development`(개발), `test`(테스트), `production`(운영). 로그 출력 여부를 정한다(5장) |
| `DB_POOL_SIZE` | DB 연결 풀 크기. 선택 항목이며 기본값은 10 (S5-15) |

- 환경변수는 `src/config.js` 한 곳에서만 읽는다. 다른 파일에서 `process.env`를 직접 읽지 않는다.
- 필수 값이 없으면 서버가 시작할 때 오류를 내고 멈춘다.
- `NODE_ENV=test`이면 `backend/.env.test`를 읽어 테스트용 DB(`team_caltalk_test`)에 연결하고, 그 밖에는 `backend/.env`를 읽는다.
- `.env`, `.env.test`는 Git에 올리지 않는다. 키 이름만 적은 `.env.example`, `.env.test.example`을 올린다.
- 비밀번호, 토큰, 연결 문자열은 로그와 오류 응답에 남기지 않는다.

## 2. SOLID·Clean 아키텍처 적용 방식

원칙은 지키되, 설계 원칙 P1-2·B2-2에 따라 **계층과 추상화를 늘리지 않는다.** 리포지토리 계층, DI 컨테이너, 구현이 하나뿐인 인터페이스는 만들지 않는다.

| 원칙 | 이 프로젝트에서 지키는 방법 |
|------|------------------------------|
| 단일 책임 (S) | 파일 하나는 한 가지 일만 한다. routes는 HTTP, services는 규칙과 SQL, middleware는 권한 검사 |
| 개방·폐쇄 (O) | 기능을 추가할 때 기존 파일을 고치기보다 기능별 routes·services 파일을 새로 더한다 |
| 리스코프 치환 (L) | 상속을 쓰지 않는다. 서비스 함수는 같은 입력에 같은 형태의 결과·오류를 돌려준다 |
| 인터페이스 분리 (I) | 서비스 함수는 필요한 값만 인자로 받는다. `req` 객체를 통째로 넘기지 않는다 |
| 의존성 역전 (D) | services는 Express(`req`, `res`)를 모른다. DB 접근은 `db.js`의 함수로만 한다 |
| Clean 의존 방향 | 바깥에서 안쪽으로만 부른다: middleware → routes → services → db. 안쪽은 바깥을 import하지 않는다. 서비스끼리 서로 호출하지 않는다(B2-4) |

## 3. 아키텍처 기본 골격

설계 원칙 7장의 구조를 따른다. 필요한 파일만 만들고 빈 폴더는 두지 않는다.

```
backend/
├─ CLAUDE.md
├─ package.json
├─ .env.example
├─ src/
│  ├─ server.js          서버 시작 (포트 열기)
│  ├─ app.js             Express 설정, 라우터 연결, 오류 처리 연결
│  ├─ config.js          환경변수 읽기·검사
│  ├─ db.js              pg 연결 풀(DB_POOL_SIZE, 기본 10), query·트랜잭션 도우미
│  ├─ middleware/
│  │  ├─ auth.js         JWT 확인 → 로그인 사용자 (BR-01)
│  │  ├─ team.js         팀 소속·팀장 확인 (BR-09, BR-03)
│  │  └─ errorHandler.js 오류 → { message } 응답, 요청 로그
│  ├─ routes/            auth, teams, schedules, messages
│  ├─ services/          auth, teams, schedules, messages (규칙 + SQL)
│  └─ lib/
│     ├─ httpError.js    상태 코드가 담긴 오류
│     ├─ logger.js       로그 출력 함수 (5장)
│     └─ time.js         한국 표준시 날짜 ↔ UTC 변환 (NFR-05)
└─ test/                 실제 테스트 DB(team_caltalk_test)를 쓰는 API 테스트
```

요청 흐름

```
요청 → middleware(auth → team) → routes → services → db.js → PostgreSQL
                    ↓ 오류
              errorHandler → { "message": "..." }
```

## 4. 꼭 지킬 규칙

- 권한·소속 검사는 middleware 한 곳에서 한다. 서비스에서 팀장 여부를 다시 계산하지 않는다(B2-5).
- SQL은 `$1, $2` 파라미터 바인딩만 쓴다. 문자열을 이어 붙여 값을 넣지 않는다(B2-9).
- 조회 SQL에는 항상 `team_id` 조건을 넣는다(S5-11).
- 여러 테이블을 함께 바꾸면 트랜잭션으로 묶는다: 팀 생성, 일정 + 관련 팀원 저장(B2-8).
- Long Polling 대기 중에는 DB 연결을 잡지 않는다(B2-10).
- DB 컬럼은 snake_case, API JSON은 camelCase. 변환은 서비스에서 응답을 만들 때 한 번만 한다.
- 오류 응답은 `{ "message": "..." }`만 담는다. SQL·스택은 서버 로그에만 남긴다(S5-14).
- DB 스키마는 `docs/schema.sql`이 기준이다. 스키마를 바꾸면 `docs/7-erd.md`도 함께 고친다.
- 응답 형식과 상태 코드는 `docs/swagger.json`과 맞춘다. 다르게 구현해야 하면 먼저 알린다.
- 테스트는 거부 케이스(권한 없음, 다른 팀 접근, 잘못된 입력)부터 쓴다(T4-1, T4-3).

## 5. 로깅 규칙

- **모든 로그는 `src/lib/logger.js`의 logger로만 남긴다.** 다른 파일에서 `console.log`, `console.error`를 직접 쓰지 않는다.
- logger는 로그 라이브러리 없이 작은 함수로 만든다(설계 원칙 S5-13). 수준은 `info`, `error` 두 가지면 충분하다.
- **`NODE_ENV=development`일 때만 출력하고, `production`에서는 출력하지 않는다.** `NODE_ENV` 값은 `config.js`에서 읽어 logger에 넘긴다.
- 원인을 알 수 있도록 충분히 기록한다.

| 대상 | 남길 내용 |
|------|-----------|
| 요청 | 메서드, 경로, 상태 코드, 소요 시간, 사용자 ID(로그인한 경우), 팀 ID(경로에 있으면) |
| 오류 | 오류 메시지, 상태 코드, 스택, 발생한 요청의 메서드·경로 |
| DB 쿼리 실패 | PostgreSQL 오류 코드와 메시지, 제약 이름(있으면), 실패한 SQL 문장. 파라미터 값은 개수만 남긴다 |

- **민감 정보는 남기지 않는다:** 비밀번호, 비밀번호 해시, JWT 토큰(`Authorization` 헤더), `JWT_SECRET`, DB 연결 문자열. 요청 본문과 쿼리 파라미터는 통째로 찍지 않고 필요한 값만 골라 남긴다.
- 오류 응답(`{ "message": "..." }`)에는 로그에 남긴 스택·SQL을 담지 않는다(S5-14).
