import { app } from 'electron';

/** The few strings the main process shows (errors, dialogs). */
const EN = {
  portInUse: 'Port {port} is already in use',
  pickModel: 'Choose a 3D car model',
  connectSketchfabFirst: 'Connect your Sketchfab account in Settings first',
  sfSearchError: 'Sketchfab search failed ({status})',
  sfInvalidKey: 'Invalid API token',
  sfError: 'Sketchfab error ({status})',
  sfConnected: 'connected',
  sfKeyMissing: 'Sketchfab token is missing or invalid',
  sfNoLink: 'Could not get a download link ({status})',
  sfNoGlb: 'This model can’t be downloaded as GLB, pick another one',
  sfDownloadFailed: 'Download failed ({status})',
} as const;
type Key = keyof typeof EN;

const TR: Record<Key, string> = {
  portInUse: 'Port {port} kullanımda',
  pickModel: '3D araç modeli seç',
  connectSketchfabFirst: 'Önce Ayarlar’dan Sketchfab hesabını bağla',
  sfSearchError: 'Sketchfab arama hatası ({status})',
  sfInvalidKey: 'Anahtar geçersiz',
  sfError: 'Sketchfab hatası ({status})',
  sfConnected: 'bağlandı',
  sfKeyMissing: 'Sketchfab anahtarı geçersiz ya da eksik',
  sfNoLink: 'İndirme bağlantısı alınamadı ({status})',
  sfNoGlb: 'Bu model GLB olarak indirilemiyor, başka bir model seç',
  sfDownloadFailed: 'İndirme başarısız ({status})',
};

let lang = 'en';

/** 'auto' follows the OS language (only Turkish has main-process strings besides English). */
export function setMainLanguage(pref: string) {
  const code = pref && pref !== 'auto' ? pref : (app.getPreferredSystemLanguages?.()[0] ?? app.getLocale());
  lang = code.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function mt(key: Key, vars?: Record<string, string | number>): string {
  let s: string = (lang === 'tr' ? TR : EN)[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
