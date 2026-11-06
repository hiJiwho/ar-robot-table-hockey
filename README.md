# AR Robot air hotkey

빔프로젝터 투사형 AR 로봇 에어하키 시스템 (Electron 3개 창 분리 지원)

## 주요 화면 구성 (3-Window System)
1. **[메인 경기장 창]**: 빔프로젝터 투사용 순수 블랙 배경, 선명한 화이트 라인, 중앙 부근 대형 그레이 점수 및 시계 (네모 박스 없음, 퍽 주변 효과 제거, 대기 상태 시 골대 미표시, 게임 종료 시 회색 비활성화).
2. **[서브 전광판 창]**: 관중/플레이어용 대형 스코어보드. 게임 중에는 점수와 타이머가 크게 표시되며, 종료 후 콘솔 확인 시 "게임 플레이 가능" 대기 안내 표시.
3. **[관리 콘솔 창]**: 관리자 제어 화면. 실시간 메인 경기장 미러링 및 마커 인식 좌표, 실시간 시간 추가 (+30초, +1분, +2분, -30초), 점수 수동 조정, 게임 시작/일시정지/종료 제어.

## 조작 및 플레이
- 마커가 좌우로만 움직여도 골대 앞을 방어하고 공을 힘차게 상대 진영으로 쳐낼 수 있도록 추진력 보정 적용.
- 각 창 독립 전체화면 지원 (`F11` 또는 상단/하단 전체화면 버튼, 해제 시 `Esc`).

## 실행 방법
- **Windows 데스크톱 앱 실행**: `AR-Robot-air-hotkey-실행.bat` 더블클릭
- **Electron 빌드**: `npm run build:win`
- **웹 개발 서버**: `npm run dev`

## 인식 엔진 (OpenCV)
- 기본 엔진은 **OpenCV(opencv.js, WebAssembly)** 입니다: HSV 마스크 → 모폴로지 → 컨투어/모멘트로 마젠타 블록 2개를 추적합니다.
- opencv.js는 Electron(Chromium/Node.js)과 순수 Node.js 모두에서 네이티브 빌드 없이 동작합니다.
- Node.js 단독 검증: `npx tsx scripts/test-opencv-node.ts`
- 로딩 전/오류 시에는 기존 JS 엔진(스마트 크로마틱)으로 자동 대체되며, 컬러 튜너에서 엔진을 직접 선택할 수 있습니다.

## 웹 배포(github.io) 지원 종료
- GitHub Pages(`github.io`) 웹 사이트는 **지원 종료**되었습니다. 이 앱은 **Windows 데스크톱 앱(Electron)** 으로만 배포됩니다 → [Releases](https://github.com/hiJiwho/ar-robot-table-hockey/releases)
