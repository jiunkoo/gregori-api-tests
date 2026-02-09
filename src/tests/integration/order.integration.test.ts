import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INTEGRATION_TEST_ENABLED } from "./integration.bootstrap";
import { getGlobalTestAccount, waitForGlobalSession } from "../../utils/integration-session";
import { integrationApi } from "../../utils/integration-helpers";
import type { OrderRequestDto } from "../../generated/schemas";

const describeIf = INTEGRATION_TEST_ENABLED ? describe : describe.skip;

describeIf("Integration: Order API", () => {
  let testEmail: string;
  let memberId: number | null = null;
  let createdOrderIds: number[] = [];

  beforeAll(async () => {
    await waitForGlobalSession();
    const globalAccount = getGlobalTestAccount();
    testEmail = globalAccount.email || "";
    memberId = globalAccount.memberId;
    if (!testEmail || !memberId) {
      throw new Error(
        "전역 테스트 계정이 초기화되지 않았습니다. 통합 테스트 세션이 올바르게 설정되지 않았습니다."
      );
    }
  });

  afterAll(async () => {
    for (const orderId of createdOrderIds) {
      await integrationApi.cancelOrder(orderId).catch(() => {});
    }
  });

  describe("POST /order", () => {
    it("CO | 200 | 성공 | 주문 생성 성공", async () => {
      // given
      const payload: OrderRequestDto = {
        memberId: memberId!,
        paymentMethod: "CARD",
        paymentAmount: 50000,
        deliveryCost: 3000,
        orderDetails: [
          {
            productId: 1,
            productCount: 1,
          },
        ],
      };

      // when
      const response = (await integrationApi.createOrder(payload)) as any;

      // then
      expect(response.status).toBe(201);
      const location = response.headers?.location || response.headers?.Location;
      expect(location).toMatch(/\/order\/\d+$/);
      const orderIdMatch = location?.match(/\/order\/(\d+)/);
      if (orderIdMatch) {
        createdOrderIds.push(parseInt(orderIdMatch[1], 10));
      }
    });
  });

  describe("GET /order", () => {
    it("GO | 200 | 성공 | 주문 목록 조회 성공", async () => {
      // when
      const response = (await integrationApi.getOrders({
        sessionMember: {
          id: memberId!,
          email: testEmail,
          authority: "GENERAL_MEMBER",
        },
      })) as any;

      // then
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      if (response.data.length > 0) {
        expect(response.data[0]).toHaveProperty("id");
      }
    });
  });

  describe("GET /order/{orderId}", () => {
    it("GOI | 200 | 성공 | 주문 상세 조회 성공", async () => {
      // given
      if (createdOrderIds.length === 0) {
        throw new Error(
          "조회할 주문이 없습니다. 주문 생성 테스트가 먼저 실행되어야 합니다."
        );
      }
      const orderId = createdOrderIds[0];

      // when
      const response = (await integrationApi.getOrder(orderId)) as any;

      // then
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data?.id).toBe(orderId);
      expect(response.data?.status).toBeDefined();
    });
  });

  describe("PATCH /order/{orderId}", () => {
    it("CAO | 200 또는 409 | 주문 취소 성공 또는 상태 확인", async () => {
      // given
      if (createdOrderIds.length === 0) {
        throw new Error(
          "취소할 주문이 없습니다. 주문 생성 테스트가 먼저 실행되어야 합니다."
        );
      }
      const orderId = createdOrderIds[0];

      // when
      const response = (await integrationApi.cancelOrder(orderId)) as any;

      // then
      expect([200, 204]).toContain(response.status);
    });
  });
});
