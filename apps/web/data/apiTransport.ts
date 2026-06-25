import { isDesktopEditorHub } from "../lib/runtimePlatform";

import { wrapApiTransportWithResourceTrace } from "./apiTransportTraceWrap";
import { desktopApiTransport } from "./desktopApiTransport";
import { webFetchTransport } from "./webFetchTransport";

import type { ApiTransport } from "./apiTransportTypes";

const baseTransport: ApiTransport = isDesktopEditorHub()
  ? desktopApiTransport
  : webFetchTransport;

export const apiTransport: ApiTransport =
  wrapApiTransportWithResourceTrace(baseTransport);
