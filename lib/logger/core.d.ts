export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSource = "client" | "server";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  source: LogSource;
  module: string;
  msg: string;
  data?: Record<string, unknown>;
  sid?: string;
  ua?: string;
}

export interface LogTransport {
  write(entry: LogEntry): void;
}

export declare const LEVEL_VALUE: Record<LogLevel, number>;

export declare class Logger {
  constructor(opts: {
    module: string;
    source: LogSource;
    minLevel?: LogLevel;
    transports: LogTransport[];
  });
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}
