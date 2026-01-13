import {
  initializeGlobalTestSession,
  initializeAdminTestSession,
} from "../../utils/integration-session";

export async function setup() {
  await Promise.all([
    initializeGlobalTestSession(),
    initializeAdminTestSession(),
  ]);
}
