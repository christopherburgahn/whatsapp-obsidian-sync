import "dotenv/config";
import { resolve } from "node:path";
import type { LogLevel } from "./logger.js";

export interface AppConfig {
  wahaBaseUrl: string;
  wahaApiKey: string;
  wahaSession: string;
  vaultPath: string;
  syncSubfolder: string;
  lookbackDays: number;
  minMessagesPerChat: number;
  fetchLimitPerChat: number;
  chatsOverviewLimit: number;
  chatAllowlist: string[];
  chatDenylist: string[];
  logLevel: LogLevel;
  openaiApiKey?: string;
  openaiTranscribeModel: string;
  transcribeAudio: boolean;
}

const DEFAULT_DENYLIST = ["status@broadcast"];

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function intWithDefault(name: string, fallback: number, opts: { min?: number } = {}): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  const min = opts.min ?? 1;
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`Env var ${name} must be an integer >= ${min}, got: ${raw}`);
  }
  return n;
}

function listFromEnv(name: string, fallback: string[] = []): string[] {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function boolFromEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Env var ${name} must be a boolean-like value (1/0, true/false, yes/no, on/off), got: ${raw}`);
}

function logLevelFromEnv(name: string, fallback: LogLevel): LogLevel {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["silent", "error", "warn", "info", "debug"].includes(normalized)) {
    return normalized as LogLevel;
  }
  throw new Error(`Env var ${name} must be one of silent, error, warn, info, debug; got: ${raw}`);
}

export function loadConfig(): AppConfig {
  return {
    wahaBaseUrl: (process.env.WAHA_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    wahaApiKey: required("WAHA_API_KEY"),
    wahaSession: process.env.WAHA_SESSION ?? "default",
    vaultPath: resolve(required("OBSIDIAN_VAULT_PATH")),
    syncSubfolder: process.env.SYNC_SUBFOLDER ?? "WhatsApp",
    lookbackDays: intWithDefault("LOOKBACK_DAYS", 7),
    minMessagesPerChat: intWithDefault("MIN_MESSAGES_PER_CHAT", 5, { min: 0 }),
    fetchLimitPerChat: intWithDefault("FETCH_LIMIT_PER_CHAT", 200),
    chatsOverviewLimit: intWithDefault("CHATS_OVERVIEW_LIMIT", 100),
    chatAllowlist: listFromEnv("CHAT_ALLOWLIST", []),
    chatDenylist: listFromEnv("CHAT_DENYLIST", DEFAULT_DENYLIST),
    logLevel: logLevelFromEnv("LOG_LEVEL", "info"),
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    openaiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe",
    transcribeAudio: boolFromEnv("TRANSCRIBE_AUDIO", false),
  };
}
