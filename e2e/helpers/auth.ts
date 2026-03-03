import path from "node:path";

export const ADMIN_EMAIL = "admin@example.com";
export const ADMIN_PASSWORD = "SuperStrongP@ss1234!";
export const ADMIN_NAME = "Test Admin";

export const AUTH_FILE = path.join(import.meta.dirname, "..", ".auth", "admin.json");

export const API_BASE = "http://localhost:3001";
export const WEB_BASE = "http://localhost:3000";
