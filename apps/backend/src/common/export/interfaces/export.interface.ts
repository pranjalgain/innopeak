// ─── CSV Export Options ─────────────────────────────────────────────────────

export interface CsvExportOptions {
  /** Specific columns to include (in order). Defaults to all keys from the first row. */
  columns?: string[];
  /** Map of column key -> display header name. */
  headers?: Record<string, string>;
  /** Field delimiter. Defaults to comma (,). */
  delimiter?: string;
  /** Whether to include a header row. Defaults to true. */
  includeHeaders?: boolean;
}

// ─── PDF Export Options ─────────────────────────────────────────────────────

export interface PdfExportOptions {
  /** Report title rendered at the top of the first page. */
  title?: string;
  /** Subtitle rendered below the title. */
  subtitle?: string;
  /** Page orientation. Defaults to 'portrait'. */
  orientation?: 'landscape' | 'portrait';
  /** Page size. Defaults to 'A4'. */
  pageSize?: 'A4' | 'Letter';
  /** Specific columns to include (in order). Defaults to all keys from the first row. */
  columns?: string[];
  /** Map of column key -> display header name. */
  headers?: Record<string, string>;
}

// ─── Excel Export Options ───────────────────────────────────────────────────

export interface ExcelExportOptions {
  /** Sheet name. Defaults to 'Sheet1'. */
  sheetName?: string;
  /** Specific columns to include (in order). Defaults to all keys from the first row. */
  columns?: string[];
  /** Map of column key -> display header name. */
  headers?: Record<string, string>;
}

// ─── Export Data (used for PDF) ─────────────────────────────────────────────

export interface ExportData {
  /** Array of row objects to export. */
  rows: Record<string, unknown>[];
  /** Specific columns to include (in order). Defaults to all keys from the first row. */
  columns?: string[];
  /** Map of column key -> display header name. */
  headers?: Record<string, string>;
}
