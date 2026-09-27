// platform strings. English is the source; tr must provide every key.
export const en = {
  'platform.desktopOnly': '{what} is only available in the desktop app',
  'platform.desktopUnreachable': 'Cannot reach the desktop app',
  'platform.opThis': 'This action',
  'platform.opReplay': 'Replaying recordings',
  'platform.opCustomModels': 'Custom models',
  'platform.opDeleteRecordings': 'Deleting recordings',
  'platform.opExportCsv': 'CSV export',
  'platform.opOpenFolder': 'Opening folders',
  'platform.opImportModel': 'Importing models',
  'platform.opDeleteModel': 'Deleting models',
  'platform.opSketchfabConnect': 'Sketchfab account linking',
  'platform.opSketchfabSearch': 'Sketchfab search',
  'platform.opDownloadModel': 'Model download',
} as const;

export const tr: Record<keyof typeof en, string> = {
  'platform.desktopOnly': '{what} yalnızca masaüstü uygulamasında yapılabilir',
  'platform.desktopUnreachable': 'Masaüstü uygulamasına bağlanılamıyor',
  'platform.opThis': 'Bu işlem',
  'platform.opReplay': 'Kayıt oynatma',
  'platform.opCustomModels': 'Özel modeller',
  'platform.opDeleteRecordings': 'Kayıt silme',
  'platform.opExportCsv': 'CSV dışa aktarma',
  'platform.opOpenFolder': 'Klasör açma',
  'platform.opImportModel': 'Model yükleme',
  'platform.opDeleteModel': 'Model silme',
  'platform.opSketchfabConnect': 'Sketchfab bağlantısı',
  'platform.opSketchfabSearch': 'Sketchfab araması',
  'platform.opDownloadModel': 'Model indirme',
};
