# Gregori API Tests

## GREGORI란?

GREGORI는 종합 쇼핑몰 이커머스 서비스입니다.  
백엔드는 Spring Boot 기반으로 구축되었으며, REST API 방식으로 프론트와 통신합니다.

**이 저장소**는 그 백엔드 API를 자동으로 검증하는 **테스트 전용 프로젝트**입니다.

- API 스펙(OpenAPI 문서)대로 구현되었는지, 실제 서버에서 잘 동작하는지 테스트로 확인할 수 있습니다.
- **컨트랙트 테스트**: 스펙·요청/응답 형식 검증 (서버 불필요)
- **통합 테스트**: 실제 API 서버에 요청을 보내 동작 검증 (서버 필요)

API 클라이언트는 백엔드의 OpenAPI 스펙에서 [Orval](https://orval.dev/)으로 자동 생성되며, TypeScript 타입과 Zod 스키마가 함께 생성되어 타입 안전하게 테스트를 작성할 수 있습니다.

---

## 🚀 빠르게 실행해보기

### 1) 필수 요구사항

- Node.js (LTS 권장)
- npm  
  (통합 테스트만 실행할 때는 백엔드 API 서버가 떠 있어야 함)

### 2) 프로젝트 클론

```bash
git clone https://github.com/OWNER/gregori-api-tests.git
cd gregori-api-tests
```

### 3) 의존성 설치 및 테스트 실행

**✔ 의존성 설치**

```bash
npm install
```

**✔ 컨트랙트 테스트 실행** (서버 없이 가능)

```bash
npm run test
```

**✔ 통합 테스트 실행** (백엔드 서버 실행 후)

`.env.example`을 복사해 `.env`를 만들고 `API_URL`, 테스트 계정 정보를 설정한 뒤:

```bash
npm run test:integration
```

### 4) API 클라이언트 코드 갱신 (옵션)

백엔드 OpenAPI 스펙이 변경된 경우, 아래 명령으로 클라이언트를 다시 생성합니다.

```bash
curl -o openapi.json "http://localhost:8080/api-docs" && npx orval
```

백엔드 서버가 실행 중이어야 하며, 주소/포트는 환경에 맞게 수정하세요.

### 📚 API 문서 (백엔드)

백엔드 애플리케이션 실행 후 아래 주소에서 API 명세를 확인할 수 있습니다:

👉 **Redoc UI**: http://localhost:8080/redoc.html

OpenAPI 스펙 JSON은 `/api-docs` 에서 제공됩니다.

---

## 📁 프로젝트 구조

```
gregori-api-tests/
├── openapi.json                 # API 스펙 (백엔드에서 다운로드)
├── orval.config.ts              # Orval 클라이언트 생성 설정
├── vitest.config.ts             # 컨트랙트 테스트 설정
├── vitest.integration.config.ts # 통합 테스트 설정
├── src/
│   ├── generated/               # Orval 생성 결과 (직접 수정하지 않음)
│   │   ├── gregori-api.ts       # API 호출 함수
│   │   └── schemas/             # 요청·응답 타입·Zod 스키마
│   ├── tests/
│   │   ├── contract/            # 컨트랙트 테스트
│   │   └── integration/        # 통합 테스트
│   └── utils/                   # 인증, 로깅, 테스트 헬퍼
├── .env.example                 # 환경 변수 예시 (복사해 .env로 사용)
└── README.md
```

---

## 🧪 테스트

| 명령어                           | 설명                              |
| -------------------------------- | --------------------------------- |
| `npm run test`                   | 컨트랙트 테스트 실행              |
| `npm run test:watch`             | 컨트랙트 테스트 감시 모드         |
| `npm run test:coverage`          | 컨트랙트 테스트 + 커버리지 리포트 |
| `npm run test:integration`       | 통합 테스트 실행 (API 서버 필요)  |
| `npm run test:integration:watch` | 통합 테스트 감시 모드             |

커버리지 리포트는 `npm run test:coverage` 실행 후 `coverage/` 디렉터리에서 확인할 수 있습니다.

---

## ⚙️ 환경 변수

`.env.example`을 복사해 `.env`를 만든 뒤 필요한 값을 설정하세요.

| 구분        | 변수 예시                                       | 설명                                                    |
| ----------- | ----------------------------------------------- | ------------------------------------------------------- |
| API         | `API_URL`                                       | API 서버 URL (예: `http://localhost:8080`)              |
| 인증        | `ADMIN_MEMBER_SESSION_COOKIE` 등                | 관리자/판매자/일반회원 세션 쿠키                        |
| 통합 테스트 | `TEST_*_MEMBER_EMAIL`, `TEST_*_MEMBER_PASSWORD` | 통합 테스트용 계정 정보                                 |
| 로깅        | `LOG_MODE`, `LOG_FORMAT` 등                     | 로그 레벨·형식 (자세한 내용은 `.env.example` 주석 참고) |

---

## 🛠 기술 스택

- **Node.js** + **TypeScript**
- **Vitest** — 테스트 러너 (컨트랙트·통합)
- **Orval** — OpenAPI 스펙 → Axios 클라이언트·Zod 스키마 자동 생성
- **Axios** — HTTP 클라이언트 (쿠키 인증·로깅 연동)

---

## 기타 스크립트

- `npm run build` — TypeScript 빌드
- `npm run lint` — 타입 검사 (`tsc --noEmit`)

---
