/**
 * Client-side spreadsheet parsing for split import.
 *
 * Picks a CSV/XLSX file and converts every worksheet into a raw 2D string
 * grid; structure inference happens server-side (/api/splits/import/preview).
 * SheetJS is imported lazily so it stays out of the main bundle.
 */

import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { ImportSheet } from '../types/api.types';

const SPREADSHEET_MIME_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export interface PickedSpreadsheet {
  fileName: string;
  sheets: ImportSheet[];
}

function workbookToSheets(XLSX: typeof import('xlsx'), workbook: import('xlsx').WorkBook): ImportSheet[] {
  return workbook.SheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }).map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
    return { name, grid };
  });
}

/**
 * Open the document picker and parse the chosen file into sheet grids.
 * Returns null when the user cancels.
 */
export async function pickAndParseSpreadsheet(): Promise<PickedSpreadsheet | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: SPREADSHEET_MIME_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) {
    return null;
  }
  const asset = result.assets[0];
  const XLSX = await import('xlsx');

  let workbook: import('xlsx').WorkBook;
  if (Platform.OS === 'web') {
    // On web the picker exposes the underlying File object.
    const file = asset.file;
    if (!file) {
      throw new Error('Could not read the selected file.');
    }
    workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  } else {
    // Native (incl. Android content:// URIs): read via expo-file-system.
    const FileSystem = await import('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
    workbook = XLSX.read(base64, { type: 'base64' });
  }

  const fileName = (asset.name || 'Imported Split').replace(/\.[^.]+$/, '');
  return { fileName, sheets: workbookToSheets(XLSX, workbook) };
}
