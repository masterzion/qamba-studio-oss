import { useEffect, useState } from "react";
import { LOCAL_PROVIDER_EVENT } from "../lib/localProviderProfiles";
export function useLocalProviderSettings() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision((r) => r + 1);
    window.addEventListener(LOCAL_PROVIDER_EVENT, changed);
    return () => window.removeEventListener(LOCAL_PROVIDER_EVENT, changed);
  }, []);
  return revision;
}
