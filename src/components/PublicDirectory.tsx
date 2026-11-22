import { MapPin, Search, X, Building2, Users, BookOpen, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IJOP_LABELS } from '../lib/domain';
import { useDialogLightDismiss } from '../lib/useDialogLightDismiss';
import { KECAMATAN_OPTIONS, type PublicPesantren, type SystemConfig } from '../types';
import { PesantrenMap } from './PesantrenMap';
import { PWAInstallButton } from './PWAInstallButton';

interface PublicDirectoryProps {
  items: PublicPesantren[];
  loading: boolean;
  config: SystemConfig | null;
  onLoginClick: () => void;
  signingIn: boolean;
}

type PublicTab = 'direktori' | 'peta' | 'rekap' | 'ketentuan';

function buildSparklinePath(values: number[], width = 84, height = 28): string {
  if (values.length === 0) {
    return `M 2 ${height - 6} L ${width - 2} ${height - 6}`;
  }
  if (values.length === 1) {
    return `M 2 ${Math.round(height * 0.5)} L ${width - 2} ${Math.round(height * 0.5)}`;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const stepX = (width - 8) / (values.length - 1);

  return values
    .map((v, idx) => {
      const x = 4 + idx * stepX;
      const y = height - 4 - ((v - min) / span) * (height - 10);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function PublicDirectory({
  items,
  loading,
  config,
  onLoginClick,
  signingIn,
}: PublicDirectoryProps) {
  const [activeTab, setActiveTab] = useState<PublicTab>('direktori');
  const [searchTerm, setSearchTerm] = useState('');
  const [kecamatan, setKecamatan] = useState('ALL');
  const [tipe, setTipe] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailDialogRef = useRef<HTMLDialogElement>(null);

  const directoryEnabled = config?.publicDirectoryEnabled ?? true;
  const rawKabupaten = config?.kabupatenNama?.trim();
  const kabupatenNama = !rawKabupaten || rawKabupaten === 'Kabupaten' ? 'Kab. Wonosobo' : rawKabupaten;

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      if (kecamatan !== 'ALL' && item.kecamatan !== kecamatan) return false;
      if (tipe !== 'ALL' && item.tipe !== tipe) return false;
      if (!q) return true;
      return (
        item.nama.toLowerCase().includes(q) ||
        item.desa.toLowerCase().includes(q) ||
        (item.nspp || '').toLowerCase().includes(q) ||
        item.namaPimpinan.toLowerCase().includes(q)
      );
    });
  }, [items, searchTerm, kecamatan, tipe]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId],
  );

  useEffect(() => {
    const dlg = detailDialogRef.current;
    if (!dlg) return;
    if (selectedItem && !dlg.open) {
      dlg.showModal();
    } else if (!selectedItem && dlg.open) {
      dlg.close();
    }
  }, [selectedItem]);

  useDialogLightDismiss(detailDialogRef, () => setSelectedId(null), Boolean(selectedItem));

  const stats = useMemo(() => {
    const totalSantri = items.reduce((acc, p) => acc + p.totalSantriLatest, 0);
    const totalPendidik = items.reduce((acc, p) => acc + p.totalPendidikLatest, 0);
    const coveredKec = new Set(items.map((p) => p.kecamatan)).size;
    const activeIjopCount = items.filter((p) => p.ijopStatusSummary === 'aktif').length;
    const ijopActivePct = items.length > 0 ? Math.round((activeIjopCount / items.length) * 100) : 0;
    const santriPerPendidik = totalPendidik > 0 ? Math.round(totalSantri / totalPendidik) : 0;
    const coveragePct = Math.round((coveredKec / KECAMATAN_OPTIONS.length) * 100);
    return {
      totalLembaga: items.length,
      totalSantri,
      totalPendidik,
      coveredKec,
      ijopActivePct,
      santriPerPendidik,
      coveragePct,
    };
  }, [items]);

  const kecamatanSummary = useMemo(() => {
    const counts = new Map<string, { lembaga: number; santri: number }>();
    for (const item of items) {
      const prev = counts.get(item.kecamatan) || { lembaga: 0, santri: 0 };
      counts.set(item.kecamatan, {
        lembaga: prev.lembaga + 1,
        santri: prev.santri + item.totalSantriLatest,
      });
    }
    return Array.from(counts.entries()).sort((a, b) => b[1].lembaga - a[1].lembaga);
  }, [items]);

  const sparklinePath = useMemo(() => {
    const series = kecamatanSummary.map(([, d]) => d.lembaga);
    return buildSparklinePath(series);
  }, [kecamatanSummary]);

  const ringRadius = 15;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - stats.ijopActivePct / 100);

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-[#FAFAFA] bg-[radial-gradient(ellipse_75%_40%_at_50%_-12%,rgba(16,185,129,0.12),transparent)]">
      {/* Strict 3-Zone Top Bar Contract with scroll-state sticky shell */}
      <header className="sticky-header-shell">
        <div className="sticky-header-bar">
          <div className="mx-auto max-w-[1440px] px-6 sm:px-8 h-18 flex items-center justify-between gap-8">
          <a
            href="/"
            className="font-display text-lg font-semibold tracking-[-0.005em] text-[#FAFAFA] whitespace-nowrap shrink-0"
          >
            SimPoren Kemenag
          </a>

          <nav aria-label="Navigasi Utama" className="hidden md:flex items-center gap-6 text-sm font-medium text-[#A1A1AA]">
            <button
              type="button"
              onClick={() => setActiveTab('direktori')}
              className={`transition-colors whitespace-nowrap shrink-0 pb-1 border-b-2 ${
                activeTab === 'direktori'
                  ? 'border-emerald-400 text-white font-semibold'
                  : 'border-transparent hover:text-white'
              }`}
            >
              Direktori Lembaga
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('peta')}
              className={`transition-colors whitespace-nowrap shrink-0 pb-1 border-b-2 ${
                activeTab === 'peta'
                  ? 'border-emerald-400 text-white font-semibold'
                  : 'border-transparent hover:text-white'
              }`}
            >
              Peta Sebaran
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rekap')}
              className={`transition-colors whitespace-nowrap shrink-0 pb-1 border-b-2 ${
                activeTab === 'rekap'
                  ? 'border-emerald-400 text-white font-semibold'
                  : 'border-transparent hover:text-white'
              }`}
            >
              Rekapitulasi Wilayah
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ketentuan')}
              className={`transition-colors whitespace-nowrap shrink-0 pb-1 border-b-2 ${
                activeTab === 'ketentuan'
                  ? 'border-emerald-400 text-white font-semibold'
                  : 'border-transparent hover:text-white'
              }`}
            >
              Ketentuan &amp; Legalitas
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              disabled={signingIn}
              onClick={onLoginClick}
              className="px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {signingIn ? 'Membuka Masuk...' : 'Masuk Portal'}
            </button>
          </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-6 sm:px-8 py-12 space-y-12">
        {/* Editorial Hero Section */}
        <section className="max-w-4xl space-y-5">
          <p className="text-xs sm:text-sm font-medium tracking-wide text-emerald-400">
            Kementerian Agama Republik Indonesia {kabupatenNama}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#FAFAFA] leading-[1.12] text-wrap balance">
            Direktori &amp; Pendataan Resmi Pondok Pesantren Terverifikasi
          </h1>
          <p className="text-lg text-[#A1A1AA] leading-relaxed max-w-2xl font-normal">
            Pusat informasi dan pendataan terpadu lembaga pendidikan Islam {kabupatenNama}. Memastikan validitas profil kelembagaan, status izin operasional (IJOP), dan statistik santri secara transparan.
          </p>
        </section>

        {/* Dark Monochrome + Emerald Stats Strip */}
        <section aria-label="Ringkasan statistik" className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-6">
          <div className="bg-gradient-to-br from-[#171920] via-[#121619] to-[#0E1A16] border border-emerald-500/20 rounded-2xl p-4 sm:p-6 hover:border-emerald-400/35 transition-colors flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 text-[#A1A1AA]">
              <span className="text-xs font-medium">Lembaga Aktif</span>
              <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-3xl font-bold font-mono-num text-[#FAFAFA] tracking-tight">
                {stats.totalLembaga.toLocaleString('id-ID')}
              </p>
              {stats.totalLembaga > 0 && (
                <svg width="84" height="28" viewBox="0 0 84 28" aria-hidden="true" className="hidden sm:block shrink-0 opacity-95">
                  <path
                    d={sparklinePath}
                    fill="none"
                    stroke="#34D399"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <p className="mt-1.5 text-xs text-[#71717A]">Terverifikasi Kemenag</p>
          </div>

          <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-6 hover:border-emerald-500/25 transition-colors flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 text-[#A1A1AA]">
              <span className="text-xs font-medium">Total Santri</span>
              <Users className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-3xl font-bold font-mono-num text-[#FAFAFA] tracking-tight">
                {stats.totalSantri.toLocaleString('id-ID')}
              </p>
              {stats.totalLembaga > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 shrink-0" title="Persentase lembaga dengan IJOP aktif">
                  <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" className="-rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r={ringRadius}
                      fill="none"
                      stroke="rgba(16,185,129,0.18)"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r={ringRadius}
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringDashOffset}
                    />
                  </svg>
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs text-[#71717A]">
              {stats.totalLembaga > 0
                ? `${stats.ijopActivePct}% IJOP Aktif`
                : 'Mukim & Non-Mukim'}
            </p>
          </div>

          <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-6 hover:border-emerald-500/25 transition-colors flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 text-[#A1A1AA]">
              <span className="text-xs font-medium">Tenaga Pendidik</span>
              <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-3xl font-bold font-mono-num text-[#FAFAFA] tracking-tight">
                {stats.totalPendidik.toLocaleString('id-ID')}
              </p>
              {stats.santriPerPendidik > 0 && (
                <span className="hidden sm:inline text-xs font-mono-num text-emerald-400 font-semibold">
                  1:{stats.santriPerPendidik}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-[#71717A]">
              {stats.santriPerPendidik > 0
                ? 'Rasio Pendidik : Santri'
                : 'Ustadz & Ustadzah'}
            </p>
          </div>

          <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-6 hover:border-emerald-500/25 transition-colors flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 text-[#A1A1AA]">
              <span className="text-xs font-medium">Wilayah Cakupan</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-3xl font-bold font-mono-num text-[#FAFAFA] tracking-tight">
                  {stats.coveredKec.toLocaleString('id-ID')}
                </p>
                <span className="text-xs font-mono-num text-[#71717A]">
                  / {KECAMATAN_OPTIONS.length} kec
                </span>
              </div>
              <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(stats.coveragePct, 100)}%` }}
                />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-[#71717A]">Kecamatan Terdaftar</p>
          </div>
        </section>

        {!directoryEnabled ? (
          <section className="bg-[#131419] border border-white/[0.08] rounded-2xl p-12 text-center space-y-3">
            <h2 className="text-xl font-semibold text-[#FAFAFA]">Direktori Publik Dinonaktifkan Sementara</h2>
            <p className="text-sm text-[#A1A1AA] max-w-lg mx-auto">
              Akses direktori publik sedang ditutup oleh admin Kemenag Kabupaten. Operator dan admin tetap dapat masuk melalui Portal Pendataan.
            </p>
          </section>
        ) : (
          <div className="space-y-8">
            {/* Tab Navigation Switcher */}
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-4">
              <button
                type="button"
                onClick={() => setActiveTab('direktori')}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'direktori'
                    ? 'bg-emerald-500 text-[#041D13] font-semibold'
                    : 'bg-[#131419] text-[#A1A1AA] hover:bg-white/[0.08] hover:text-white border border-white/[0.08]'
                }`}
              >
                Direktori Lembaga ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('peta')}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'peta'
                    ? 'bg-emerald-500 text-[#041D13] font-semibold'
                    : 'bg-[#131419] text-[#A1A1AA] hover:bg-white/[0.08] hover:text-white border border-white/[0.08]'
                }`}
              >
                Peta Sebaran
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('rekap')}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'rekap'
                    ? 'bg-emerald-500 text-[#041D13] font-semibold'
                    : 'bg-[#131419] text-[#A1A1AA] hover:bg-white/[0.08] hover:text-white border border-white/[0.08]'
                }`}
              >
                Rekapitulasi Kecamatan
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ketentuan')}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'ketentuan'
                    ? 'bg-emerald-500 text-[#041D13] font-semibold'
                    : 'bg-[#131419] text-[#A1A1AA] hover:bg-white/[0.08] hover:text-white border border-white/[0.08]'
                }`}
              >
                Informasi &amp; Legalitas
              </button>
            </div>

            {/* TAB 1: DIREKTORI */}
            {activeTab === 'direktori' && (
              <section className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-br from-[#16181F] to-[#111217] border border-white/[0.08] rounded-2xl p-6">
                  <div>
                    <h2 className="text-xl font-semibold text-[#FAFAFA]">Pencarian &amp; Direktori Pesantren</h2>
                    <p className="text-sm text-[#A1A1AA]">
                      Gunakan filter pencarian berdasarkan nama, NSPP, wilayah kecamatan, atau tipe lembaga.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        aria-label="Cari pesantren"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Cari nama, NSPP, pimpinan..."
                        className="pl-10 pr-4 py-2.5 text-sm bg-[#0D0E12] text-[#FAFAFA] placeholder:text-[#71717A] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none w-64"
                      />
                    </div>
                    <select
                      aria-label="Filter kecamatan"
                      value={kecamatan}
                      onChange={(e) => setKecamatan(e.target.value)}
                      className="px-3.5 py-2.5 text-sm bg-[#0D0E12] text-[#FAFAFA] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none"
                    >
                      <option value="ALL">Semua Kecamatan</option>
                      {KECAMATAN_OPTIONS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter tipe pesantren"
                      value={tipe}
                      onChange={(e) => setTipe(e.target.value)}
                      className="px-3.5 py-2.5 text-sm bg-[#0D0E12] text-[#FAFAFA] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none"
                    >
                      <option value="ALL">Semua Tipe</option>
                      <option value="Salafiyah">Salafiyah</option>
                      <option value="Khalafiyah/Modern">Khalafiyah/Modern</option>
                      <option value="Kombinasi">Kombinasi</option>
                    </select>
                  </div>
                </div>

                {loading ? (
                  <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-8 space-y-4">
                    <div className="h-6 bg-white/[0.06] rounded-lg w-1/3 animate-pulse" />
                    <div className="h-12 bg-white/[0.06] rounded-lg animate-pulse" />
                    <div className="h-12 bg-white/[0.06] rounded-lg animate-pulse" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-12 text-center space-y-4">
                    <p className="text-base font-semibold text-[#FAFAFA]">
                      {items.length === 0
                        ? 'Belum ada data pesantren yang dipublikasikan.'
                        : 'Tidak ada pesantren yang cocok dengan kriteria pencarian.'}
                    </p>
                    <p className="text-sm text-[#A1A1AA] max-w-md mx-auto">
                      {items.length === 0
                        ? 'Admin Kemenag dapat masuk ke portal untuk memuat data contoh atau memasukkan data lembaga baru.'
                        : 'Coba ubah kata kunci pencarian atau reset filter wilayah.'}
                    </p>
                    {items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setKecamatan('ALL');
                          setTipe('ALL');
                        }}
                        className="px-4 py-2 text-sm font-medium text-[#FAFAFA] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] rounded-xl transition-colors"
                      >
                        Reset Filter Pencarian
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-labelledby="dir-table-caption"
                    className="table-region bg-[#131419] border border-white/[0.08] rounded-2xl overflow-hidden"
                  >
                    <table className="w-full text-left text-sm">
                      <caption id="dir-table-caption" className="sr-only">
                        Direktori Pondok Pesantren Terverifikasi
                      </caption>
                      <thead className="bg-[#181A22] text-xs font-semibold text-[#A1A1AA] border-b border-white/[0.08]">
                        <tr>
                          <th className="py-4 px-6">Nama Pesantren &amp; Pimpinan</th>
                          <th className="py-4 px-6">NSPP</th>
                          <th className="py-4 px-6">Wilayah</th>
                          <th className="py-4 px-6">Tipe</th>
                          <th className="py-4 px-6">Status IJOP</th>
                          <th className="py-4 px-6 text-right">Santri</th>
                          <th className="py-4 px-6 text-right">Pendidik</th>
                          <th className="py-4 px-6 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {filtered.map((item) => (
                          <tr key={item.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="py-4 px-6 font-medium text-[#FAFAFA]">
                              <div className="font-semibold">{item.nama}</div>
                              <div className="text-xs font-normal text-[#71717A] mt-0.5">
                                Pengasuh: {item.namaPimpinan}
                              </div>
                            </td>
                            <td className="py-4 px-6 font-mono-num text-xs text-[#A1A1AA]">
                              {item.nspp || '-'}
                            </td>
                            <td className="py-4 px-6 text-[#A1A1AA]">
                              <div className="font-medium text-[#E4E4E7]">{item.kecamatan}</div>
                              <div className="text-xs text-[#71717A]">{item.desa}</div>
                            </td>
                            <td className="py-4 px-6 text-[#A1A1AA]">{item.tipe}</td>
                            <td className="py-4 px-6">
                                <span
                                  className={`inline-flex items-center text-xs ${
                                    item.ijopStatusSummary === 'kedaluwarsa'
                                      ? 'font-semibold text-white underline decoration-white/40 underline-offset-4'
                                      : item.ijopStatusSummary === 'segera_berakhir'
                                        ? 'font-medium text-[#A1A1AA]'
                                        : 'font-semibold text-emerald-400'
                                  }`}
                                >
                                  {IJOP_LABELS[item.ijopStatusSummary]}
                                </span>
                              </td>
                              <td className="py-4 px-6 text-right font-mono-num font-semibold text-[#FAFAFA]">
                                {item.totalSantriLatest.toLocaleString('id-ID')}
                              </td>
                              <td className="py-4 px-6 text-right font-mono-num text-[#E4E4E7]">
                                {item.totalPendidikLatest.toLocaleString('id-ID')}
                              </td>
                              <td className="py-4 px-6 text-right">
                                <button
                                  type="button"
                                  onClick={() => setSelectedId(item.id)}
                                  className="px-3.5 py-1.5 text-xs font-medium text-[#FAFAFA] bg-white/[0.07] hover:bg-emerald-500/20 hover:text-emerald-300 border border-white/[0.1] hover:border-emerald-500/40 rounded-lg transition-colors whitespace-nowrap inline-flex items-center gap-1"
                                >
                                  Detail
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {/* TAB 2: PETA SEBARAN */}
              {activeTab === 'peta' && (
                <section className="bg-[#131419] border border-white/[0.08] rounded-2xl p-6 space-y-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-[#FAFAFA]">Peta Sebaran Geografis Pesantren</h2>
                      <p className="text-sm text-[#A1A1AA]">
                        Visualisasi titik koordinat lembaga di wilayah {kabupatenNama}. Klik penanda untuk melihat ringkasan singkat.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[#A1A1AA]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" aria-hidden="true" /> IJOP Aktif
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-zinc-400" aria-hidden="true" /> Segera Berakhir
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#131419] border-2 border-white" aria-hidden="true" /> Kedaluwarsa
                      </span>
                    </div>
                  </div>
                  <div className="h-[520px] rounded-xl overflow-hidden border border-white/[0.08]">
                    <PesantrenMap
                      items={filtered}
                      selectedId={selectedId}
                      onSelect={(id) => setSelectedId(id)}
                    />
                  </div>
                </section>
              )}

              {/* TAB 3: REKAPITULASI KECAMATAN */}
              {activeTab === 'rekap' && (
                <section className="space-y-6">
                  <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-6">
                    <h2 className="text-xl font-semibold text-[#FAFAFA]">Rekapitulasi Sebaran per Kecamatan</h2>
                    <p className="text-sm text-[#A1A1AA]">
                      Akumulasi jumlah lembaga dan total santri terdaftar di setiap kecamatan.
                    </p>
                  </div>
                  {kecamatanSummary.length === 0 ? (
                    <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-12 text-center">
                      <p className="text-sm text-[#A1A1AA]">Belum ada data rekapitulasi wilayah.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      {kecamatanSummary.map(([kec, data]) => {
                        const maxLembaga = kecamatanSummary[0]?.[1].lembaga || 1;
                        const pct = Math.round((data.lembaga / maxLembaga) * 100);
                        return (
                          <div key={kec} className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-6 space-y-3 hover:border-emerald-500/30 transition-colors">
                            <p className="text-base font-semibold text-[#FAFAFA]">{kec}</p>
                            <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          <div className="flex items-baseline justify-between text-xs text-[#71717A] border-t border-white/[0.06] pt-3">
                            <span>Total Lembaga</span>
                            <span className="font-mono-num font-semibold text-[#FAFAFA] text-sm">{data.lembaga}</span>
                          </div>
                          <div className="flex items-baseline justify-between text-xs text-[#71717A]">
                            <span>Total Santri</span>
                            <span className="font-mono-num font-semibold text-[#FAFAFA] text-sm">{data.santri.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* TAB 4: KETENTUAN & LEGALITAS */}
            {activeTab === 'ketentuan' && (
              <section className="bg-[#131419] border border-white/[0.08] rounded-2xl p-8 space-y-6 max-w-4xl">
                <div>
                  <h2 className="text-xl font-semibold text-[#FAFAFA]">Ketentuan Pendataan &amp; Legalitas IJOP</h2>
                  <p className="text-sm text-[#A1A1AA] mt-1">
                    Informasi resmi mengenai standar operasional prosedur dan verifikasi Kementerian Agama.
                  </p>
                </div>
                <div className="space-y-4 text-sm text-[#A1A1AA] leading-relaxed">
                  <p>
                    Setiap Pondok Pesantren yang beroperasi di wilayah <strong className="text-[#FAFAFA]">{kabupatenNama}</strong> wajib memiliki Izin Operasional (IJOP) yang diterbitkan secara resmi oleh Direktorat Jenderal Pendidikan Islam Kementerian Agama Republik Indonesia.
                  </p>
                  <p>
                    Portal <strong className="text-[#FAFAFA]">SimPoren Kemenag</strong> berfungsi sebagai sistem pendataan terpusat untuk memperbaharui profil kelembagaan, laporan berkala santri dan pendidik, serta pemantauan masa berlaku SK IJOP secara transparan.
                  </p>
                  <div className="bg-[#0D0E12] border border-white/[0.08] rounded-xl p-5 space-y-2">
                    <p className="font-semibold text-[#FAFAFA]">Status Verifikasi Resmi:</p>
                    <p className="text-xs text-[#A1A1AA]">
                      Lembaga yang ditampilkan dalam direktori publik ini telah melalui tahapan verifikasi berkas dan peninjauan lapangan oleh tim verifikator Kemenag Kabupaten.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Quiet Footer */}
        <footer className="border-t border-white/[0.08] pt-8 pb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-[#71717A]">
            <p>
              &copy; 2026 Kementerian Agama Republik Indonesia {kabupatenNama} · Sistem Pendataan Pondok Pesantren.
            </p>
            <div className="flex items-center gap-6">
              <span>Keamanan Data Terenkripsi</span>
              <span aria-hidden="true">·</span>
              <span>Standar Integrasi Kemenag</span>
            </div>
          </div>
        </footer>
      </main>

      {/* Detail Native <dialog> with top-layer transitions & light-dismiss */}
      <dialog
        ref={detailDialogRef}
        aria-labelledby="public-detail-title"
        {...({ closedby: 'any' } as Record<string, string>)}
        onCancel={(e) => {
          e.preventDefault();
          setSelectedId(null);
        }}
        onClose={() => {
          if (selectedId !== null) setSelectedId(null);
        }}
        className="m-auto w-full max-w-lg rounded-2xl border border-white/[0.12] bg-gradient-to-b from-[#171920] to-[#111217] p-8 text-[#FAFAFA] shadow-2xl"
      >
        {selectedItem && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div>
                <p className="text-xs font-medium text-[#A1A1AA] tracking-wide">
                  {selectedItem.tipe} · NSPP {selectedItem.nspp || '-'}
                </p>
                <h2 id="public-detail-title" className="mt-1 text-2xl font-bold tracking-tight text-[#FAFAFA]">
                  {selectedItem.nama}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Tutup detail"
                onClick={() => setSelectedId(null)}
                className="p-2 text-[#A1A1AA] hover:text-white rounded-xl hover:bg-white/[0.08] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-5 text-sm">
              <div>
                <dt className="text-xs text-[#71717A]">Pimpinan / Pengasuh</dt>
                <dd className="mt-1 font-semibold text-[#FAFAFA]">{selectedItem.namaPimpinan}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#71717A]">Tahun Berdiri</dt>
                <dd className="mt-1 font-mono-num font-semibold text-[#FAFAFA]">{selectedItem.tahunBerdiri}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#71717A]">Kecamatan &amp; Desa</dt>
                <dd className="mt-1 font-medium text-[#FAFAFA]">{selectedItem.kecamatan}, {selectedItem.desa}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#71717A]">Status Legalitas IJOP</dt>
                <dd className="mt-1 font-semibold text-[#FAFAFA]">
                  {IJOP_LABELS[selectedItem.ijopStatusSummary]}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#71717A]">Jumlah Santri</dt>
                <dd className="mt-1 font-mono-num font-semibold text-[#FAFAFA]">
                  {selectedItem.totalSantriLatest.toLocaleString('id-ID')} Santri
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#71717A]">Tenaga Pendidik</dt>
                <dd className="mt-1 font-mono-num font-semibold text-[#FAFAFA]">
                  {selectedItem.totalPendidikLatest.toLocaleString('id-ID')} Pendidik
                </dd>
              </div>
            </dl>

            <div className="flex items-start gap-2.5 text-sm text-[#A1A1AA] bg-[#0D0E12] p-4 rounded-xl border border-white/[0.08]">
              <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{selectedItem.alamat}</span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                autoFocus
                onClick={() => setSelectedId(null)}
                className="px-5 py-2.5 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors"
              >
                Tutup Jendela
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
