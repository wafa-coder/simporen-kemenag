import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/browser';
import type { DataPeriodik, Legalitas, Pesantren } from '../types';
import { IJOP_LABELS, STATUS_LABELS, sanitizeSpreadsheetCell } from './domain';

export interface ExportRow {
  pesantren: Pesantren;
  legalitas?: Legalitas | null;
  periodik?: DataPeriodik | null;
}

function makeSafeFilenamePart(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
}

export async function exportPesantrenExcel(
  rows: ExportRow[],
  kabupatenNama: string,
  periodeLabel: string,
): Promise<void> {
  const headers = [
    'No',
    'Nama_Pesantren',
    'NSPP',
    'Tipe',
    'Kecamatan',
    'Desa',
    'Pimpinan',
    'Status_Keaktifan',
    'Status_Verifikasi',
    'Nomor_IJOP',
    'Status_IJOP',
    'Berakhir_IJOP',
    'Santri_Laki',
    'Santri_Perempuan',
    'Total_Santri',
    'Santri_Mukim',
    'Total_Pendidik',
    'Ruang_Belajar',
    'Kelayakan_Bangunan',
  ];

  const headerRow: Row = headers.map((title) => ({
    value: title,
    type: String,
    fontWeight: 'bold',
  }));

  const dataRows: Row[] = rows.map(({ pesantren, legalitas, periodik }, idx) => [
    { type: Number, value: idx + 1 },
    { type: String, value: String(sanitizeSpreadsheetCell(pesantren.nama)) },
    { type: String, value: String(sanitizeSpreadsheetCell(pesantren.nspp || '-')) },
    { type: String, value: String(sanitizeSpreadsheetCell(pesantren.tipe)) },
    { type: String, value: String(sanitizeSpreadsheetCell(pesantren.kecamatan)) },
    { type: String, value: String(sanitizeSpreadsheetCell(pesantren.desa)) },
    { type: String, value: String(sanitizeSpreadsheetCell(pesantren.namaPimpinan)) },
    { type: String, value: String(sanitizeSpreadsheetCell(pesantren.statusKeaktifan)) },
    { type: String, value: String(sanitizeSpreadsheetCell(STATUS_LABELS[pesantren.verificationStatus])) },
    { type: String, value: String(sanitizeSpreadsheetCell(legalitas?.nomorIjop || '-')) },
    { type: String, value: String(sanitizeSpreadsheetCell(IJOP_LABELS[pesantren.ijopStatusSummary])) },
    {
      type: String,
      value: String(sanitizeSpreadsheetCell(legalitas?.tanggalBerakhir || pesantren.ijopExpiredAt || '-')),
    },
    { type: Number, value: Number(periodik?.santriLaki ?? 0) },
    { type: Number, value: Number(periodik?.santriPerempuan ?? 0) },
    {
      type: Number,
      value: Number(
        periodik ? periodik.santriLaki + periodik.santriPerempuan : pesantren.totalSantriLatest,
      ),
    },
    { type: Number, value: Number(periodik?.santriMukim ?? 0) },
    {
      type: Number,
      value: Number(
        periodik ? periodik.ustadzCount + periodik.ustadzahCount : pesantren.totalPendidikLatest,
      ),
    },
    { type: Number, value: Number(periodik?.jumlahRuangBelajar ?? 0) },
    { type: String, value: String(sanitizeSpreadsheetCell(periodik?.kelayakanBangunan || '-')) },
  ]);

  const sheetData: SheetData = [headerRow, ...dataRows];
  const safeKab = makeSafeFilenamePart(kabupatenNama);
  const safeSlug = makeSafeFilenamePart(periodeLabel);
  await writeXlsxFile(sheetData, { sheet: 'Rekap Pesantren' }).toFile(
    `Rekap_Pesantren_${safeKab}_${safeSlug}.xlsx`,
  );
}

export function exportPesantrenPdf(
  rows: ExportRow[],
  kabupatenNama: string,
  periodeLabel: string,
  kecamatanFilter: string,
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(13);
  doc.text(`KEMENTERIAN AGAMA — ${kabupatenNama.toUpperCase()}`, 14, 14);
  doc.setFontSize(10);
  doc.text(
    `Laporan Rekapitulasi Pondok Pesantren · Periode: ${periodeLabel}${kecamatanFilter !== 'ALL' ? ` · ${kecamatanFilter}` : ''}`,
    14,
    20,
  );

  const totalSantri = rows.reduce(
    (sum, r) =>
      sum + (r.periodik ? r.periodik.santriLaki + r.periodik.santriPerempuan : r.pesantren.totalSantriLatest),
    0,
  );
  const totalPendidik = rows.reduce(
    (sum, r) =>
      sum + (r.periodik ? r.periodik.ustadzCount + r.periodik.ustadzahCount : r.pesantren.totalPendidikLatest),
    0,
  );

  doc.setFontSize(9);
  doc.text(
    `Total Lembaga: ${rows.length} · Total Santri: ${totalSantri.toLocaleString('id-ID')} · Total Pendidik: ${totalPendidik.toLocaleString('id-ID')}`,
    14,
    26,
  );

  autoTable(doc, {
    startY: 30,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [24, 24, 27] },
    head: [
      ['No', 'Nama Pesantren', 'NSPP', 'Kecamatan', 'Tipe', 'Status', 'IJOP', 'Santri', 'Pendidik', 'Sarpras'],
    ],
    body: rows.map(({ pesantren, legalitas, periodik }, idx) => [
      idx + 1,
      pesantren.nama,
      pesantren.nspp || '-',
      pesantren.kecamatan,
      pesantren.tipe,
      STATUS_LABELS[pesantren.verificationStatus],
      legalitas?.nomorIjop ? `${legalitas.nomorIjop} (${IJOP_LABELS[pesantren.ijopStatusSummary]})` : IJOP_LABELS[pesantren.ijopStatusSummary],
      periodik ? periodik.santriLaki + periodik.santriPerempuan : pesantren.totalSantriLatest,
      periodik ? periodik.ustadzCount + periodik.ustadzahCount : pesantren.totalPendidikLatest,
      periodik ? `${periodik.jumlahRuangBelajar} R.Belajar` : '-',
    ]),
  });

  const safeKab = makeSafeFilenamePart(kabupatenNama);
  const safeSlug = makeSafeFilenamePart(periodeLabel);
  doc.save(`Laporan_Pesantren_${safeKab}_${safeSlug}.pdf`);
}
