# Clipboard image paste for Redmine 7.0.2

[peclik/clipboard_image_paste](https://github.com/peclik/clipboard_image_paste)의 별도 붙여넣기 창과 이미지 자르기를 유지한 **Redmine 7.0.2용 수정본 2.0.0**입니다. upstream 공식 릴리스가 아닙니다.

Paste and crop a clipboard image in a separate dialog, then attach it **without inserting image markup into the issue body**. This fork uses Redmine 7's native binary upload/token contract and preserves normal textarea image paste behavior.

## 사용 방법

1. 파일 첨부 영역의 **클립보드 이미지 추가 / Add picture from clipboard** 버튼을 누릅니다.
2. 열린 창에서 **Ctrl+V**로 클립보드 이미지를 붙여넣습니다.
3. 필요하면 마우스로 자를 영역을 선택하고 확인을 누릅니다.
4. 첨부 목록의 파일명·설명을 편집한 뒤 일감을 저장합니다.

이미지는 PNG로 변환해 표준 첨부 목록에 추가합니다. 이 버튼으로 첨부한 이미지 때문에 본문은 변경되지 않습니다. Redmine의 기본 본문 붙여넣기 기능도 유지됩니다. 표준 파일 크기·개수 제한을 사용하고 업로드 실패 시 다시 시도할 수 있습니다. 업로드 중에는 저장을 잠그며 여러 폼의 대기열을 처리합니다. 파일 사용자 정의 필드에는 버튼을 추가하지 않습니다.

## 설치

```sh
git clone https://github.com/jengros/clipboard_image_paste.git plugins/clipboard_image_paste
```

Redmine 루트에서 위 명령을 실행하고 Redmine 프로세스를 재시작합니다. 기존 같은 이름의 플러그인이 있으면 먼저 **plugins 폴더 바깥**에 백업합니다. 추가 gem이나 플러그인 DB migration은 없습니다. 이전 Redmine 버전 호환성은 제공하지 않습니다.

GitHub의 소스 ZIP을 내려받았다면 폴더 이름을 `clipboard_image_paste`로 바꿔 Redmine의 plugins 아래에 배치합니다. 배포 ZIP은 `test/Build-Package.ps1`로 만들 수 있으며, 실행 파일·번역·문서·라이선스만 포함합니다.

## 검증 환경과 한계

- Redmine 7.0.2 / Ruby 4.0.7 / Rails 8.1.4 / Propshaft.
- 격리 production 런타임 검증 13개, Edge 브라우저 검증 25개 통과.
- 로컬 직접 시험용 HTTP 화면 통합 검증 7개 통과.
- 해당 버전의 운영 인스턴스에서 설치·기동·실제 훅·자산·기존 조회 API 정상 상태 확인.

자동 붙여넣기는 합성 이벤트를 사용하고, 첨부 업로드 응답은 모의 처리합니다. 사용자의 로컬 직접 시험 정상 동작 보고는 있으나 브라우저별 OS 클립보드의 항목별 수동 시험을 모두 수행한 것은 아닙니다. 운영 실제 첨부 저장·일감 연결·삭제, Firefox/Chrome, 다른 버전과 다른 플러그인 조합은 미검증입니다. [VERIFICATION.md](VERIFICATION.md)에 범위를 구분했습니다.

## 개발 검증과 직접 시험

PowerShell 7, Docker, Node.js, Playwright 및 Microsoft Edge가 필요합니다. `CBP_PLAYWRIGHT`와 `CBP_BROWSER` 환경 변수로 Playwright 모듈과 브라우저 실행 파일 경로를 지정할 수 있습니다.

1. Docker에 검증 대상 `redmine:7.0.2` 이미지가 있는지 확인합니다. 필요한 경우 직접 이미지를 준비합니다.
2. `pwsh -File test/Verify-Runtime.ps1`로 DB 연결을 차단한 격리 컨테이너 검증과 브라우저 fixtures 생성을 실행합니다.
3. `node test/browser.cjs` 및 `node test/preview-smoke.cjs`로 브라우저·로컬 HTTP 시험을 실행합니다.
4. 직접 시험하려면 `node test/preview.cjs`를 실행하고 출력된 localhost 주소를 브라우저에서 엽니다.

직접 시험 화면의 첨부·저장은 모의 처리이고 이미지 바이트는 메모리에만 보관합니다. **시험 종료** 버튼으로 프로그램과 메모리 첨부를 정리하며 최대 8시간 후 자동 종료합니다. 선택적 CSS fixture `test/fixtures/operating-css.json`은 `application.css`와 `theme.css` 키의 `{ "content": "..." }` 형식으로 사용할 수 있습니다. fixtures·결과·로그·ZIP·node_modules는 Git에서 제외합니다.

[UPSTREAM.md](UPSTREAM.md)에 원본 기준과 변경 범위를 기록했습니다. GNU GPL Version 2([COPYING](COPYING))를 유지하며 Jcrop의 MIT 저작권 문구도 보존합니다. `README.textile`은 원본 기여자·변경 이력 보존용 문서입니다.
