import { defineConfig } from "orval";

export default defineConfig({
  gregori: {
    input: "./openapi.json",
    output: {
      target: "./src/generated/gregori-api.ts",
      schemas: "./src/generated/schemas",
      client: "axios",
      clean: true,
      prettier: true,
    },
  },
});
