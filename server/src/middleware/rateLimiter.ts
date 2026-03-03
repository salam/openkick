import { rateLimit } from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test";

// General: 100 requests per 15 minutes for all /api/* routes
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10_000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Auth: 10 requests per 15 minutes for login endpoint
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1_000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

// Mutation: 30 requests per 15 minutes for POST/PUT/DELETE
export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
