# 원본과 수정 범위

- 원본: [peclik/clipboard_image_paste](https://github.com/peclik/clipboard_image_paste).
- 기준 커밋: `b8aae6d08be0a542f5995423464da8799b4f510b` (2024-11-01).
- 수정본: [jengros/clipboard_image_paste](https://github.com/jengros/clipboard_image_paste), 버전 2.0.0, 대상 Redmine 7.0.2.
- 원본 저자와 GNU GPL Version 2 표기를 유지했습니다. 전문은 COPYING에 있습니다.
- 원본 Jcrop 0.9.12-p1 코드·CSS·GIF를 유지하고 해당 JS의 MIT 저작권·허가 문구를 보존했습니다.

원본 별도 붙여넣기 창·canvas·Jcrop 흐름을 유지하면서 Base64 데이터를 모델에서 변환하는 경로를 Redmine 표준 바이너리 업로드 및 token 경로로 변경했습니다. 구형 모델 패치·설정·중복 jQuery/UI와 미사용 관련 자산을 제거했습니다. Redmine PluginLoader/Zeitwerk 훅 로딩과 Propshaft 자산 helper를 사용합니다.

표준 addFile의 첨부 행 생성과 uploadBlob의 URL/CSRF/token 계약을 사용합니다. 전역 본문 삽입 함수를 덮어쓰지 않으며 이 플러그인의 업로드에는 본문 삽입 콜백을 호출하지 않습니다. 업로드 수·대기열을 기본 기능과 공유하고 파일 크기·개수 제한, 실패 정리·재시도, 여러 폼의 동시 처리, 취소·재열기와 반복 초기화를 처리합니다.

공개 저장소는 원본 이력을 유지한 포크입니다. 내부 운영 기록을 포함한 작업 커밋을 올리는 대신 검증된 실행 파일을 원본 기준 위에 반영했습니다. upstream 공식 릴리스이거나 다른 Redmine 버전을 지원한다고 주장하지 않습니다.
