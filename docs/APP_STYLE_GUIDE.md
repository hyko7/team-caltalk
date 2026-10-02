# Team CalTalk 프론트엔드 스타일 가이드

버전 0.1 · 최종 수정일 2026-10-02

참조: `docs/ref-calendar.png`(화면 이미지), `docs/5-project-principle.md` v0.7 (2.2, 3.2, 6장), `docs/4-wireframes.md`

## 1. 적용 방식

- 스타일은 일반 CSS 파일과 CSS 변수로 쓴다. 스타일 라이브러리(Tailwind, styled-components 등)는 추가하지 않는다(P1-2).
- 색·글자 값은 `frontend/src/index.css`의 `:root`에 변수로 한 번만 정의하고, 컴포넌트에서는 변수만 쓴다.
- 컴포넌트 CSS는 컴포넌트 옆에 둔다 (예: `features/schedules/MonthView.css`). 공통 `components/` 폴더는 만들지 않는다(6장).
- 반응형은 CSS 미디어 쿼리로 처리한다(F2-9). 폭 기준값은 구현할 때 정한다.
- 팀장 전용 버튼 표시 여부는 서버가 준 역할로 판단한다(F2-8). 스타일 규칙과는 별개다.

```css
:root {
  /* 색상 */
  --color-primary: #2563eb;
  --color-primary-light: #dbeafe;
  --color-primary-disabled: #93b4f8;
  --color-event: #00c853;
  --color-today-bg: #ecfdf5;
  --color-sunday: #ef4444;
  --color-saturday: #3b82f6;
  --color-text: #111827;
  --color-text-sub: #6b7280;
  --color-text-muted: #9ca3af;
  --color-border: #e5e7eb;
  --color-bg: #ffffff;
  --color-bg-sub: #f8fafc;

  /* 글자 */
  --font-family: "Pretendard", "Noto Sans KR", system-ui, sans-serif;
  --font-size-title: 20px;
  --font-size-base: 14px;
  --font-size-small: 12px;

  /* 모양 */
  --radius: 6px;
}
```

## 2. 색상

| 용도 | 변수 | 값 |
|------|------|-----|
| 주요 버튼(`+ 새 일정`), 현재 팀 칩 글자 | `--color-primary` | `#2563eb` |
| 칩 배경 | `--color-primary-light` | `#dbeafe` |
| 비활성 전송 버튼 | `--color-primary-disabled` | `#93b4f8` |
| 일정 막대, 선택된 보기(월·주·일) | `--color-event` | `#00c853` |
| 오늘 칸 배경 | `--color-today-bg` | `#ecfdf5` |
| 일요일 | `--color-sunday` | `#ef4444` |
| 토요일 | `--color-saturday` | `#3b82f6` |
| 본문 글자 / 보조 글자 / 흐린 글자 | `--color-text` / `-sub` / `-muted` | `#111827` / `#6b7280` / `#9ca3af` |
| 테두리 | `--color-border` | `#e5e7eb` |
| 배경 / 보조 배경(요일 줄, 다른 달 칸) | `--color-bg` / `--color-bg-sub` | `#ffffff` / `#f8fafc` |

- 파란색은 "동작을 시키는 것"(버튼, 현재 팀), 초록색은 "일정과 선택 상태"에만 쓴다.
- 일정 막대 위 글자는 흰색이다.

## 3. 글자

| 용도 | 크기 | 굵기 |
|------|------|------|
| 서비스 이름, 팀 이름, 화면 제목 | `--font-size-title` 20px | 700 |
| 본문, 버튼, 날짜 숫자, 메시지 | `--font-size-base` 14px | 400 (강조 700) |
| 보조 안내(입력 도움말, 글자 수, 날짜 줄) | `--font-size-small` 12px | 400 |

- 글꼴은 `--font-family` 하나만 쓴다. 줄 간격은 1.5다.
- 오늘 날짜 숫자는 700으로 강조한다.

## 4. 버튼

공통: 높이 36px, 가로 여백 16px, 모서리 `--radius`, 글자 14px.

| 종류 | 모양 | 사용처 |
|------|------|--------|
| 주요(primary) | 배경 `--color-primary`, 흰 글자 | `+ 새 일정`, 전송, 저장 |
| 기본(default) | 흰 배경, `--color-border` 테두리, 본문 글자 | 오늘·이전·다음, 로그아웃, 취소 |
| 선택 그룹(월·주·일) | 기본 버튼을 붙여 한 줄로 두고, 선택된 항목은 배경 `--color-event` + 흰 글자 | 캘린더 보기 전환 |
| 비활성 | 배경 `--color-primary-disabled`(주요) 또는 흐린 글자(기본), 클릭 불가 | 입력이 비었을 때 전송 |

- 칩(현재 팀, 사용자 이름)은 높이 28px, 둥근 알약 모양, 배경 `--color-primary-light` + 글자 `--color-primary`다. 사용자 이름 칩은 배경 `--color-bg-sub` + 보조 글자로 한다.
- 키보드 포커스는 `outline: 2px solid var(--color-primary)`로 보이게 한다.

## 5. 캘린더 칸 (월 보기)

- 캘린더 바깥은 흰 배경 + `--color-border` 테두리 + `--radius`다.
- 상단 줄: 왼쪽 [오늘][이전][다음] 기본 버튼 그룹, 가운데 `2025년 10월` 형식 제목, 오른쪽 [월][주][일] 선택 그룹.
- 요일 줄: 배경 `--color-bg-sub`, 글자 가운데 정렬 700. 일요일 `--color-sunday`, 토요일 `--color-saturday`, 나머지 본문색.
- 날짜 칸
  - 7열 같은 너비, 최소 높이 약 110px, 1px `--color-border` 격자선.
  - 날짜 숫자는 칸 오른쪽 위에 두 자리(`05`)로 표시한다.
  - 다른 달 칸: 배경 `--color-bg-sub` + 숫자 `--color-text-muted`.
  - 오늘 칸: 배경 `--color-today-bg` + 숫자 굵게.
- 일정 막대
  - 배경 `--color-event`, 흰 글자 14px 700, 높이 약 28px, 모서리 4px, 제목은 한 줄로 자르고 `…` 처리.
  - 여러 날 일정은 시작일 칸부터 종료일 칸까지 이어서 한 줄로 그린다. 한 주 줄을 넘으면 다음 줄에서 이어 그린다.
  - 한 칸에 일정이 많아 넘치면 `+N개`로 줄인다.
- 시각 표시는 한국 표준시 기준이다(NFR-05, `lib/time.ts`).

## 6. 채팅 영역

- 캘린더 오른쪽(넓은 화면)에 두며 폭 약 360px, 왼쪽에 `--color-border` 세로선. 좁은 화면 배치는 WF-05·06을 따른다.
- 구성(위에서 아래): 머리글 → 날짜 줄 → 메시지 목록 → 입력 줄.
  - 머리글: 아이콘 + `팀 채팅`(700, 16px), 오른쪽에 `팀원 N명`(보조 글자). 아래에 `--color-border` 선.
  - 날짜 줄: `10월 5일 (일)` 보조 글자 14px. 날짜 선택은 `<input type="date">`를 쓴다.
  - 메시지 목록: 남는 높이를 모두 쓰고 세로 스크롤한다. 새 메시지가 오면 맨 아래로 이동한다.
  - 입력 줄: 아래에 붙인다. 위에 `--color-border` 선.
- 메시지 풍선: 내 메시지는 오른쪽 + 배경 `--color-primary` + 흰 글자, 다른 사람 메시지는 왼쪽 + 배경 `--color-bg-sub` + 본문 글자. 모서리 `--radius`, 위에 작성자 이름·시각을 12px 보조 글자로 쓴다.
- 변경 요청 메시지는 일반 메시지와 구분되게 `--color-event` 색 왼쪽 선 4px을 붙이고 대상 일정 제목을 위에 보여 준다(WF-10, WF-12). 삭제된 일정은 `삭제됨`을 흐린 글자로 표시한다.
- 빈 상태: 가운데에 `아직 메시지가 없습니다`(16px, 보조 글자)와 `첫 번째 메시지를 보내보세요!`(14px, 흐린 글자).
- 입력 줄: 여러 줄 입력창(테두리 `--color-border`, `--radius`) + 오른쪽 정사각형 전송 버튼(주요 버튼, 비었을 때 비활성). 아래에 안내 `Enter로 전송, Shift+Enter로 줄바꿈`(12px 흐린 글자)과 글자 수 `0/500`을 오른쪽 정렬한다.

## 7. 이 가이드에서 뺀 것

- 화면 이미지에 있는 `온라인` 표시, `새로고침` 버튼은 PRD에 없는 요소라 포함하지 않았다(`5-project-principle.md` 미결-1).
- 다크 모드, 애니메이션, 아이콘 라이브러리, 디자인 토큰 도구는 정하지 않았다. 필요해지면 추가한다.

## 8. 변경 이력

문서를 바꿀 때마다 표 맨 아래에 한 줄씩 추가하고, 기존 행은 수정하거나 지우지 않는다. 버전을 올리면 제목 아래의 버전과 최종 수정일도 함께 바꾼다.

| 버전 | 날짜 | 변경자 | 변경 내용 |
|------|------|--------|-----------|
| 0.1 | 2026-10-02 | hyko7 | 초안 작성 (ref-calendar.png 기반: 색상, 글자, 버튼, 캘린더 칸, 채팅 영역) |
