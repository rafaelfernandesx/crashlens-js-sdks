import { DeviceInfo, WebDeviceInfo } from '@crashlens/core';

/** Extrai nome e versão do browser a partir do user agent. */
export function parseUserAgent(ua: string): { browserName?: string; browserVersion?: string } {
  const nameMap: Array<[RegExp, string]> = [
    [/Edg\//, 'Edge'],
    [/OPR\//, 'Opera'],
    [/Chrome\//, 'Chrome'],
    [/Firefox\//, 'Firefox'],
    [/Safari\//, 'Safari'],
    [/MSIE /, 'IE'],
    [/Trident\//, 'IE'],
  ];
  for (const [re, name] of nameMap) {
    if (re.test(ua)) {
      const part = ua.split(' ').find((p) => re.test(p));
      const version = part?.split('/')[1]?.match(/^[\d.]+/)?.[0];
      return { browserName: name, browserVersion: version };
    }
  }
  return {};
}

const STORAGE_KEY = 'crashlens_device_id';

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

/** Coleta informações do browser para o evento (deviceInfo com platformInfo.web). */
export function collectBrowserInfo(): DeviceInfo {
  const nav = navigator;
  const ua = nav?.userAgent ?? '';
  const { browserName, browserVersion } = parseUserAgent(ua);
  const web: WebDeviceInfo = {
    browserName,
    browserVersion,
    userAgent: ua,
    platform: nav?.platform,
    language: nav?.language,
    vendor: nav?.vendor,
    screenResolution: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : undefined,
  };
  return {
    deviceId: getOrCreateDeviceId(),
    deviceOs: 'web',
    deviceType: 'web',
    deviceName: browserName,
    deviceModel: browserName,
    cpuArchitecture: undefined,
    locale: nav?.language,
    screenResolution: web.screenResolution,
    platformInfo: { web },
  };
}