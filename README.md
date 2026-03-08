# GREGORI API Tests

Gregori API 컨트랙트·통합 테스트 프로젝트입니다.

## 사전 요구 사항

- Node.js
- 백엔드 API 서버 (테스트 실행 시)

## 설치

```bash
npm install
```

## Generated API 클라이언트 업데이트

`src/generated/` 아래의 API 클라이언트와 스키마는 백엔드 OpenAPI 스펙에서 [orval](https://orval.dev/)로 생성됩니다. 백엔드 스펙이 변경되면 아래 순서로 다시 생성하세요.

1. **OpenAPI 스펙 다운로드**  
   Redoc 문서가 사용하는 스펙 URL(`/api-docs`)에서 받아옵니다. 백엔드 서버가 실행 중이어야 합니다.

   ```bash
   curl -o openapi.json "http://localhost:8080/api-docs"
   ```

2. **클라이언트 생성**

   ```bash
   npx orval
   ```

한 번에 실행하려면:

```bash
curl -o openapi.json "http://localhost:8080/api-docs" && npx orval
```

- Redoc 문서: `http://localhost:8080/redoc.html`
- 스펙 URL: `http://localhost:8080/api-docs`

## 테스트 실행

- 컨트랙트 테스트: `npm run test`
- 통합 테스트: `npm run test:integration`
- 상세 옵션은 `package.json`의 `scripts` 참고

## 환경 변수

`.env.example`을 복사해 `.env`를 만들고 필요한 값을 설정하세요.  
API 서버 URL(`API_URL`), 인증용 쿠키, 통합 테스트 계정 등이 필요합니다.
