export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "critical";
export type LogSource = "client" | "server";
export type LogComponent =
  | "FE"
  | "BE"
  | "CLI"
  | "TUI"
  | "EM"
  | "ER"
  | "FL"
  | "WK"
  | "SYS"
  | string;
export type LogContext = Record<
  string,
  string | number | boolean | null | undefined
>;
export type LogFields = Record<string, unknown>;

export interface LogEntry {
  ts: string;
  level: LogLevel;
  source: LogSource;
  component?: LogComponent;
  module: string;
  event?: string;
  msg: string;
  data?: Record<string, unknown>;
  context?: LogContext;
  fields?: LogFields;
  sourceLocation?: string;
  sequence?: number;
  sid?: string;
  ua?: string;
}

export interface DebugEventOptions {
  message?: string;
  context?: LogContext;
  fields?: LogFields;
  sourceLocation?: string;
}

export interface LogTransport {
  write(entry: LogEntry): void;
}

export declare const LEVEL_VALUE: Record<LogLevel, number>;
export declare function componentForSource(source: LogSource): LogComponent;
export declare function normalizeLogData(
  data: unknown,
): Record<string, unknown> | undefined;
export declare function isSensitiveLogKey(key: string): boolean;
export declare function sanitizeLogRecord(
  record?: Record<string, unknown>,
  opts?: { maxStringLength?: number; depth?: number },
): Record<string, unknown> | undefined;
export declare function formatKeyValuePairs(
  values?: Record<string, unknown>,
): string;
export declare function formatDebugEvent(entry: LogEntry): string;

export declare class Logger {
  constructor(opts: {
    module: string;
    source: LogSource;
    component?: LogComponent;
    context?: LogContext | (() => LogContext);
    minLevel?: LogLevel | (() => LogLevel);
    transports: LogTransport[];
  });
  trace(msg: string, data?: unknown): void;
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  critical(msg: string, data?: unknown): void;
  event(
    level: LogLevel,
    event: string,
    message: string,
    opts?: DebugEventOptions,
  ): void;
}
