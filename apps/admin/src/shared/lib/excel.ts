let excelJsPromise: Promise<typeof import('exceljs')> | undefined;

export function loadExcelJs() {
  excelJsPromise ??= import('exceljs');
  return excelJsPromise;
}
