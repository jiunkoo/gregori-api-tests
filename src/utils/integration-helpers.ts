import axios, { AxiosInstance } from "axios";
import { getGregoriApi } from "../generated/gregori-api";
import { getIntegrationBaseURL } from "./integration-axios";

export const integrationApi = getGregoriApi();

let axiosInstance: AxiosInstance | null = null;

export const getAxiosInstance = (): AxiosInstance => {
  if (!axiosInstance) {
    axiosInstance = axios.create({
      baseURL: getIntegrationBaseURL(),
      timeout: 10000,
    });
  }
  return axiosInstance;
};

export const generateUniqueEmail = (prefix: string = "test"): string => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}-${timestamp}-${random}@integration.test`;
};

export const generateUniqueName = (prefix: string = "테스트"): string => {
  const timestamp = Date.now();
  const lastDigit = timestamp % 10;
  const hangulNumbers = [
    "영",
    "일",
    "이",
    "삼",
    "사",
    "오",
    "육",
    "칠",
    "팔",
    "구",
  ];
  const hangulDigit = hangulNumbers[lastDigit];

  const fullName = `${prefix}${hangulDigit}`;
  return fullName.length > 10 ? fullName.substring(0, 10) : fullName;
};

export const waitFor = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

let sharedTestAccount: {
  email: string;
  password: string;
  name: string;
  memberId: number | null;
} | null = null;

export const setSharedTestAccount = (account: {
  email: string;
  password: string;
  name: string;
  memberId: number | null;
}) => {
  sharedTestAccount = account;
};

export const getSharedTestAccount = () => {
  return sharedTestAccount;
};

export const clearSharedTestAccount = () => {
  sharedTestAccount = null;
};
