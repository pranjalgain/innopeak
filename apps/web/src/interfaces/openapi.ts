import z from "zod";

export const OpenApiParams = z.object({
  id: z.string().describe("OpenApi ID"),
});

export const OpenApiResponse = z.object({
  id: z.string().describe("OpenApi ID"),
  name: z.string().describe("OpenApi name"),
  price: z.number().positive().describe("OpenApi price"),
});
