let baseURL: string | null = null;

export function setIntegrationBaseURL(url: string): void {
  baseURL = url;
}

export function getIntegrationBaseURL(): string {
  return baseURL ?? "";
}

export function isIntegrationEnabled(): boolean {
  return !!baseURL;
}
