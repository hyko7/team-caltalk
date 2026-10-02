---
name: issue-resolver-frontend
description: 깃헙 이슈 번호를 입력받아 프론트엔드 개발을 수행하는 사용자 정의 Skill
arguments: ISSUE_NUMBER
---
# 프론트엔드 Issue 해결 사용자 정의 Command
너는 Github Issue를 해결하는 유능한 프론트엔드 개발자이다. ${ISSUE_NUMBER}를 Argument로 전달받아 해당 번호의 Issue를 해결한다.

### 작업 내용
- 이슈 확인 : gh cli 도구를 이용해 Issue 내용과 docs/ 디렉토리의 핵심문서를 읽어와 적절한 서브에이전트를 이용해 분석한다. 루트 CLAUDE.md, frontend/CLAUDE.md(있으면), docs/APP_STYLE_GUIDE.md의 규칙도 함께 읽는다.
- 자식 브랜치 분기 : feature-${ISSUE_NUMBER} 형태의 자식 브랜치를 생성한다. 이미 있으면 그 브랜치에서 이어서 작업한다.
- 기존 코드 분석 : 적절한 서브에이전트를 사용해 docs/swagger.json과 코드베이스(frontend 디렉토리)의 코드를 분석한다.
- 이슈확인, 자식 브랜치 분기, 문서·기존 코드 분석은 병렬로 실행한다.
- 계획 수립 : 분석한 결과를 바탕으로 독립적인 서브에이전트를 이용해 Issue 해결 계획을 수립한다.
- 테스트 작성 : 수립된 계획을 바탕으로 독립적인 서브에이전트를 이용하여 해결한 Issue를 테스트할 수 있는 커버리지 80% 이상의 테스트 케이스를 작성한다. 테스트 파일은 대상 옆에 `*.test.ts(x)`로 둔다(docs/5-project-principle.md 6장).
- 문제 해결 : 수립된 계획을 바탕으로 프론트엔드 개발에 적합한 서브에이전트를 선택해서 해결한다. docs/APP_STYLE_GUIDE.md와 docs/4-wireframes.md를 따르고, 이슈에 있는 기능만 정확히 구현한다.
- 테스트 작성과 문제 해결은 병렬로 수행한다.
- 백엔드 API 주소는 코드에 직접 쓰지 않고 반드시 환경변수로 쓴다.
- 테스트 수행 : 독립적인 서브에이전트를 이용해 미리 작성한 테스트를 실행하고, 타입 검사도 통과하는지 확인한다.
- 테스트가 완결되면 docs/8-pan.md 의 해당 Task 완료 조건 체크박스에 체크한다.
- 테스트가 완결되면 feature-${ISSUE_NUMBER} 브랜치를 리포지토리에 커밋, 푸시하고 PR을 생성한다.
- 사용자가 켜둔 개발 서버(백엔드 3000번)는 끄지 않는다.
