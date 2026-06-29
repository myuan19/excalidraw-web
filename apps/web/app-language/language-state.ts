import { atom, useAtom } from "../app-jotai";

import { getPreferredLanguage } from "./language-detector";

export const appLangCodeAtom = atom(getPreferredLanguage());

export const useAppLangCode = () => {
  return useAtom(appLangCodeAtom);
};
