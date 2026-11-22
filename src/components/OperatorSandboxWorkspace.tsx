import { Building2, FileCheck2, History, LayoutDashboard, LogOut, Menu, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  IJOP_LABELS,
  STATUS_LABELS,
  calculateCompleteness,
  canTransitionVerification,
  computeIjopStatus,
  makeSafeDocId,
} from '../lib/domain';
import type { SavePesantrenPayload } from '../lib/firestoreService';
import { DUMMY_PESANTREN_SEED, buildSeedLegalitasStatus } from '../lib/seedData';
import type {
  DataPeriodik,
  Legalitas,
  LegalitasHistory,
  Pesantren,
  SystemConfig,
  UserProfile,
  VerifikasiLog,
  VerificationStatus,
} from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { PesantrenFormModal } from './PesantrenFormModal';

interface OperatorSandboxWorkspaceProps {
  config: SystemConfig | null;
  onOpenPublicDirectory: () => void;
  onExitSandbox: () => void;
}

type OperatorTab = 'ringkasan' | 'lembaga' | 'legalitas' | 'riwayat';

const SANDBOX_USER: UserProfile = {
  uid: 'sandbox_operator_uji',
  email: 'operator.uji@simulasi.local',
  displayName: 'Operator Uji Simulasi',
  role: 'operator',
  isActive: true,
};

const SANDBOX_IDS = ['ps_darul_hikmah_kota', 'ps_miftahul_uloom_boyolangu'] as const;
const PERIODE_OPTIONS = ['2024/2025', '2025/2026', '2026/2027'];
const PIPELINE_STEPS: { key: VerificationStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'diajukan', label: 'Diajukan' },
  { key: 'diverifikasi', label: 'Diverifikasi' },
  { key: 'disetujui', label: 'Disetujui' },
];

interface SandboxDataset {
  pesantrenList: Pesantren[];
  legalitasMap: Record<string, Legalitas>;
  legalitasHistoryMap: Record<string, LegalitasHistory[]>;
  periodikMap: Record<string, DataPeriodik>;
  verifikasiLogs: VerifikasiLog[];
}

function createInitialSandboxDataset(periode: string): SandboxDataset {
  const seedItems = DUMMY_PESANTREN_SEED.filter((item) =>
    (SANDBOX_IDS as readonly string[]).includes(item.id),
  );

  const pesantrenList: Pesantren[] = [];
  const legalitasMap: Record<string, Legalitas> = {};
  const legalitasHistoryMap: Record<string, LegalitasHistory[]> = {};
  const periodikMap: Record<string, DataPeriodik> = {};

  for (const item of seedItems) {
    const ijopStatus = computeIjopStatus(item.tanggalBerakhir);
    const totalSantriLatest = item.santriLaki + item.santriPerempuan;
    const totalPendidikLatest = item.ustadzCount + item.ustadzahCount;

    pesantrenList.push({
      id: item.id,
      nama: item.nama,
      nspp: item.nspp,
      alamat: item.alamat,
      kecamatan: item.kecamatan,
      desa: item.desa,
      telepon: item.telepon,
      email: item.email,
      namaPimpinan: item.namaPimpinan,
      tahunBerdiri: item.tahunBerdiri,
      tipe: item.tipe,
      statusKeaktifan: 'aktif',
      lat: item.lat,
      lng: item.lng,
      verificationStatus: item.verificationStatus,
      catatanRevisi: item.catatanRevisi || '',
      assignedOperatorUids: [SANDBOX_USER.uid],
      assignedOperatorEmails: [SANDBOX_USER.email],
      ijopStatusSummary: ijopStatus,
      ijopExpiredAt: item.tanggalBerakhir,
      totalSantriLatest,
      totalPendidikLatest,
      createdByUid: 'kemenag_seed',
    });

    const statusLegalitas = buildSeedLegalitasStatus(item.tanggalBerakhir);
    legalitasMap[item.id] = {
      pesantrenId: item.id,
      nomorIjop: item.nomorIjop,
      tanggalTerbit: item.tanggalTerbit,
      tanggalBerakhir: item.tanggalBerakhir,
      statusLegalitas,
      dokumenUrl: '',
      dokumenNama: `SK_IJOP_${item.id}.pdf`,
      catatan: 'Data contoh awal untuk pengujian alur perbaikan dan pengajuan operator.',
      updatedByUid: 'kemenag_seed',
    };

    legalitasHistoryMap[item.id] = [
      {
        id: `lh_${item.id}_initial`,
        pesantrenId: item.id,
        nomorIjop: item.nomorIjop,
        tanggalTerbit: item.tanggalTerbit,
        tanggalBerakhir: item.tanggalBerakhir,
        statusLegalitas,
        dokumenUrl: '',
        changedByUid: 'kemenag_seed',
        changedByEmail: 'kemenag.kabupaten@contoh.id',
      },
    ];

    const dpId = makeSafeDocId('dp', `${item.id}_${periode}`);
    periodikMap[dpId] = {
      id: dpId,
      pesantrenId: item.id,
      tahunAjaran: periode,
      santriLaki: item.santriLaki,
      santriPerempuan: item.santriPerempuan,
      santriMukim: item.santriMukim,
      santriNonMukim: item.santriNonMukim,
      santriLokal: item.santriLokal,
      santriLuarKabupaten: item.santriLuarKabupaten,
      ustadzCount: item.ustadzCount,
      ustadzahCount: item.ustadzahCount,
      pendidikS1KeAtas: item.pendidikS1KeAtas,
      pendidikTetap: item.pendidikTetap,
      pendidikTidakTetap: item.pendidikTidakTetap,
      luasTanahM2: item.luasTanahM2,
      luasBangunanM2: item.luasBangunanM2,
      jumlahAsrama: item.jumlahAsrama,
      jumlahRuangBelajar: item.jumlahRuangBelajar,
      jumlahMushola: item.jumlahMushola,
      jumlahToilet: item.jumlahToilet,
      statusTanah: item.statusTanah,
      kelayakanBangunan: item.kelayakanBangunan,
      updatedByUid: 'kemenag_seed',
    };
  }

  const miftahul = seedItems.find((s) => s.id === 'ps_miftahul_uloom_boyolangu');
  const darul = seedItems.find((s) => s.id === 'ps_darul_hikmah_kota');

  const verifikasiLogs: VerifikasiLog[] = [];
  if (miftahul) {
    verifikasiLogs.push({
      id: 'vlog_seed_miftahul',
      pesantrenId: miftahul.id,
      pesantrenNama: miftahul.nama,
      fromStatus: 'diajukan',
      toStatus: 'ditolak',
      catatanRevisi: miftahul.catatanRevisi || '',
      actorUid: 'kemenag_seed',
      actorEmail: 'admin.kemenag@contoh.id',
      actorRole: 'super_admin',
      createdAt: 'Contoh Riwayat Awal',
    });
  }
  if (darul) {
    verifikasiLogs.push({
      id: 'vlog_seed_darul',
      pesantrenId: darul.id,
      pesantrenNama: darul.nama,
      fromStatus: 'diverifikasi',
      toStatus: 'disetujui',
      actorUid: 'kemenag_seed',
      actorEmail: 'admin.kemenag@contoh.id',
      actorRole: 'super_admin',
      createdAt: 'Contoh Riwayat Awal',
    });
  }

  return {
    pesantrenList,
    legalitasMap,
    legalitasHistoryMap,
    periodikMap,
    verifikasiLogs,
  };
}

function getPipelineIndex(status: VerificationStatus): number {
  if (status === 'ditolak') return 0;
  return PIPELINE_STEPS.findIndex((s) => s.key === status);
}

export function OperatorSandboxWorkspace({
  config,
  onOpenPublicDirectory,
  onExitSandbox,
}: OperatorSandboxWorkspaceProps) {
  const defaultPeriode = config?.activePeriode || '2025/2026';
  const rawKab = config?.kabupatenNama?.trim();
  const kabupatenNama = !rawKab || rawKab === 'Kabupaten' ? 'Kab. Wonosobo' : rawKab;

  const [selectedPeriode, setSelectedPeriode] = useState<string>(defaultPeriode);
  const [activeTab, setActiveTab] = useState<OperatorTab>('ringkasan');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dataset, setDataset] = useState<SandboxDataset>(() =>
    createInitialSandboxDataset(defaultPeriode),
  );
  const [flashMsg, setFlashMsg] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingPesantren, setEditingPesantren] = useState<Pesantren | null>(null);
  const [submitTarget, setSubmitTarget] = useState<Pesantren | null>(null);

  const editingPeriodik = useMemo(() => {
    if (!editingPesantren) return null;
    const dpId = makeSafeDocId('dp', `${editingPesantren.id}_${selectedPeriode}`);
    return dataset.periodikMap[dpId] || null;
  }, [editingPesantren, dataset.periodikMap, selectedPeriode]);

  const dashboardMetrics = useMemo(() => {
    const list = dataset.pesantrenList;
    const totalSantri = list.reduce((sum, p) => {
      const dpId = makeSafeDocId('dp', `${p.id}_${selectedPeriode}`);
      const dp = dataset.periodikMap[dpId];
      return sum + (dp ? dp.santriLaki + dp.santriPerempuan : p.totalSantriLatest);
    }, 0);
    const totalPendidik = list.reduce((sum, p) => {
      const dpId = makeSafeDocId('dp', `${p.id}_${selectedPeriode}`);
      const dp = dataset.periodikMap[dpId];
      return sum + (dp ? dp.ustadzCount + dp.ustadzahCount : p.totalPendidikLatest);
    }, 0);
    const disetujuiCount = list.filter((p) => p.verificationStatus === 'disetujui').length;
    const ditolakCount = list.filter((p) => p.verificationStatus === 'ditolak').length;
    const draftCount = list.filter((p) => p.verificationStatus === 'draft').length;
    const approvalPct = list.length > 0 ? Math.round((disetujuiCount / list.length) * 100) : 0;

    return {
      totalLembaga: list.length,
      totalSantri,
      totalPendidik,
      disetujuiCount,
      ditolakCount,
      draftCount,
      approvalPct,
    };
  }, [dataset, selectedPeriode]);

  const handleResetDemo = () => {
    setDataset(createInitialSandboxDataset(selectedPeriode));
    setErrorBanner('');
    setFlashMsg('Data simulasi operator berhasil dikembalikan ke kondisi contoh awal.');
  };

  const handleLocalSave = (payload: SavePesantrenPayload) => {
    const ijopStatusSummary = payload.nomorIjop.trim()
      ? computeIjopStatus(payload.tanggalBerakhir)
      : 'belum_ada';
    const totalSantriLatest = payload.santriLaki + payload.santriPerempuan;
    const totalPendidikLatest = payload.ustadzCount + payload.ustadzahCount;

    setDataset((prev) => {
      const nextPesantren = prev.pesantrenList.map((item) =>
        item.id === payload.pesantrenId
          ? {
              ...item,
              nama: payload.nama.trim(),
              nspp: payload.nspp.trim(),
              alamat: payload.alamat.trim(),
              kecamatan: payload.kecamatan.trim(),
              desa: payload.desa.trim(),
              telepon: payload.telepon.trim(),
              email: payload.email.trim(),
              namaPimpinan: payload.namaPimpinan.trim(),
              tahunBerdiri: Number(payload.tahunBerdiri) || 2000,
              tipe: payload.tipe,
              statusKeaktifan: payload.statusKeaktifan,
              lat: Number(payload.lat) || -8.066,
              lng: Number(payload.lng) || 111.901,
              ijopStatusSummary,
              ijopExpiredAt: payload.tanggalBerakhir.trim(),
              totalSantriLatest,
              totalPendidikLatest,
            }
          : item,
      );

      const nextLegalitasMap = { ...prev.legalitasMap };
      const nextHistoryMap = { ...prev.legalitasHistoryMap };

      if (payload.nomorIjop.trim() && payload.tanggalTerbit && payload.tanggalBerakhir) {
        const statusLegalitas =
          ijopStatusSummary === 'belum_ada' ? 'proses_perpanjangan' : ijopStatusSummary;
        nextLegalitasMap[payload.pesantrenId] = {
          pesantrenId: payload.pesantrenId,
          nomorIjop: payload.nomorIjop.trim(),
          tanggalTerbit: payload.tanggalTerbit,
          tanggalBerakhir: payload.tanggalBerakhir,
          statusLegalitas,
          dokumenUrl: payload.dokumenUrl.trim(),
          dokumenNama: payload.dokumenNama.trim(),
          catatan: payload.legalitasCatatan.trim(),
          updatedByUid: SANDBOX_USER.uid,
        };

        const existingHist = nextHistoryMap[payload.pesantrenId] || [];
        nextHistoryMap[payload.pesantrenId] = [
          {
            id: makeSafeDocId('lh', `${payload.pesantrenId}_${Date.now()}`),
            pesantrenId: payload.pesantrenId,
            nomorIjop: payload.nomorIjop.trim(),
            tanggalTerbit: payload.tanggalTerbit,
            tanggalBerakhir: payload.tanggalBerakhir,
            statusLegalitas,
            dokumenUrl: payload.dokumenUrl.trim(),
            changedByUid: SANDBOX_USER.uid,
            changedByEmail: SANDBOX_USER.email,
          },
          ...existingHist,
        ];
      }

      const dpId = makeSafeDocId('dp', `${payload.pesantrenId}_${payload.tahunAjaran}`);
      const nextPeriodikMap = {
        ...prev.periodikMap,
        [dpId]: {
          id: dpId,
          pesantrenId: payload.pesantrenId,
          tahunAjaran: payload.tahunAjaran,
          santriLaki: Number(payload.santriLaki) || 0,
          santriPerempuan: Number(payload.santriPerempuan) || 0,
          santriMukim: Number(payload.santriMukim) || 0,
          santriNonMukim: Number(payload.santriNonMukim) || 0,
          santriLokal: Number(payload.santriLokal) || 0,
          santriLuarKabupaten: Number(payload.santriLuarKabupaten) || 0,
          ustadzCount: Number(payload.ustadzCount) || 0,
          ustadzahCount: Number(payload.ustadzahCount) || 0,
          pendidikS1KeAtas: Number(payload.pendidikS1KeAtas) || 0,
          pendidikTetap: Number(payload.pendidikTetap) || 0,
          pendidikTidakTetap: Number(payload.pendidikTidakTetap) || 0,
          luasTanahM2: Number(payload.luasTanahM2) || 0,
          luasBangunanM2: Number(payload.luasBangunanM2) || 0,
          jumlahAsrama: Number(payload.jumlahAsrama) || 0,
          jumlahRuangBelajar: Number(payload.jumlahRuangBelajar) || 0,
          jumlahMushola: Number(payload.jumlahMushola) || 0,
          jumlahToilet: Number(payload.jumlahToilet) || 0,
          statusTanah: payload.statusTanah,
          kelayakanBangunan: payload.kelayakanBangunan,
          updatedByUid: SANDBOX_USER.uid,
        },
      };

      return {
        ...prev,
        pesantrenList: nextPesantren,
        legalitasMap: nextLegalitasMap,
        legalitasHistoryMap: nextHistoryMap,
        periodikMap: nextPeriodikMap,
      };
    });
  };

  const handleConfirmSubmit = () => {
    if (!submitTarget) return;
    const check = canTransitionVerification(
      submitTarget.verificationStatus,
      'diajukan',
      'operator',
    );
    if (!check.allowed) {
      setErrorBanner(check.reason || 'Pengajuan verifikasi tidak diizinkan.');
      setSubmitTarget(null);
      return;
    }

    const nowLabel = new Date().toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    setDataset((prev) => ({
      ...prev,
      pesantrenList: prev.pesantrenList.map((item) =>
        item.id === submitTarget.id
          ? {
              ...item,
              verificationStatus: 'diajukan',
              catatanRevisi: '',
            }
          : item,
      ),
      verifikasiLogs: [
        {
          id: makeSafeDocId('vlog', `${submitTarget.id}_${Date.now()}`),
          pesantrenId: submitTarget.id,
          pesantrenNama: submitTarget.nama,
          fromStatus: submitTarget.verificationStatus,
          toStatus: 'diajukan',
          actorUid: SANDBOX_USER.uid,
          actorEmail: SANDBOX_USER.email,
          actorRole: 'operator',
          createdAt: nowLabel,
        },
        ...prev.verifikasiLogs,
      ],
    }));

    setFlashMsg(
      `Pengajuan verifikasi untuk ${submitTarget.nama} berhasil disimulasikan (status kini: Diajukan).`,
    );
    setSubmitTarget(null);
  };

  const navItems: { id: OperatorTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'ringkasan', label: 'Ringkasan', icon: LayoutDashboard },
    { id: 'lembaga', label: 'Lembaga Saya', icon: Building2 },
    { id: 'legalitas', label: 'Legalitas & IJOP', icon: FileCheck2 },
    { id: 'riwayat', label: 'Riwayat Pengajuan', icon: History },
  ];

  const ringRadius = 14;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - dashboardMetrics.approvalPct / 100);

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-[#FAFAFA] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-white/[0.08] bg-[#111217] shrink-0">
        <div className="h-16 px-5 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <p className="font-display text-sm font-semibold text-[#FAFAFA]">
              SimPoren Kemenag
            </p>
            <p className="text-[11px] text-[#71717A] truncate max-w-[190px]">{kabupatenNama}</p>
          </div>
        </div>

        <nav aria-label="Menu Simulasi Operator" className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors text-left ${
                  isActive
                    ? 'bg-emerald-500 text-[#041D13] font-semibold'
                    : 'text-[#A1A1AA] hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.08] text-xs space-y-2">
          <button
            type="button"
            onClick={handleResetDemo}
            className="w-full flex items-center gap-2 px-3 py-2 text-left font-medium text-[#FAFAFA] bg-white/[0.04] border border-white/[0.12] hover:bg-white/[0.1] rounded-xl transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Reset Data Contoh</span>
          </button>
          <button
            type="button"
            onClick={onOpenPublicDirectory}
            className="w-full px-3 py-2 text-left font-medium text-[#E4E4E7] bg-white/[0.06] hover:bg-white/[0.12] rounded-xl transition-colors whitespace-nowrap"
          >
            Lihat Direktori Publik
          </button>
          <p className="text-[#71717A] truncate pt-1">{SANDBOX_USER.email}</p>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-50 w-64 bg-[#111217] h-full border-r border-white/[0.08] flex flex-col">
            <div className="h-16 px-4 border-b border-white/[0.08] flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-[#FAFAFA]">
                SimPoren Kemenag
              </span>
              <button
                type="button"
                aria-label="Tutup navigasi"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg text-[#A1A1AA] hover:bg-white/[0.08] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl text-left ${
                      isActive
                        ? 'bg-emerald-500 text-[#041D13] font-semibold'
                        : 'text-[#A1A1AA] hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/[0.08] space-y-2">
              <button
                type="button"
                onClick={() => {
                  handleResetDemo();
                  setMobileNavOpen(false);
                }}
                className="w-full px-3 py-2 text-xs font-medium text-[#FAFAFA] bg-white/[0.04] border border-white/[0.12] hover:bg-white/[0.1] rounded-xl text-left"
              >
                Reset Data Contoh
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  onOpenPublicDirectory();
                }}
                className="w-full px-3 py-2 text-xs font-medium text-[#E4E4E7] bg-white/[0.06] hover:bg-white/[0.12] rounded-xl text-left"
              >
                Lihat Direktori Publik
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-[#111217]/90 backdrop-blur-md border-b border-white/[0.08] px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Buka menu"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#A1A1AA] hover:bg-white/[0.08] hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-[#71717A] truncate">
                {kabupatenNama} / Dashboard Operator
              </p>
              <h1 className="text-base font-semibold text-[#FAFAFA] truncate">
                {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <label htmlFor="sandbox-periode-select" className="sr-only">
              Pilih Periode Tahun Ajaran
            </label>
            <select
              id="sandbox-periode-select"
              value={selectedPeriode}
              onChange={(e) => setSelectedPeriode(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono-num bg-[#0D0E12] text-[#FAFAFA] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none"
            >
              {PERIODE_OPTIONS.map((pr) => (
                <option key={pr} value={pr}>
                  TA {pr}
                </option>
              ))}
            </select>

            <span className="hidden sm:inline text-xs text-[#A1A1AA] font-medium whitespace-nowrap shrink-0">
              Operator Uji (Lokal)
            </span>

            <button
              type="button"
              onClick={onExitSandbox}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#E4E4E7] hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Simulasi</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1280px] w-full mx-auto space-y-6">
          {/* Sandbox Notice Banner */}
          <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#FAFAFA]">
                Mode Simulasi Operator Uji (Data Contoh Lokal)
              </p>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                Anda sedang mencoba dashboard operasional pesantren menggunakan data contoh terisolasi di browser.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleResetDemo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.14] hover:bg-white/[0.12] rounded-xl whitespace-nowrap shrink-0 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Data Contoh</span>
              </button>
            </div>
          </div>

          {flashMsg && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-white/[0.06] border border-white/[0.16] text-[#FAFAFA] text-sm"
            >
              <span>{flashMsg}</span>
              <button
                type="button"
                aria-label="Tutup pesan"
                onClick={() => setFlashMsg('')}
                className="text-xs font-medium underline shrink-0"
              >
                Tutup
              </button>
            </div>
          )}

          {errorBanner && (
            <div
              role="alert"
              className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-white/[0.08] border border-white/[0.35] text-white text-sm font-medium"
            >
              <span>{errorBanner}</span>
              <button
                type="button"
                aria-label="Tutup peringatan"
                onClick={() => setErrorBanner('')}
                className="text-xs font-medium underline shrink-0"
              >
                Tutup
              </button>
            </div>
          )}

          {/* ================= TAB 1: RINGKASAN ================= */}
          {activeTab === 'ringkasan' && (
            <div className="space-y-6">
              {/* 4 Dark Monochrome KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5 hover:border-white/[0.16] transition-colors">
                  <p className="text-xs text-[#A1A1AA]">Lembaga Ditugaskan</p>
                  <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                    {dashboardMetrics.totalLembaga}
                  </p>
                  <p className="mt-1 text-[11px] text-[#71717A] font-medium">Aktif dalam pembinaan</p>
                </div>

                <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5 hover:border-white/[0.16] transition-colors">
                  <p className="text-xs text-[#A1A1AA]">Total Santri ({selectedPeriode})</p>
                  <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                    {dashboardMetrics.totalSantri.toLocaleString('id-ID')}
                  </p>
                  <p className="mt-1 text-[11px] text-[#71717A]">Mukim &amp; Non-mukim</p>
                </div>

                <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5 hover:border-white/[0.16] transition-colors">
                  <p className="text-xs text-[#A1A1AA]">Tenaga Pendidik</p>
                  <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                    {dashboardMetrics.totalPendidik.toLocaleString('id-ID')}
                  </p>
                  <p className="mt-1 text-[11px] text-[#71717A]">Ustadz &amp; Ustadzah</p>
                </div>

                <div className="bg-gradient-to-br from-[#171920] via-[#121619] to-[#0E1A16] border border-emerald-500/20 rounded-2xl p-4 sm:p-5 hover:border-emerald-400/35 transition-colors flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-[#A1A1AA]">Status Verifikasi</p>
                    <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                      {dashboardMetrics.approvalPct}%
                    </p>
                    <p className="mt-1 text-[11px] text-[#71717A] font-mono-num">
                      {dashboardMetrics.disetujuiCount} Disetujui · {dashboardMetrics.ditolakCount} Revisi
                    </p>
                  </div>
                  <svg width="40" height="40" viewBox="0 0 36 36" aria-hidden="true" className="hidden sm:block shrink-0 -rotate-90">
                    <circle cx="18" cy="18" r={ringRadius} fill="none" stroke="rgba(16,185,129,0.18)" strokeWidth="3" />
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
              </div>

              {/* Revision Alerts (Flattened, High-Contrast Specular Border) */}
              {dataset.pesantrenList.some((p) => p.verificationStatus === 'ditolak') && (
                <div className="bg-[#16181F] border border-white/[0.28] rounded-2xl p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">Perhatian: Catatan Revisi dari Kemenag</h2>
                  <div className="divide-y divide-white/[0.08]">
                    {dataset.pesantrenList
                      .filter((p) => p.verificationStatus === 'ditolak')
                      .map((p) => (
                        <div key={p.id} className="pt-3 first:pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="space-y-1">
                            <p className="font-semibold text-[#FAFAFA]">{p.nama}</p>
                            <p className="text-[#A1A1AA]">{p.catatanRevisi || 'Mohon perbarui data sesuai ketentuan.'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPesantren(p);
                              setFormOpen(true);
                            }}
                            className="self-start sm:self-center px-3.5 py-2 font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors whitespace-nowrap shrink-0"
                          >
                            Perbarui Data &amp; Lengkapi
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Quick Jump List */}
              <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-[#FAFAFA]">Lembaga Pesantren Binaan</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('lembaga')}
                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:underline whitespace-nowrap shrink-0"
                  >
                    Kelola Semua →
                  </button>
                </div>
                <div className="divide-y divide-white/[0.06] text-sm">
                  {dataset.pesantrenList.map((p) => {
                    const leg = dataset.legalitasMap[p.id] || null;
                    const dpId = makeSafeDocId('dp', `${p.id}_${selectedPeriode}`);
                    const dp = dataset.periodikMap[dpId] || null;
                    const comp = calculateCompleteness(p, leg, dp);

                    return (
                      <div key={p.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#FAFAFA]">{p.nama}</p>
                          <p className="text-xs text-[#A1A1AA] mt-0.5">
                            {p.kecamatan} · Kelengkapan Data: <strong className="font-mono-num text-[#FAFAFA]">{comp.percent}%</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-lg border whitespace-nowrap shrink-0 ${
                              p.verificationStatus === 'disetujui'
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold'
                                : p.verificationStatus === 'ditolak'
                                  ? 'bg-[#0D0E12] border-white/60 text-white font-semibold'
                                  : 'bg-white/[0.05] border-white/[0.12] text-[#A1A1AA]'
                            }`}
                          >
                            {STATUS_LABELS[p.verificationStatus]}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPesantren(p);
                              setFormOpen(true);
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] rounded-xl whitespace-nowrap shrink-0 transition-colors"
                          >
                            Ubah
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: LEMBAGA SAYA ================= */}
          {activeTab === 'lembaga' && (
            <section className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-[#FAFAFA]">Pengelolaan Lembaga Pesantren</h2>
                <p className="text-xs text-[#A1A1AA] mt-0.5">
                  Lengkapi profil pokok, data santri, tenaga pendidik, dan sarana prasarana untuk tahun ajaran {selectedPeriode}.
                </p>
              </div>

              {dataset.pesantrenList.map((p) => {
                const leg = dataset.legalitasMap[p.id] || null;
                const dpId = makeSafeDocId('dp', `${p.id}_${selectedPeriode}`);
                const dp = dataset.periodikMap[dpId] || null;
                const comp = calculateCompleteness(p, leg, dp);
                const canSubmit =
                  p.verificationStatus === 'draft' || p.verificationStatus === 'ditolak';
                const stepIdx = getPipelineIndex(p.verificationStatus);

                return (
                  <article
                    key={p.id}
                    className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-6 space-y-5"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div>
                        <p className="text-xs text-[#71717A] font-mono-num">
                          NSPP {p.nspp || '-'} · {p.tipe} · {p.kecamatan}, {p.desa}
                        </p>
                        <h2 className="text-xl font-semibold text-[#FAFAFA] mt-1">{p.nama}</h2>
                        <p className="text-sm text-[#A1A1AA] mt-1">
                          Pimpinan: {p.namaPimpinan} · Kelengkapan Data:{' '}
                          <strong className="font-mono-num text-[#FAFAFA]">{comp.percent}%</strong>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-xs font-medium px-2.5 py-1 rounded-lg border whitespace-nowrap shrink-0 ${
                            p.verificationStatus === 'disetujui'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold'
                              : p.verificationStatus === 'ditolak'
                                ? 'bg-[#0D0E12] border-white/60 text-white font-semibold'
                                : 'bg-white/[0.05] border-white/[0.12] text-[#A1A1AA]'
                          }`}
                        >
                          {STATUS_LABELS[p.verificationStatus]}
                        </span>
                      </div>
                    </div>

                    {/* Monochrome + Emerald Stepped Verification Timeline Track */}
                    <div className="py-2">
                      <div className="flex items-center justify-between relative">
                        <div className="absolute left-3 right-3 top-2.5 h-px bg-white/[0.12]" aria-hidden="true" />
                        {PIPELINE_STEPS.map((st, idx) => {
                          const reached = idx <= stepIdx;
                          const isCurrent = idx === stepIdx;
                          return (
                            <div key={st.key} className="relative z-10 flex flex-col items-center gap-1.5">
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-colors ${
                                  isCurrent
                                    ? 'bg-emerald-500 border-emerald-400 text-[#041D13]'
                                    : reached
                                      ? 'bg-[#131419] border-emerald-400'
                                      : 'bg-[#131419] border-white/25'
                                }`}
                              >
                                {reached && <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-[#041D13]' : 'bg-emerald-400'}`} />}
                              </span>
                              <span className={`text-[11px] font-medium ${isCurrent ? 'text-emerald-300 font-semibold' : reached ? 'text-[#FAFAFA]' : 'text-[#71717A]'}`}>
                                {st.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {p.verificationStatus === 'ditolak' && p.catatanRevisi && (
                      <div className="p-4 rounded-xl bg-[#0D0E12] border border-white/[0.25] text-sm text-[#FAFAFA]">
                        <p className="font-semibold">Catatan Revisi dari Kemenag:</p>
                        <p className="mt-1 text-[#A1A1AA]">{p.catatanRevisi}</p>
                      </div>
                    )}

                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-white/[0.08] py-4 text-sm">
                      <div>
                        <dt className="text-xs text-[#71717A]">Total Santri ({selectedPeriode})</dt>
                        <dd className="mt-1 text-lg font-semibold font-mono-num text-[#FAFAFA]">
                          {(dp ? dp.santriLaki + dp.santriPerempuan : p.totalSantriLatest).toLocaleString('id-ID')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#71717A]">Tenaga Pendidik</dt>
                        <dd className="mt-1 text-lg font-semibold font-mono-num text-[#FAFAFA]">
                          {(dp ? dp.ustadzCount + dp.ustadzahCount : p.totalPendidikLatest).toLocaleString('id-ID')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#71717A]">Status IJOP</dt>
                        <dd className="mt-1 font-medium text-[#FAFAFA]">
                          {IJOP_LABELS[p.ijopStatusSummary]}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#71717A]">Ruang Belajar / Tanah</dt>
                        <dd className="mt-1 font-mono-num text-[#E4E4E7]">
                          {dp ? `${dp.jumlahRuangBelajar} ruang · ${dp.luasTanahM2} m²` : 'Belum diisi'}
                        </dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-[#71717A]">
                        {comp.missingSections.length === 0
                          ? 'Semua bagian utama sudah terisi.'
                          : `Perlu dilengkapi: ${comp.missingSections.join(', ')}`}
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPesantren(p);
                            setFormOpen(true);
                          }}
                          className="px-4 py-2 text-sm font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.12] rounded-xl transition-colors whitespace-nowrap shrink-0"
                        >
                          {canSubmit ? 'Lengkapi / Ubah Data' : 'Lihat Detail Data'}
                        </button>
                        {canSubmit && (
                          <button
                            type="button"
                            onClick={() => setSubmitTarget(p)}
                            className="px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors whitespace-nowrap shrink-0"
                          >
                            Ajukan Verifikasi
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {/* ================= TAB 3: LEGALITAS & IJOP ================= */}
          {activeTab === 'legalitas' && (
            <section className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-[#FAFAFA]">Legalitas &amp; Izin Operasional (IJOP)</h2>
                <p className="text-xs text-[#A1A1AA] mt-0.5">
                  Informasi nomor SK IJOP, tanggal terbit, masa berlaku, dan riwayat perpanjangan dokumen lembaga.
                </p>
              </div>

              {dataset.pesantrenList.map((p) => {
                const leg = dataset.legalitasMap[p.id] || null;
                const historyList = dataset.legalitasHistoryMap[p.id] || [];

                return (
                  <article key={p.id} className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs text-[#71717A] font-mono-num">NSPP {p.nspp || '-'}</p>
                        <h3 className="text-base font-semibold text-[#FAFAFA] mt-0.5">{p.nama}</h3>
                      </div>
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-lg border whitespace-nowrap shrink-0 ${
                          p.ijopStatusSummary === 'aktif'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold'
                            : 'bg-white/[0.06] border-white/[0.18] text-[#FAFAFA]'
                        }`}
                      >
                        {IJOP_LABELS[p.ijopStatusSummary]}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#0D0E12] border border-white/[0.08] p-4 rounded-xl text-xs">
                      <div>
                        <span className="text-[#71717A] block">Nomor SK IJOP</span>
                        <strong className="text-[#FAFAFA] font-mono-num mt-0.5 block">{leg?.nomorIjop || '-'}</strong>
                      </div>
                      <div>
                        <span className="text-[#71717A] block">Tanggal Terbit</span>
                        <strong className="text-[#FAFAFA] font-mono-num mt-0.5 block">{leg?.tanggalTerbit || '-'}</strong>
                      </div>
                      <div>
                        <span className="text-[#71717A] block">Tanggal Berakhir</span>
                        <strong className="text-[#FAFAFA] font-mono-num mt-0.5 block">{leg?.tanggalBerakhir || '-'}</strong>
                      </div>
                    </div>

                    {historyList.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-[#A1A1AA] mb-2">Riwayat Dokumen Legalitas</p>
                        <div className="divide-y divide-white/[0.06] text-xs">
                          {historyList.map((h) => (
                            <div key={h.id} className="py-2 flex items-center justify-between text-[#E4E4E7]">
                              <span className="font-mono-num">{h.nomorIjop} (Berakhir: {h.tanggalBerakhir})</span>
                              <span className="text-[#71717A]">{h.changedByEmail || h.statusLegalitas}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          )}

          {/* ================= TAB 4: RIWAYAT PENGAJUAN ================= */}
          {activeTab === 'riwayat' && (
            <section className="bg-[#131419] border border-white/[0.08] rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#FAFAFA]">Riwayat Status Verifikasi</h2>
                <p className="text-xs text-[#A1A1AA] mt-0.5">
                  Jejak log pengajuan verifikasi, tanggapan Kemenag, dan catatan revisi.
                </p>
              </div>

              {dataset.verifikasiLogs.length === 0 ? (
                <p className="text-sm text-[#A1A1AA] py-6 text-center">Belum ada riwayat pengajuan verifikasi.</p>
              ) : (
                <div className="divide-y divide-white/[0.06] text-sm">
                  {dataset.verifikasiLogs.map((log) => (
                    <div
                      key={log.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <p className="font-medium text-[#FAFAFA]">{log.pesantrenNama}</p>
                        <p className="text-xs text-[#A1A1AA] mt-0.5">
                          {STATUS_LABELS[log.fromStatus]} →{' '}
                          <strong className="text-[#FAFAFA]">
                            {STATUS_LABELS[log.toStatus]}
                          </strong>
                          {log.catatanRevisi ? ` · Catatan: "${log.catatanRevisi}"` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-[#71717A] font-mono-num shrink-0">
                        {typeof log.createdAt === 'string' ? log.createdAt : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      <PesantrenFormModal
        open={formOpen}
        user={SANDBOX_USER}
        pesantren={editingPesantren}
        legalitas={editingPesantren ? dataset.legalitasMap[editingPesantren.id] || null : null}
        legalitasHistory={
          editingPesantren ? dataset.legalitasHistoryMap[editingPesantren.id] || [] : []
        }
        periodik={editingPeriodik}
        activePeriode={selectedPeriode}
        onClose={() => {
          setFormOpen(false);
          setEditingPesantren(null);
        }}
        onLocalSave={handleLocalSave}
        onSaved={(message) => {
          setFormOpen(false);
          setEditingPesantren(null);
          setFlashMsg(`${message} (Simulasi lokal)`);
        }}
      />

      <ConfirmDialog
        open={Boolean(submitTarget)}
        title="Ajukan Verifikasi ke Kemenag (Simulasi)"
        description={
          submitTarget
            ? `Status data ${submitTarget.nama} akan berubah menjadi Diajukan dan formulir akan terkunci sebagaimana alur operator asli.`
            : ''
        }
        confirmLabel="Ya, Ajukan Verifikasi"
        onCancel={() => setSubmitTarget(null)}
        onConfirm={handleConfirmSubmit}
      />
    </div>
  );
}
