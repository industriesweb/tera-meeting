import dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const env = {
  PORT: parseInt(process.env.PORT || "4000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  CORS_ORIGIN: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000",
  DATABASE_URL: requireEnv("DATABASE_URL"),
  DIRECT_URL: process.env.DIRECT_URL,
  SUPABASE_URL: requireEnv("SUPABASE_URL"),
  SUPABASE_JWT_SECRET: requireEnv("SUPABASE_JWT_SECRET"),
};
