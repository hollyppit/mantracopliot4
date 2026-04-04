작업 전 .claude/ 폴더의 모든 md 파일을 참고할 것.

## 만트라 스튜디오 공통 개발 규칙
작업 시작 전 반드시 이 파일 숙지할 것.

### 기본 원칙
- 폴더별 역할이 다르니 작업 대상 폴더 외에는 절대 건드리지 말 것
- 작업 전 반드시 어느 폴더를 수정하는지 명시할 것
- API는 웹 버전(Cloudflare Functions)에만 추가, 다른 버전은 절대경로로 호출

### 플랫폼별 폴더 구조 규칙
- {앱명}-web/ 또는 {앱명}-vision/: 브라우저 웹 버전
  - 순수 HTML/JS 구조
  - npm 빌드 없음, 토스 SDK npm 패키지 설치 금지
  - Cloudflare Functions (API) 포함
  - 환경변수 여기서만 관리

- {앱명}-toss/ 또는 {앱명}-mirror/: 토스 미니앱 전용
  - Vite + @apps-in-toss/web-framework
  - UI만 담당, functions 폴더 없음
  - 모든 API는 웹 버전 절대경로로 호출
  - npm run build → .ait 번들 → 토스 콘솔 업로드

- {앱명}-react/: 앱스토어/플레이스토어용 (추후)
  - React Native 구조
  - API는 웹 버전 절대경로로 호출

### 환경변수 목록 (키 이름만 기록 / 실제 값은 절대 이 파일에 쓰지 말 것)

#### 웹 버전 (*-web/, *-vision/) → Cloudflare Pages 대시보드에 등록
- ANTHROPIC_API_KEY: Claude API
- GEMINI_API_KEY: Gemini API (이미지 생성)
- OPENAI_API_KEY: OpenAI API
- SUPABASE_URL: Supabase 프로젝트 URL
- SUPABASE_ANON_KEY: Supabase 익명 키
- YOUTUBE_API_KEY: YouTube Data API v3
- TOSS_LOGIN_DECRYPT_KEY: 토스 로그인 복호화 키
- TOSS_PAY_SECRET_KEY: 토스페이 시크릿 키

#### 토스 미니앱 (*-toss/, *-mirror/) → API 직접 호출 없음
- 환경변수 없음
- 모든 API는 웹 버전 Cloudflare Functions를 절대경로로 경유할 것
- 절대 미니앱 폴더에서 직접 API 키 사용 금지

#### React 버전 (*-react/) → 프로젝트 루트 .env.local 파일로 관리
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- VITE_ANTHROPIC_API_KEY
- VITE_OPENAI_API_KEY
- ⚠️ Vite는 반드시 VITE_ 접두사 필요. 없으면 undefined로 읽힘
- ⚠️ .env.local은 .gitignore에 포함되어 있어야 함

### 배포 규칙 (반드시 준수)

배포 전 **현재 작업 폴더명**을 확인하고 아래 표에 맞는 방법만 사용할 것.
절대로 다른 방법 혼용 금지.

| 폴더 패턴 | 배포 방법 | 명령어 |
|-----------|-----------|--------|
| *-web/ | Git push → Cloudflare Pages 자동배포 | `git add . && git commit -m "..." && git push` |
| *-toss/ 또는 *-miniapp/ | Toss SDK npm 배포 | `npm run build && npx @apps-in-toss/...` |
| *-react/ | Vite 빌드 후 별도 배포 | `npm run build` (배포는 별도 확인) |

⚠️ 배포 전 반드시 말할 것: "현재 폴더: [폴더명] → [배포방법]으로 진행합니다"

