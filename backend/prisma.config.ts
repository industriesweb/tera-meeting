import "dotenv/config";

export default {
  schema: "src/prisma/schema.prisma",
  datasource: {
    url: (globalThis as any).process?.env?.DATABASE_URL,
  },
};