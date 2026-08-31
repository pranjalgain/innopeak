import { ApiReference } from "@scalar/nextjs-api-reference";

const config = {
  url: "/openapi.json",
  theme: "purple" as const,
  cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest",
};

export const GET = ApiReference(config);
