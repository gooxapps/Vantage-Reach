import { useEffect, useState } from 'react';
import {
  checkForAppUpdate,
  getPwaSyncSnapshot,
  promptPwaInstall,
  subscribePwaSync,
  type PwaSyncSnapshot,
} from '../lib/pwaSync';

export function usePWAInstall() {
  const [snapshot, setSnapshot] = useState<PwaSyncSnapshot>(() => getPwaSyncSnapshot());

  useEffect(() => {
    setSnapshot(getPwaSyncSnapshot());
    return subscribePwaSync(() => {
      setSnapshot(getPwaSyncSnapshot());
    });
  }, []);

  return {
    ...snapshot,
    install: promptPwaInstall,
    checkForUpdate: checkForAppUpdate,
  };
}
