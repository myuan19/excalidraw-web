import { createIsolation } from "jotai-scope";
import React from "react";
import tunnelRat from "tunnel-rat";

/** tunnel-rat's bundled types use `() => JSX.Element`, which breaks under React 19. */
export type Tunnel = {
  In: React.FC<{ children: React.ReactNode }>;
  Out: React.FC;
};

function createTunnel(): Tunnel {
  const t = tunnelRat();
  return {
    In: ({ children }) => t.In({ children }),
    Out: () => t.Out() as unknown as React.ReactElement,
  };
}

type TunnelsContextValue = {
  MainMenuTunnel: Tunnel;
  WelcomeScreenMenuHintTunnel: Tunnel;
  WelcomeScreenToolbarHintTunnel: Tunnel;
  WelcomeScreenHelpHintTunnel: Tunnel;
  WelcomeScreenCenterTunnel: Tunnel;
  FooterCenterTunnel: Tunnel;
  DefaultSidebarTriggerTunnel: Tunnel;
  DefaultSidebarTabTriggersTunnel: Tunnel;
  OverwriteConfirmDialogTunnel: Tunnel;
  TTDDialogTriggerTunnel: Tunnel;
  // this can be removed once we create jotai stores per each editor
  // instance
  tunnelsJotai: ReturnType<typeof createIsolation>;
};

export const TunnelsContext = React.createContext<TunnelsContextValue>(null!);

export const useTunnels = () => React.useContext(TunnelsContext);

const tunnelsJotai = createIsolation();

export const useInitializeTunnels = () => {
  return React.useMemo((): TunnelsContextValue => {
    return {
      MainMenuTunnel: createTunnel(),
      WelcomeScreenMenuHintTunnel: createTunnel(),
      WelcomeScreenToolbarHintTunnel: createTunnel(),
      WelcomeScreenHelpHintTunnel: createTunnel(),
      WelcomeScreenCenterTunnel: createTunnel(),
      FooterCenterTunnel: createTunnel(),
      DefaultSidebarTriggerTunnel: createTunnel(),
      DefaultSidebarTabTriggersTunnel: createTunnel(),
      OverwriteConfirmDialogTunnel: createTunnel(),
      TTDDialogTriggerTunnel: createTunnel(),
      tunnelsJotai,
    };
  }, []);
};
