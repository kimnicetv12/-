# 🥌 컬링 오목 (STONE LINE) 프롬프트 패키지

컬링처럼 돌을 굴려 오목처럼 N줄(3/4/5)을 먼저 만드는 1인 모바일 게임을 **Unity + Claude Code**로 만들기 위한 프롬프트입니다.

| 파일 | 내용 |
| --- | --- |
| [`PROMPT.md`](PROMPT.md) | Claude Code에 붙여넣을 메인 개발 프롬프트 (기획서 + 구현 지시 + 마일스톤 + 완료 기준) |
| [`MODIFY_EXAMPLES.md`](MODIFY_EXAMPLES.md) | 다 만든 뒤 Claude Code로 수정 요청하는 방법과 예시 |

## 사용 순서

1. Unity Hub에서 **Unity 6 LTS, 2D (URP)** 템플릿으로 빈 프로젝트 생성.
2. 그 프로젝트 폴더에서 터미널을 열고 `git init` → `claude` 실행.
3. `PROMPT.md`의 `---` 아래 전체를 붙여넣기.
4. Claude가 마일스톤(M1~M8)마다 보고하면 Unity에서 `Tools > StoneLine > Setup Project` 실행 후 `Boot` 씬 Play로 확인하고 "다음 단계 진행해"라고 답하기.
5. 완성 후 수정은 `MODIFY_EXAMPLES.md` 참고.

> 팁: Unity 에디터를 Claude Code가 직접 조작할 수 있게 하려면 Unity용 MCP 서버(예: 커뮤니티 Unity MCP)를 연결하면 콘솔 에러 확인·테스트 실행까지 자동화됩니다. 없어도 프롬프트는 동작하도록 작성되어 있습니다.
