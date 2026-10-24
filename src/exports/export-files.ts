import { resolve } from "node:path";

export const exportsDirectory = resolve(process.cwd(), "var", "exports");

function validateExportId(exportId: string) {
  if (!/^[1-9]\d*$/.test(exportId)) {
    throw new Error(`Некорректный export ID: ${exportId}`);
  }
}

export function getExportFileLocation(exportId: string) {
  validateExportId(exportId);

  const fileKey = `applications-${exportId}.csv`;

  return {
    fileKey,
    absolutePath: resolve(exportsDirectory, fileKey),
  };
}

export function getTemporaryExportPath(exportId: string, token: string) {
  validateExportId(exportId);

  return resolve(exportsDirectory, `applications-${exportId}-${token}.tmp`);
}

export function resolveStoredExportPath(exportId: string, storedPath: string) {
  const { fileKey, absolutePath } = getExportFileLocation(exportId);

  // Windows-разделители превращаем в обычные "/".
  const normalizedStoredPath = storedPath.replaceAll("\\", "/");

  const isCurrentFileKey = storedPath === fileKey;

  const isLegacyAbsolutePath = normalizedStoredPath.endsWith(
    `/var/exports/${fileKey}`,
  );

  if (!isCurrentFileKey && !isLegacyAbsolutePath) {
    throw new Error(`Неизвестный формат пути экспорта ${exportId}`);
  }

  return absolutePath;
}
