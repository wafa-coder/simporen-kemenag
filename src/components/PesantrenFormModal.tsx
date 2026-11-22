import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { calculateCompleteness, computeIjopStatus, isSafeHttpsUrl, makeSafeDocId } from '../lib/domain';
import { savePesantrenBundle, type SavePesantrenPayload } from '../lib/firestoreService';
import { db } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  KECAMATAN_OPTIONS,
  type BangunanKelayakan,
  type DataPeriodik,
  type Legalitas,
  type LegalitasHistory,
  type Pesantren,
  type PesantrenTipe,
  type StatusKeaktifan,
  type TanahStatus,
  type UserProfile,
} from '../types';

interface PesantrenFormModalProps {
  open: boolean;
  user: UserProfile;
  pesantren: Pesantren | null;
  legalitas: Legalitas | null;
  legalitasHistory: LegalitasHistory[];
  periodik: DataPeriodik | null;
  activePeriode: string;
  onClose: () => void;
  onSaved: (message: string) => void;
  onLocalSave?: (payload: SavePesantrenPayload) => void;
}

type FormTab = 'profil' | 'legalitas' | 'santri' | 'pendidik' | 'sarpras';

const inputClass =
  'w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-emerald-400/70 focus:outline-none disabled:opacity-60';

export function PesantrenFormModal({
  open,
  user,
  pesantren,
  legalitas,
  legalitasHistory,
  periodik,
  activePeriode,
  onClose,
  onSaved,
  onLocalSave,
}: PesantrenFormModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<FormTab>('profil');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Profil
  const [nama, setNama] = useState('');
  const [nspp, setNspp] = useState('');
  const [alamat, setAlamat] = useState('');
  const [kecamatan, setKecamatan] = useState<string>(KECAMATAN_OPTIONS[0]);
  const [desa, setDesa] = useState('');
  const [telepon, setTelepon] = useState('');
  const [email, setEmail] = useState('');
  const [namaPimpinan, setNamaPimpinan] = useState('');
  const [tahunBerdiri, setTahunBerdiri] = useState(2000);
  const [tipe, setTipe] = useState<PesantrenTipe>('Kombinasi');
  const [statusKeaktifan, setStatusKeaktifan] = useState<StatusKeaktifan>('aktif');
  const [lat, setLat] = useState(-8.066);
  const [lng, setLng] = useState(111.901);

  // Legalitas
  const [nomorIjop, setNomorIjop] = useState('');
  const [tanggalTerbit, setTanggalTerbit] = useState('');
  const [tanggalBerakhir, setTanggalBerakhir] = useState('');
  const [dokumenUrl, setDokumenUrl] = useState('');
  const [dokumenNama, setDokumenNama] = useState('');
  const [legalitasCatatan, setLegalitasCatatan] = useState('');

  // Santri
  const [santriLaki, setSantriLaki] = useState(0);
  const [santriPerempuan, setSantriPerempuan] = useState(0);
  const [santriMukim, setSantriMukim] = useState(0);
  const [santriNonMukim, setSantriNonMukim] = useState(0);
  const [santriLokal, setSantriLokal] = useState(0);
  const [santriLuarKabupaten, setSantriLuarKabupaten] = useState(0);

  // Pendidik
  const [ustadzCount, setUstadzCount] = useState(0);
  const [ustadzahCount, setUstadzahCount] = useState(0);
  const [pendidikS1KeAtas, setPendidikS1KeAtas] = useState(0);
  const [pendidikTetap, setPendidikTetap] = useState(0);
  const [pendidikTidakTetap, setPendidikTidakTetap] = useState(0);

  // Sarpras
  const [luasTanahM2, setLuasTanahM2] = useState(0);
  const [luasBangunanM2, setLuasBangunanM2] = useState(0);
  const [jumlahAsrama, setJumlahAsrama] = useState(0);
  const [jumlahRuangBelajar, setJumlahRuangBelajar] = useState(0);
  const [jumlahMushola, setJumlahMushola] = useState(0);
  const [jumlahToilet, setJumlahToilet] = useState(0);
  const [statusTanah, setStatusTanah] = useState<TanahStatus>('Wakaf');
  const [kelayakanBangunan, setKelayakanBangunan] = useState<BangunanKelayakan>('Layak');

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setTab('profil');
      setErrorMsg('');
      setNama(pesantren?.nama || '');
      setNspp(pesantren?.nspp || '');
      setAlamat(pesantren?.alamat || '');
      setKecamatan(pesantren?.kecamatan || KECAMATAN_OPTIONS[0]);
      setDesa(pesantren?.desa || '');
      setTelepon(pesantren?.telepon || '');
      setEmail(pesantren?.email || '');
      setNamaPimpinan(pesantren?.namaPimpinan || '');
      setTahunBerdiri(pesantren?.tahunBerdiri || 2000);
      setTipe(pesantren?.tipe || 'Kombinasi');
      setStatusKeaktifan(pesantren?.statusKeaktifan || 'aktif');
      setLat(pesantren?.lat ?? -8.066);
      setLng(pesantren?.lng ?? 111.901);

      setNomorIjop(legalitas?.nomorIjop || '');
      setTanggalTerbit(legalitas?.tanggalTerbit || '');
      setTanggalBerakhir(legalitas?.tanggalBerakhir || '');
      setDokumenUrl(legalitas?.dokumenUrl || '');
      setDokumenNama(legalitas?.dokumenNama || '');
      setLegalitasCatatan(legalitas?.catatan || '');

      setSantriLaki(periodik?.santriLaki ?? 0);
      setSantriPerempuan(periodik?.santriPerempuan ?? 0);
      setSantriMukim(periodik?.santriMukim ?? 0);
      setSantriNonMukim(periodik?.santriNonMukim ?? 0);
      setSantriLokal(periodik?.santriLokal ?? 0);
      setSantriLuarKabupaten(periodik?.santriLuarKabupaten ?? 0);

      setUstadzCount(periodik?.ustadzCount ?? 0);
      setUstadzahCount(periodik?.ustadzahCount ?? 0);
      setPendidikS1KeAtas(periodik?.pendidikS1KeAtas ?? 0);
      setPendidikTetap(periodik?.pendidikTetap ?? 0);
      setPendidikTidakTetap(periodik?.pendidikTidakTetap ?? 0);

      setLuasTanahM2(periodik?.luasTanahM2 ?? 0);
      setLuasBangunanM2(periodik?.luasBangunanM2 ?? 0);
      setJumlahAsrama(periodik?.jumlahAsrama ?? 0);
      setJumlahRuangBelajar(periodik?.jumlahRuangBelajar ?? 0);
      setJumlahMushola(periodik?.jumlahMushola ?? 0);
      setJumlahToilet(periodik?.jumlahToilet ?? 0);
      setStatusTanah(periodik?.statusTanah || 'Wakaf');
      setKelayakanBangunan(periodik?.kelayakanBangunan || 'Layak');

      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open, pesantren, legalitas, periodik]);

  const progress = calculateCompleteness(
    { nama, alamat, kecamatan, desa, namaPimpinan },
    { nomorIjop, tanggalBerakhir },
    {
      santriLaki,
      santriPerempuan,
      ustadzCount,
      ustadzahCount,
      luasTanahM2,
      jumlahRuangBelajar,
    },
  );

  const isLockedForOperator =
    user.role === 'operator' &&
    pesantren !== null &&
    pesantren.verificationStatus !== 'draft' &&
    pesantren.verificationStatus !== 'ditolak';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (nama.trim().length < 3 || alamat.trim().length < 5 || namaPimpinan.trim().length < 2 || desa.trim().length < 2) {
      setErrorMsg('Lengkapi field wajib pada Profil Pokok (Nama, Alamat, Desa, dan Pimpinan).');
      setTab('profil');
      return;
    }

    if (!isSafeHttpsUrl(dokumenUrl)) {
      setErrorMsg('Tautan dokumen IJOP harus diawali https:// dan maksimal 500 karakter.');
      setTab('legalitas');
      return;
    }

    if (nomorIjop.trim() && (!tanggalTerbit || !tanggalBerakhir)) {
      setErrorMsg('Tanggal terbit dan tanggal berakhir wajib diisi bila nomor IJOP dicantumkan.');
      setTab('legalitas');
      return;
    }

    setSaving(true);
    try {
      const pesantrenId = pesantren?.id || makeSafeDocId('ps', `${nama}_${Date.now()}`);
      const bundlePayload: SavePesantrenPayload = {
        pesantrenId,
        isNew: !pesantren,
        existing: pesantren,
        nama,
        nspp,
        alamat,
        kecamatan,
        desa,
        telepon,
        email,
        namaPimpinan,
        tahunBerdiri,
        tipe,
        statusKeaktifan,
        lat,
        lng,
        nomorIjop,
        tanggalTerbit,
        tanggalBerakhir,
        dokumenUrl,
        dokumenNama,
        legalitasCatatan,
        hasExistingLegalitas: Boolean(legalitas),
        tahunAjaran: activePeriode,
        hasExistingPeriodik: Boolean(periodik),
        santriLaki,
        santriPerempuan,
        santriMukim,
        santriNonMukim,
        santriLokal,
        santriLuarKabupaten,
        ustadzCount,
        ustadzahCount,
        pendidikS1KeAtas,
        pendidikTetap,
        pendidikTidakTetap,
        luasTanahM2,
        luasBangunanM2,
        jumlahAsrama,
        jumlahRuangBelajar,
        jumlahMushola,
        jumlahToilet,
        statusTanah,
        kelayakanBangunan,
      };
      if (onLocalSave) {
        onLocalSave(bundlePayload);
      } else {
        await savePesantrenBundle(db, user, bundlePayload);
      }
      onSaved(pesantren ? `Data ${nama.trim()} berhasil disimpan.` : `Pesantren ${nama.trim()} berhasil ditambahkan.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data.');
    } finally {
      setSaving(false);
    }
  };

  const ijopStatusLive = nomorIjop.trim() ? computeIjopStatus(tanggalBerakhir) : 'belum_ada';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="pesantren-form-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-full max-w-3xl rounded-2xl border border-white/[0.12] bg-gradient-to-b from-[#171920] to-[#111217] p-0 text-[#FAFAFA] shadow-2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[88vh]">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-4">
          <div>
            <p className="text-xs text-[#A1A1AA] font-medium font-mono-num">
              Periode Data: {activePeriode} · Kelengkapan {progress.percent}%
            </p>
            <h2 id="pesantren-form-title" className="text-lg font-semibold mt-0.5 text-[#FAFAFA]">
              {pesantren ? `Kelola Data: ${pesantren.nama}` : 'Tambah Pondok Pesantren Baru'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Tutup formulir"
            onClick={onClose}
            className="p-1.5 text-[#A1A1AA] hover:text-white rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-2.5 bg-[#0D0E12] border-b border-white/[0.08] flex items-center justify-between gap-4 text-xs">
          <div className="flex-1 h-1.5 bg-white/[0.1] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-200"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="text-[#A1A1AA] whitespace-nowrap shrink-0">
            {progress.missingSections.length === 0
              ? 'Semua bagian terisi'
              : `Belum lengkap: ${progress.missingSections.join(', ')}`}
          </span>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-white/[0.08] overflow-x-auto">
          {(
            [
              ['profil', '1. Profil Pokok'],
              ['legalitas', '2. Legalitas / IJOP'],
              ['santri', '3. Data Santri'],
              ['pendidik', '4. Tenaga Pendidik'],
              ['sarpras', '5. Sarpras'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                tab === key
                  ? 'border-emerald-400 text-emerald-400 font-semibold'
                  : 'border-transparent text-[#A1A1AA] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm">
          {isLockedForOperator && (
            <div className="p-3 rounded-xl bg-white/[0.05] border border-white/[0.14] text-[#E4E4E7] text-xs">
              Data sedang berstatus <strong className="text-white">{pesantren?.verificationStatus}</strong> dan terkunci dari penyuntingan operator hingga Kemenag menyetujui atau meminta revisi.
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="p-3 rounded-xl bg-white/[0.08] border border-white/[0.3] text-white text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {tab === 'profil' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="f-nama" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                  Nama Pondok Pesantren <span className="text-white font-semibold">*</span>
                </label>
                <input
                  id="f-nama"
                  required
                  minLength={3}
                  maxLength={BLUEPRINT_LIMITS.MAX_NAME}
                  disabled={isLockedForOperator}
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  className={`field-input ${inputClass}`}
                />
                <p className="field-error mt-1 text-xs text-white font-medium">Minimal 3 karakter.</p>
              </div>
              <div>
                <label htmlFor="f-nspp" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                  NSPP (Nomor Statistik Pondok Pesantren)
                </label>
                <input
                  id="f-nspp"
                  maxLength={BLUEPRINT_LIMITS.MAX_NSPP}
                  disabled={isLockedForOperator}
                  value={nspp}
                  onChange={(e) => setNspp(e.target.value)}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label htmlFor="f-pimpinan" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                  Nama Pimpinan / Pengasuh <span className="text-white font-semibold">*</span>
                </label>
                <input
                  id="f-pimpinan"
                  required
                  minLength={2}
                  maxLength={BLUEPRINT_LIMITS.MAX_PIMPINAN}
                  disabled={isLockedForOperator}
                  value={namaPimpinan}
                  onChange={(e) => setNamaPimpinan(e.target.value)}
                  className={`field-input ${inputClass}`}
                />
                <p className="field-error mt-1 text-xs text-white font-medium">Nama pimpinan wajib diisi.</p>
              </div>
              <div>
                <label htmlFor="f-kecamatan" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                  Kecamatan <span className="text-white font-semibold">*</span>
                </label>
                <select
                  id="f-kecamatan"
                  disabled={isLockedForOperator}
                  value={kecamatan}
                  onChange={(e) => setKecamatan(e.target.value)}
                  className={inputClass}
                >
                  {KECAMATAN_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-desa" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                  Desa / Kelurahan <span className="text-white font-semibold">*</span>
                </label>
                <input
                  id="f-desa"
                  required
                  minLength={2}
                  maxLength={BLUEPRINT_LIMITS.MAX_DESA}
                  disabled={isLockedForOperator}
                  value={desa}
                  onChange={(e) => setDesa(e.target.value)}
                  className={`field-input ${inputClass}`}
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="f-alamat" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                  Alamat Lengkap <span className="text-white font-semibold">*</span>
                </label>
                <input
                  id="f-alamat"
                  required
                  minLength={5}
                  maxLength={BLUEPRINT_LIMITS.MAX_ALAMAT}
                  disabled={isLockedForOperator}
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  className={`field-input ${inputClass}`}
                />
              </div>
              <div>
                <label htmlFor="f-telepon" className="block text-xs font-medium text-[#E4E4E7] mb-1">Telepon / WA</label>
                <input
                  id="f-telepon"
                  maxLength={BLUEPRINT_LIMITS.MAX_TELEPON}
                  disabled={isLockedForOperator}
                  value={telepon}
                  onChange={(e) => setTelepon(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="f-email" className="block text-xs font-medium text-[#E4E4E7] mb-1">Email Lembaga</label>
                <input
                  id="f-email"
                  type="email"
                  maxLength={BLUEPRINT_LIMITS.MAX_EMAIL}
                  disabled={isLockedForOperator}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`field-input ${inputClass}`}
                />
              </div>
              <div>
                <label htmlFor="f-tipe" className="block text-xs font-medium text-[#E4E4E7] mb-1">Tipe Pesantren</label>
                <select
                  id="f-tipe"
                  disabled={isLockedForOperator}
                  value={tipe}
                  onChange={(e) => setTipe(e.target.value as PesantrenTipe)}
                  className={inputClass}
                >
                  <option value="Salafiyah">Salafiyah</option>
                  <option value="Khalafiyah/Modern">Khalafiyah/Modern</option>
                  <option value="Kombinasi">Kombinasi</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-tahun" className="block text-xs font-medium text-[#E4E4E7] mb-1">Tahun Berdiri</label>
                  <input
                    id="f-tahun"
                    type="number"
                    min={1800}
                    max={2100}
                    disabled={isLockedForOperator}
                    value={tahunBerdiri}
                    onChange={(e) => setTahunBerdiri(Number(e.target.value))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label htmlFor="f-keaktifan" className="block text-xs font-medium text-[#E4E4E7] mb-1">Keaktifan</label>
                  <select
                    id="f-keaktifan"
                    disabled={isLockedForOperator}
                    value={statusKeaktifan}
                    onChange={(e) => setStatusKeaktifan(e.target.value as StatusKeaktifan)}
                    className={inputClass}
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="f-lat" className="block text-xs font-medium text-[#E4E4E7] mb-1">Koordinat Latitude</label>
                <input
                  id="f-lat"
                  type="number"
                  step="any"
                  disabled={isLockedForOperator}
                  value={lat}
                  onChange={(e) => setLat(Number(e.target.value))}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label htmlFor="f-lng" className="block text-xs font-medium text-[#E4E4E7] mb-1">Koordinat Longitude</label>
                <input
                  id="f-lng"
                  type="number"
                  step="any"
                  disabled={isLockedForOperator}
                  value={lng}
                  onChange={(e) => setLng(Number(e.target.value))}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
            </div>
          )}

          {tab === 'legalitas' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-[#A1A1AA] flex items-center justify-between">
                <span>Status IJOP Terhitung Otomatis:</span>
                <strong className="text-white">{ijopStatusLive.replace('_', ' ')}</strong>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label htmlFor="f-ijop" className="block text-xs font-medium text-[#E4E4E7] mb-1">Nomor SK IJOP</label>
                  <input
                    id="f-ijop"
                    disabled={isLockedForOperator}
                    value={nomorIjop}
                    onChange={(e) => setNomorIjop(e.target.value)}
                    placeholder="Contoh: Kd.13.04/5/PP.00.7/102/2023"
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label htmlFor="f-terbit" className="block text-xs font-medium text-[#E4E4E7] mb-1">Tanggal Terbit</label>
                  <input
                    id="f-terbit"
                    type="date"
                    disabled={isLockedForOperator}
                    value={tanggalTerbit}
                    onChange={(e) => setTanggalTerbit(e.target.value)}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label htmlFor="f-berakhir" className="block text-xs font-medium text-[#E4E4E7] mb-1">Tanggal Berakhir</label>
                  <input
                    id="f-berakhir"
                    type="date"
                    disabled={isLockedForOperator}
                    value={tanggalBerakhir}
                    onChange={(e) => setTanggalBerakhir(e.target.value)}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label htmlFor="f-dok-nama" className="block text-xs font-medium text-[#E4E4E7] mb-1">Nama File SK / Dokumen</label>
                  <input
                    id="f-dok-nama"
                    disabled={isLockedForOperator}
                    value={dokumenNama}
                    onChange={(e) => setDokumenNama(e.target.value)}
                    placeholder="SK_IJOP_2023.pdf"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="f-dok-url" className="block text-xs font-medium text-[#E4E4E7] mb-1">Tautan Arsip Dokumen (HTTPS)</label>
                  <input
                    id="f-dok-url"
                    type="url"
                    pattern="https://.*"
                    disabled={isLockedForOperator}
                    value={dokumenUrl}
                    onChange={(e) => setDokumenUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className={`field-input ${inputClass}`}
                  />
                  <p className="field-error mt-1 text-xs text-white font-medium">Gunakan URL HTTPS yang valid.</p>
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="f-ijop-catatan" className="block text-xs font-medium text-[#E4E4E7] mb-1">Catatan Legalitas</label>
                  <textarea
                    id="f-ijop-catatan"
                    rows={2}
                    disabled={isLockedForOperator}
                    value={legalitasCatatan}
                    onChange={(e) => setLegalitasCatatan(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {legalitasHistory.length > 0 && (
                <div className="border-t border-white/[0.08] pt-3">
                  <p className="text-xs font-medium text-[#A1A1AA] mb-2">Riwayat Perubahan Legalitas</p>
                  <ul className="space-y-1.5 text-xs text-[#A1A1AA]">
                    {legalitasHistory.slice(0, 5).map((h) => (
                      <li key={h.id} className="flex items-center justify-between py-1 border-b border-white/[0.06]">
                        <span className="font-mono-num text-[#E4E4E7]">{h.nomorIjop} ({h.tanggalBerakhir})</span>
                        <span>{h.changedByEmail || h.statusLegalitas}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'santri' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  ['Santri Laki-Laki', santriLaki, setSantriLaki],
                  ['Santri Perempuan', santriPerempuan, setSantriPerempuan],
                  ['Santri Mukim (Tinggal di Asrama)', santriMukim, setSantriMukim],
                  ['Santri Non-Mukim (Kalong)', santriNonMukim, setSantriNonMukim],
                  ['Asal Lokal Kabupaten', santriLokal, setSantriLokal],
                  ['Asal Luar Kabupaten', santriLuarKabupaten, setSantriLuarKabupaten],
                ] as const
              ).map(([label, val, setter]) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-[#E4E4E7] mb-1">{label}</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isLockedForOperator}
                    value={val}
                    onChange={(e) => setter(Math.max(0, Number(e.target.value)))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              ))}
              <div className="md:col-span-2 p-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs text-[#FAFAFA] flex justify-between">
                <span>Total Santri ({activePeriode})</span>
                <strong className="font-mono-num">{(santriLaki + santriPerempuan).toLocaleString('id-ID')} santri</strong>
              </div>
            </div>
          )}

          {tab === 'pendidik' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  ['Jumlah Ustadz (Laki-Laki)', ustadzCount, setUstadzCount],
                  ['Jumlah Ustadzah (Perempuan)', ustadzahCount, setUstadzahCount],
                  ['Kualifikasi S1 ke Atas', pendidikS1KeAtas, setPendidikS1KeAtas],
                  ['Tenaga Pendidik Tetap', pendidikTetap, setPendidikTetap],
                  ['Tenaga Pendidik Tidak Tetap', pendidikTidakTetap, setPendidikTidakTetap],
                ] as const
              ).map(([label, val, setter]) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-[#E4E4E7] mb-1">{label}</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isLockedForOperator}
                    value={val}
                    onChange={(e) => setter(Math.max(0, Number(e.target.value)))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              ))}
            </div>
          )}

          {tab === 'sarpras' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  ['Luas Tanah (m²)', luasTanahM2, setLuasTanahM2],
                  ['Luas Bangunan (m²)', luasBangunanM2, setLuasBangunanM2],
                  ['Jumlah Asrama / Kamar', jumlahAsrama, setJumlahAsrama],
                  ['Jumlah Ruang Belajar', jumlahRuangBelajar, setJumlahRuangBelajar],
                  ['Jumlah Mushola / Masjid', jumlahMushola, setJumlahMushola],
                  ['Jumlah Toilet / Sanitasi', jumlahToilet, setJumlahToilet],
                ] as const
              ).map(([label, val, setter]) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-[#E4E4E7] mb-1">{label}</label>
                  <input
                    type="number"
                    min={0}
                    disabled={isLockedForOperator}
                    value={val}
                    onChange={(e) => setter(Math.max(0, Number(e.target.value)))}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-[#E4E4E7] mb-1">Status Kepemilikan Tanah</label>
                <select
                  disabled={isLockedForOperator}
                  value={statusTanah}
                  onChange={(e) => setStatusTanah(e.target.value as TanahStatus)}
                  className={inputClass}
                >
                  <option value="Wakaf">Wakaf</option>
                  <option value="Milik Yayasan">Milik Yayasan</option>
                  <option value="Sewa/Pinjam">Sewa/Pinjam</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#E4E4E7] mb-1">Kelayakan Bangunan</label>
                <select
                  disabled={isLockedForOperator}
                  value={kelayakanBangunan}
                  onChange={(e) => setKelayakanBangunan(e.target.value as BangunanKelayakan)}
                  className={inputClass}
                >
                  <option value="Layak">Layak</option>
                  <option value="Perlu Perbaikan Ringan">Perlu Perbaikan Ringan</option>
                  <option value="Perlu Renovasi Berat">Perlu Renovasi Berat</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] px-6 py-4 bg-[#0D0E12]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#E4E4E7] bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.12] rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            Tutup
          </button>
          {!isLockedForOperator && (
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {saving ? 'Menyimpan...' : 'Simpan Data'}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
