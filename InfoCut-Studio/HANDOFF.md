# 작업 기록

## v2 (2026-11-13) 에서 끝낸 것

요청: 휴대폰 단독 안드로이드 APK + PC 버전 유지, 영상과 프로그램 화면 둘 다 AI 티 제거.

- **PC 화면**: 어두운 편집 프로그램식으로 다시 만듦. 왼쪽 장면 목록, 가운데 미리보기와 타임라인, 오른쪽 패널(장면/조사/디자인/소리/내보내기). 설명 문구와 안내 상자 삭제, 아이콘은 SVG, 강조색은 내보내기 버튼만
- **휴대폰 화면**: 위 미리보기, 아래 탭 5개, 장면을 누르면 편집 시트. PC 와 같은 React 코드 (`useMobile()` 로 갈림)
- **휴대폰 단독 엔진** (`ui/src/local/`): `api()` 가 서버 대신 `router.ts` 로 간다. IndexedDB 저장, CapacitorHttp 로 AI 호출, 기기 TTS, `renderMediaOnWeb` 렌더, MediaStore 저장
- **안드로이드 앱** (`android/`): Capacitor 8, `InfoCutPlugin.java`. 서명 키(`android/app/infocut-debug.keystore`)를 고정해서 덮어 설치가 된다
- **APK 빌드**: `.github/workflows/infocut-apk.yml` (푸시할 때마다), PC 는 `APK빌드.bat`
- **.infocut 주고받기**: `src/shared/pack.ts`. PC 는 `/api/import`, `/api/projects/:id/pack`
- **대본**: 기계가 쓴 티가 나는 표현을 금지하는 규칙 추가
- **영상**: 화이트 디자인에서 자막을 검은 글자로 (흰 글자는 흰 바탕에서 안 읽힘)
- 반쯤 됐던 것 마무리: AI 코드가 `http()` 를 씀, Settings 타입 하나로 합침, 사진 검색을 `src/shared/ai/media.ts` 로 옮김

## 확인한 것 / 못 한 것

- 확인: 타입 검사, PC 서버 렌더(MP4), .infocut 내보내기·가져오기, PC·휴대폰 화면 스크린샷, 브라우저 렌더러로 1080×1920 MP4, AI 흐름(`scratch/mock.mts`, 가짜 응답)
- 못 함: 실제 안드로이드 기기 실행(기본 목소리, 갤러리 저장, 공유), 실제 AI 키로 조사·대본, 윈도우에서 `APK빌드.bat`, 프리미어에서 XML 열기

## 테스트 도구

- `scratch/still.mts`: 디자인별 스틸 (`OUT=폴더 INFOCUT_CHROME=크롬경로 npx tsx scratch/still.mts shorts:paper,long:black`)
- `scratch/mock.mts`: 가짜 AI 응답으로 조사·대본·수정 흐름 점검
- 휴대폰 화면을 PC 브라우저에서 보기: `npm run build:mobile` 뒤 `mobile/www` 를 아무 정적 서버로 열기
