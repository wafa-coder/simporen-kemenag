import {
  Building2,
  ClipboardCheck,
  Download,
  Eye,
  FileCheck2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Users,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  IJOP_LABELS,
  STATUS_LABELS,
  calculateCompleteness,
  canTransitionVerification,
  isSafeHttpsUrl,
  makeSafeDocId,
} from '../lib/domain';
import { exportPesantrenExcel, exportPesantrenPdf } from '../lib/export';
import {
  assignOperatorToPesantren,
  revokeOperatorFromPesantren,
  saveSystemConfig,
  seedDummyPesantrenData,
  toggleOperatorActive,
  transitionPesantrenStatus,
} from '../lib/firestoreService';
import {
  BLUEPRINT_LIMITS,
  type AuditLog,
  type DataPeriodik,
  type Legalitas,
  type LegalitasHistory,
  type OperatorAssignment,
  type OperatorInvite,
  type Pesantren,
  type SystemConfig,
  type UserProfile,
  type VerifikasiLog,
  type VerificationStatus,
} from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { PesantrenFormModal } from './PesantrenFormModal';

interface AuthWorkspaceProps {
  user: UserProfile;
  config: SystemConfig | null;
  onOpenPublicDirectory: () => void;
  onSignOut: () => void;
}

type AdminTab =
  | 'dashboard'
  | 'pesantren'
  | 'verifikasi'
  | 'legalitas'
  | 'operator'
  | 'laporan'
  | 'audit'
  | 'pengaturan';

type OperatorTab = 'ringkasan' | 'lembaga' | 'legalitas' | 'riwayat';

const PERIODE_OPTIONS = ['2024/2025', '2025/2026', '2026/2027'];

function formatTimestamp(ts: unknown): string {
  if (!ts) return '-';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  }
  return '-';
}

function getMillis(ts: unknown): number {
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function AuthWorkspace({
  user,
  config,
  onOpenPublicDirectory,
  onSignOut,
}: AuthWorkspaceProps) {
  const defaultPeriode = config?.activePeriode || '2025/2026';
  const rawKab = config?.kabupatenNama?.trim();
  const kabupatenNama = !rawKab || rawKab === 'Kabupaten' ? 'Kab. Wonosobo' : rawKab;
  const allowMultiOpPerPesantren = config?.allowMultiOperatorPerPesantren ?? true;
  const allowMultiPesantrenPerOp = config?.allowMultiPesantrenPerOperator ?? true;
  const allowPostApprovalEdit = config?.allowPostApprovalEdit ?? true;

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [operatorTab, setOperatorTab] = useState<'ringkasan' | 'lembaga' | 'legalitas' | 'riwayat'>('ringkasan');
  const [selectedPeriode, setSelectedPeriode] = useState<string>(defaultPeriode);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [previewOperatorMode, setPreviewOperatorMode] = useState(false);
  const [previewPesantrenId, setPreviewPesantrenId] = useState<string>('ALL');

  const isOperatorView = user.role === 'operator' || (user.role === 'super_admin' && previewOperatorMode);

  // Domain State
  const [pesantrenList, setPesantrenList] = useState<Pesantren[]>([]);
  const [legalitasMap, setLegalitasMap] = useState<Record<string, Legalitas>>({});
  const [periodikMap, setPeriodikMap] = useState<Record<string, DataPeriodik>>({});
  const [legalitasHistoryList, setLegalitasHistoryList] = useState<LegalitasHistory[]>([]);
  const [invites, setInvites] = useState<OperatorInvite[]>([]);
  const [assignments, setAssignments] = useState<OperatorAssignment[]>([]);
  const [verifikasiLogs, setVerifikasiLogs] = useState<VerifikasiLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Filters & Feedback
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKecamatan, setFilterKecamatan] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | VerificationStatus>('ALL');
  const [verQueueFilter, setVerQueueFilter] = useState<'PENDING' | 'ALL' | VerificationStatus>('PENDING');
  const [reportStatus, setReportStatus] = useState<'ALL' | VerificationStatus>('ALL');
  const [reportKecamatan, setReportKecamatan] = useState('ALL');
  const [reportIjop, setReportIjop] = useState('ALL');
  const [flashMsg, setFlashMsg] = useState('');
  const [errorBanner, setErrorBanner] = useState('');
  const [seeding, setSeeding] = useState(false);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editingPesantren, setEditingPesantren] = useState<Pesantren | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    requireReason?: boolean;
    destructive?: boolean;
    pesantren: Pesantren | null;
    toStatus: VerificationStatus;
  }>({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Ya, Lanjutkan',
    pesantren: null,
    toStatus: 'diajukan',
  });

  // Operator Invite Form
  const [opEmail, setOpEmail] = useState('');
  const [opName, setOpName] = useState('');
  const [opPhone, setOpPhone] = useState('');
  const [opPesantrenId, setOpPesantrenId] = useState('');
  const [opSaving, setOpSaving] = useState(false);

  // System Config Form
  const [cfgKabupaten, setCfgKabupaten] = useState(kabupatenNama);
  const [cfgPeriode, setCfgPeriode] = useState(defaultPeriode);
  const [cfgMultiOpPerPs, setCfgMultiOpPerPs] = useState(allowMultiOpPerPesantren);
  const [cfgMultiPsPerOp, setCfgMultiPsPerOp] = useState(allowMultiPesantrenPerOp);
  const [cfgPostApproval, setCfgPostApproval] = useState(allowPostApprovalEdit);
  const [cfgPublicDir, setCfgPublicDir] = useState(config?.publicDirectoryEnabled ?? true);
  const [cfgSaving, setCfgSaving] = useState(false);

  useEffect(() => {
    setSelectedPeriode(defaultPeriode);
    const nextKab = config?.kabupatenNama?.trim();
    setCfgKabupaten(!nextKab || nextKab === 'Kabupaten' ? 'Kab. Wonosobo' : nextKab);
    setCfgPeriode(defaultPeriode);
    setCfgMultiOpPerPs(config?.allowMultiOperatorPerPesantren ?? true);
    setCfgMultiPsPerOp(config?.allowMultiPesantrenPerOperator ?? true);
    setCfgPostApproval(config?.allowPostApprovalEdit ?? true);
    setCfgPublicDir(config?.publicDirectoryEnabled ?? true);
  }, [config, defaultPeriode]);

  // Firestore Subscriptions (Role-Scoped)
  useEffect(() => {
    setDataLoading(true);
    const unsubs: Unsubscribe[] = [];

    if (user.role === 'super_admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'pesantren'),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Pesantren);
            list.sort((a, b) => a.nama.localeCompare(b.nama));
            setPesantrenList(list);
            setDataLoading(false);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'pesantren'),
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'legalitas'),
          (snap) => {
            const next: Record<string, Legalitas> = {};
            snap.docs.forEach((d) => {
              next[d.id] = { ...d.data(), pesantrenId: d.id } as Legalitas;
            });
            setLegalitasMap(next);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'legalitas'),
        ),
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'data_periodik'), where('tahunAjaran', '==', selectedPeriode)),
          (snap) => {
            const next: Record<string, DataPeriodik> = {};
            snap.docs.forEach((d) => {
              const row = { id: d.id, ...d.data() } as DataPeriodik;
              next[row.pesantrenId] = row;
            });
            setPeriodikMap(next);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'data_periodik'),
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'legalitas_history'),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LegalitasHistory);
            list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
            setLegalitasHistoryList(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'legalitas_history'),
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'operator_invites'),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as OperatorInvite);
            list.sort((a, b) => a.fullName.localeCompare(b.fullName));
            setInvites(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'operator_invites'),
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'operator_assignments'),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as OperatorAssignment);
            list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
            setAssignments(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'operator_assignments'),
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'verifikasi_logs'),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as VerifikasiLog);
            list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
            setVerifikasiLogs(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'verifikasi_logs'),
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'audit_logs'),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLog);
            list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
            setAuditLogs(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs'),
        ),
      );
    } else {
      // Strictly scoped Operator subscriptions
      unsubs.push(
        onSnapshot(
          query(collection(db, 'pesantren'), where('assignedOperatorUids', 'array-contains', user.uid)),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Pesantren);
            list.sort((a, b) => a.nama.localeCompare(b.nama));
            setPesantrenList(list);
            setDataLoading(false);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'pesantren'),
        ),
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'legalitas_history'), where('changedByUid', '==', user.uid)),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LegalitasHistory);
            list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
            setLegalitasHistoryList(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'legalitas_history'),
        ),
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'verifikasi_logs'), where('actorUid', '==', user.uid)),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as VerifikasiLog);
            list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
            setVerifikasiLogs(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'verifikasi_logs'),
        ),
      );
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [user.role, user.uid, selectedPeriode]);

  // Operator per-pesantren doc subscriptions for legalitas & periodik
  useEffect(() => {
    if (user.role !== 'operator' || pesantrenList.length === 0) return;
    const unsubs: Unsubscribe[] = [];

    pesantrenList.forEach((ps) => {
      unsubs.push(
        onSnapshot(
          doc(db, 'legalitas', ps.id),
          (snap) => {
            setLegalitasMap((prev) => {
              const next = { ...prev };
              if (snap.exists()) {
                next[ps.id] = { ...snap.data(), pesantrenId: ps.id } as Legalitas;
              } else {
                delete next[ps.id];
              }
              return next;
            });
          },
          (err) => handleFirestoreError(err, OperationType.GET, `legalitas/${ps.id}`),
        ),
      );

      const dpId = makeSafeDocId('dp', `${ps.id}_${selectedPeriode}`);
      unsubs.push(
        onSnapshot(
          doc(db, 'data_periodik', dpId),
          (snap) => {
            setPeriodikMap((prev) => {
              const next = { ...prev };
              if (snap.exists()) {
                next[ps.id] = { id: snap.id, ...snap.data() } as DataPeriodik;
              } else {
                delete next[ps.id];
              }
              return next;
            });
          },
          (err) => handleFirestoreError(err, OperationType.GET, `data_periodik/${dpId}`),
        ),
      );
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [user.role, pesantrenList, selectedPeriode]);

  // Pre-select first pesantren in operator assign form
  useEffect(() => {
    if (!opPesantrenId && pesantrenList.length > 0) {
      setOpPesantrenId(pesantrenList[0].id);
    }
  }, [pesantrenList, opPesantrenId]);

  const kecamatanList = useMemo(
    () => Array.from(new Set(pesantrenList.map((p) => p.kecamatan))).sort(),
    [pesantrenList],
  );

  const filteredPesantren = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pesantrenList.filter((p) => {
      if (filterKecamatan !== 'ALL' && p.kecamatan !== filterKecamatan) return false;
      if (filterStatus !== 'ALL' && p.verificationStatus !== filterStatus) return false;
      if (!q) return true;
      return (
        p.nama.toLowerCase().includes(q) ||
        (p.nspp || '').toLowerCase().includes(q) ||
        p.desa.toLowerCase().includes(q) ||
        p.namaPimpinan.toLowerCase().includes(q)
      );
    });
  }, [pesantrenList, searchQuery, filterKecamatan, filterStatus]);

  const dashboardMetrics = useMemo(() => {
    const totalSantri = pesantrenList.reduce((sum, p) => {
      const dp = periodikMap[p.id];
      return sum + (dp ? dp.santriLaki + dp.santriPerempuan : p.totalSantriLatest);
    }, 0);
    const totalPendidik = pesantrenList.reduce((sum, p) => {
      const dp = periodikMap[p.id];
      return sum + (dp ? dp.ustadzCount + dp.ustadzahCount : p.totalPendidikLatest);
    }, 0);
    const disetujuiCount = pesantrenList.filter((p) => p.verificationStatus === 'disetujui').length;
    const menungguCount = pesantrenList.filter(
      (p) => p.verificationStatus === 'diajukan' || p.verificationStatus === 'diverifikasi',
    ).length;

    const byKecamatan = new Map<string, number>();
    pesantrenList.forEach((p) => {
      byKecamatan.set(p.kecamatan, (byKecamatan.get(p.kecamatan) || 0) + 1);
    });
    const kecamatanBars = Array.from(byKecamatan.entries()).sort((a, b) => b[1] - a[1]);

    const ijopAlerts = pesantrenList.filter(
      (p) => p.ijopStatusSummary === 'kedaluwarsa' || p.ijopStatusSummary === 'segera_berakhir' || p.ijopStatusSummary === 'belum_ada',
    );
    const pendingList = pesantrenList.filter(
      (p) => p.verificationStatus === 'diajukan' || p.verificationStatus === 'diverifikasi',
    );

    return {
      totalPesantren: pesantrenList.length,
      totalSantri,
      totalPendidik,
      disetujuiCount,
      menungguCount,
      kecamatanBars,
      ijopAlerts,
      pendingList,
    };
  }, [pesantrenList, periodikMap]);

  const verificationQueue = useMemo(() => {
    if (verQueueFilter === 'PENDING') {
      return pesantrenList.filter(
        (p) => p.verificationStatus === 'diajukan' || p.verificationStatus === 'diverifikasi',
      );
    }
    if (verQueueFilter === 'ALL') return pesantrenList;
    return pesantrenList.filter((p) => p.verificationStatus === verQueueFilter);
  }, [pesantrenList, verQueueFilter]);

  const reportRows = useMemo(() => {
    return pesantrenList
      .filter((p) => {
        if (reportKecamatan !== 'ALL' && p.kecamatan !== reportKecamatan) return false;
        if (reportStatus !== 'ALL' && p.verificationStatus !== reportStatus) return false;
        if (reportIjop !== 'ALL' && p.ijopStatusSummary !== reportIjop) return false;
        return true;
      })
      .map((p) => ({
        pesantren: p,
        legalitas: legalitasMap[p.id] || null,
        periodik: periodikMap[p.id] || null,
      }));
  }, [pesantrenList, legalitasMap, periodikMap, reportKecamatan, reportStatus, reportIjop]);

  const triggerStatusTransition = (pesantren: Pesantren, toStatus: VerificationStatus) => {
    const check = canTransitionVerification(
      pesantren.verificationStatus,
      toStatus,
      user.role,
      allowPostApprovalEdit,
      toStatus === 'ditolak' ? 'placeholder' : '',
    );
    if (!check.allowed) {
      setErrorBanner(check.reason || 'Transisi status tidak diizinkan.');
      return;
    }

    const titles: Record<VerificationStatus, string> = {
      draft: 'Kembalikan ke Status Draft',
      diajukan: 'Ajukan Verifikasi ke Kemenag',
      diverifikasi: 'Tandai Berkas Terverifikasi',
      disetujui: 'Setujui & Publikasikan Pesantren',
      ditolak: 'Kembalikan Data untuk Revisi',
    };

    const descriptions: Record<VerificationStatus, string> = {
      draft: `Status ${pesantren.nama} akan dikembalikan menjadi Draft sehingga operator dapat menyunting ulang data.`,
      diajukan: `Pastikan data profil, legalitas IJOP, santri, pendidik, dan sarpras ${pesantren.nama} sudah lengkap sebelum dikirim ke Kemenag.`,
      diverifikasi: `Berkas ${pesantren.nama} akan ditandai telah diverifikasi dan siap disetujui.`,
      disetujui: `Data ${pesantren.nama} akan disetujui dan langsung dipublikasikan ke Direktori Publik jika berstatus aktif.`,
      ditolak: `Tuliskan catatan bagian yang harus diperbaiki oleh operator ${pesantren.nama}.`,
    };

    setConfirmState({
      open: true,
      title: titles[toStatus],
      description: descriptions[toStatus],
      confirmLabel: toStatus === 'ditolak' ? 'Kirim Catatan Revisi' : 'Konfirmasi',
      requireReason: toStatus === 'ditolak',
      destructive: toStatus === 'ditolak',
      pesantren,
      toStatus,
    });
  };

  const handleConfirmTransition = async (reason: string) => {
    if (!confirmState.pesantren) return;
    setErrorBanner('');
    try {
      await transitionPesantrenStatus(
        db,
        user,
        confirmState.pesantren,
        confirmState.toStatus,
        reason,
      );
      setFlashMsg(
        `Status ${confirmState.pesantren.nama} diperbarui menjadi ${STATUS_LABELS[confirmState.toStatus]}.`,
      );
      setConfirmState((prev) => ({ ...prev, open: false, pesantren: null }));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal memperbarui status.');
    }
  };

  const handleAssignOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner('');
    setFlashMsg('');

    const normalizedEmail = opEmail.trim().toLowerCase();
    const targetPesantren = pesantrenList.find((p) => p.id === opPesantrenId);
    if (!normalizedEmail || !opName.trim() || !targetPesantren) {
      setErrorBanner('Lengkapi email Google operator, nama lengkap, dan pesantren tujuan.');
      return;
    }

    const existingInvite = invites.find((i) => i.email.toLowerCase() === normalizedEmail);

    if (
      !allowMultiOpPerPesantren &&
      targetPesantren.assignedOperatorEmails.length >= 1 &&
      !targetPesantren.assignedOperatorEmails.map((em) => em.toLowerCase()).includes(normalizedEmail)
    ) {
      setErrorBanner(
        `Kebijakan saat ini hanya mengizinkan 1 operator per pesantren. Cabut operator aktif pada ${targetPesantren.nama} terlebih dahulu atau ubah di Pengaturan.`,
      );
      return;
    }

    if (
      !allowMultiPesantrenPerOp &&
      existingInvite &&
      existingInvite.assignedPesantrenIds.some((id) => id !== targetPesantren.id)
    ) {
      setErrorBanner(
        `Kebijakan saat ini hanya mengizinkan 1 pesantren per operator. ${normalizedEmail} sudah ditugaskan ke lembaga lain.`,
      );
      return;
    }

    if (targetPesantren.assignedOperatorEmails.length >= BLUEPRINT_LIMITS.MAX_OPERATORS_PER_PESANTREN) {
      setErrorBanner(`Maksimal ${BLUEPRINT_LIMITS.MAX_OPERATORS_PER_PESANTREN} operator per pesantren.`);
      return;
    }

    setOpSaving(true);
    try {
      await assignOperatorToPesantren(db, user, {
        email: normalizedEmail,
        fullName: opName,
        phone: opPhone,
        pesantren: targetPesantren,
        existingInviteId: existingInvite?.id,
        existingAssignedPesantrenIds: existingInvite?.assignedPesantrenIds,
        existingLinkedUid: existingInvite?.linkedUid || undefined,
      });
      setFlashMsg(`Operator ${normalizedEmail} ditugaskan ke ${targetPesantren.nama}.`);
      setOpEmail('');
      setOpName('');
      setOpPhone('');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal menugaskan operator.');
    } finally {
      setOpSaving(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner('');
    setFlashMsg('');
    if (cfgKabupaten.trim().length < 2) {
      setErrorBanner('Nama kabupaten minimal 2 karakter.');
      return;
    }
    setCfgSaving(true);
    try {
      await saveSystemConfig(db, user, {
        kabupatenNama: cfgKabupaten.trim(),
        activePeriode: cfgPeriode,
        allowMultiOperatorPerPesantren: cfgMultiOpPerPs,
        allowMultiPesantrenPerOperator: cfgMultiPsPerOp,
        allowPostApprovalEdit: cfgPostApproval,
        publicDirectoryEnabled: cfgPublicDir,
      });
      setFlashMsg('Pengaturan sistem kabupaten berhasil disimpan.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setCfgSaving(false);
    }
  };

  const handleSeedDummy = async () => {
    setSeeding(true);
    setErrorBanner('');
    try {
      await seedDummyPesantrenData(db, user, selectedPeriode);
      const cleanAdmin = user.email.trim().toLowerCase();
      const demoEmail = cleanAdmin.endsWith('@gmail.com')
        ? cleanAdmin.replace(/@gmail\.com$/, '+operator@gmail.com')
        : 'operator.pesantren@contoh.id';
      setFlashMsg(
        `4 data contoh pesantren & undangan operator (${demoEmail}) berhasil dimuat.`,
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal memuat data contoh.');
    } finally {
      setSeeding(false);
    }
  };

  const navItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pesantren', label: 'Data Pesantren', icon: Building2 },
    { id: 'verifikasi', label: 'Verifikasi', icon: ClipboardCheck },
    { id: 'legalitas', label: 'Legalitas & IJOP', icon: FileCheck2 },
    { id: 'operator', label: 'Operator & Akses', icon: Users },
    { id: 'laporan', label: 'Laporan', icon: Download },
    { id: 'audit', label: 'Audit Log', icon: History },
    { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
  ];

  const operatorNavItems: { id: OperatorTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'ringkasan', label: 'Ringkasan', icon: LayoutDashboard },
    { id: 'lembaga', label: 'Lembaga Saya', icon: Building2 },
    { id: 'legalitas', label: 'Legalitas & IJOP', icon: FileCheck2 },
    { id: 'riwayat', label: 'Riwayat Pengajuan', icon: History },
  ];

  const activeNavLabel =
    !isOperatorView
      ? navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'
      : operatorNavItems.find((n) => n.id === operatorTab)?.label || 'Ringkasan';

  const openEditModal = (p: Pesantren | null) => {
    setEditingPesantren(p);
    setFormOpen(true);
  };

  const previewTargetList = useMemo(() => {
    if (!previewOperatorMode || previewPesantrenId === 'ALL') return pesantrenList;
    return pesantrenList.filter((p) => p.id === previewPesantrenId);
  }, [previewOperatorMode, previewPesantrenId, pesantrenList]);

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

        <nav aria-label="Menu Portal" className="flex-1 p-3 space-y-1">
          {!isOperatorView ? (
            navItems.map((item) => {
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
                  {item.id === 'verifikasi' && dashboardMetrics.menungguCount > 0 && (
                    <span
                      className={`ml-auto text-xs font-mono-num ${
                        isActive ? 'text-[#041D13] font-semibold' : 'text-emerald-400 font-semibold'
                      }`}
                    >
                      {dashboardMetrics.menungguCount}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            operatorNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = operatorTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOperatorTab(item.id)}
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
            })
          )}
        </nav>

        <div className="p-4 border-t border-white/[0.08] text-xs space-y-2">
          {user.role === 'super_admin' && (
            <button
              type="button"
              onClick={() => setPreviewOperatorMode((v) => !v)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left font-medium rounded-xl transition-colors ${
                previewOperatorMode
                  ? 'bg-emerald-500 border border-emerald-400 text-[#041D13] font-semibold'
                  : 'text-[#FAFAFA] bg-white/[0.04] border border-white/[0.12] hover:bg-white/[0.1]'
              }`}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>{previewOperatorMode ? 'Kembali ke Super Admin' : 'Pratinjau Portal Operator'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenPublicDirectory}
            className="w-full px-3 py-2 text-left font-medium text-[#E4E4E7] bg-white/[0.06] hover:bg-white/[0.12] rounded-xl transition-colors whitespace-nowrap"
          >
            Lihat Direktori Publik
          </button>
          <p className="text-[#71717A] truncate pt-1">{user.email}</p>
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
              {!isOperatorView ? (
                navItems.map((item) => {
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
                })
              ) : (
                operatorNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = operatorTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setOperatorTab(item.id);
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
                })
              )}
            </nav>
            <div className="p-4 border-t border-white/[0.08] space-y-2">
              {user.role === 'super_admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewOperatorMode((v) => !v);
                    setMobileNavOpen(false);
                  }}
                  className="w-full px-3 py-2 text-xs font-medium text-[#FAFAFA] bg-white/[0.04] border border-white/[0.12] hover:bg-white/[0.1] rounded-xl text-left"
                >
                  {previewOperatorMode ? 'Kembali ke Super Admin' : 'Pratinjau Portal Operator'}
                </button>
              )}
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
                {kabupatenNama} / {activeNavLabel}
              </p>
              <h1 className="text-base font-semibold text-[#FAFAFA] truncate">{activeNavLabel}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <label htmlFor="periode-select" className="sr-only">
              Pilih Periode Tahun Ajaran
            </label>
            <select
              id="periode-select"
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

            {user.role === 'super_admin' && (
              <button
                type="button"
                onClick={() => setPreviewOperatorMode((v) => !v)}
                className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 ${
                  previewOperatorMode
                    ? 'bg-emerald-500 border-emerald-400 text-[#041D13] font-semibold'
                    : 'bg-white/[0.05] border-white/[0.12] text-[#FAFAFA] hover:bg-white/[0.11]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{previewOperatorMode ? 'Kembali ke Admin' : 'Pratinjau Operator'}</span>
              </button>
            )}

            <span className="hidden sm:inline text-xs text-[#A1A1AA] whitespace-nowrap shrink-0">
              {user.role === 'super_admin' ? 'Super Admin Kemenag' : 'Operator Pesantren'}
            </span>

            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#E4E4E7] hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1280px] w-full mx-auto space-y-6">
          {/* Live Status Feedback */}
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

          {/* ================= OPERATOR & PREVIEW VIEW ================= */}
          {isOperatorView ? (
            <section className="space-y-6">
              {user.role === 'super_admin' && previewOperatorMode && (
                <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.12] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[#FAFAFA]">
                      Mode Pratinjau Portal Operator
                    </p>
                    <p className="text-xs text-[#A1A1AA]">
                      Anda sedang meninjau antarmuka Operator Pesantren tanpa mengubah hak akses akun asli.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {pesantrenList.length > 0 && (
                      <select
                        aria-label="Pilih pesantren untuk pratinjau"
                        value={previewPesantrenId}
                        onChange={(e) => setPreviewPesantrenId(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-[#0D0E12] text-[#FAFAFA] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none"
                      >
                        <option value="ALL">Semua Pesantren ({pesantrenList.length})</option>
                        {pesantrenList.map((ps) => (
                          <option key={ps.id} value={ps.id}>
                            {ps.nama}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setPreviewOperatorMode(false)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl whitespace-nowrap shrink-0 transition-colors"
                    >
                      Kembali ke Super Admin
                    </button>
                  </div>
                </div>
              )}

              {dataLoading ? (
                <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-6 space-y-3">
                  <div className="h-5 w-1/3 bg-white/[0.06] rounded animate-pulse" />
                  <div className="h-16 bg-white/[0.06] rounded animate-pulse" />
                </div>
              ) : previewTargetList.length === 0 ? (
                <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-8 text-center space-y-3">
                  <h2 className="text-lg font-semibold text-[#FAFAFA]">
                    {previewOperatorMode ? 'Belum Ada Pesantren untuk Dipratinjau' : 'Belum Ada Pesantren Ditugaskan'}
                  </h2>
                  <p className="text-sm text-[#A1A1AA] max-w-md mx-auto">
                    {previewOperatorMode
                      ? 'Kembali ke Dashboard Super Admin untuk menambah pesantren pertama atau memuat data contoh.'
                      : 'Akun operator Anda aktif, namun belum terhubung ke lembaga pesantren tertentu. Hubungi admin Kemenag Kabupaten untuk menugaskan lembaga Anda.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* ================= TAB 1: RINGKASAN ================= */}
                  {operatorTab === 'ringkasan' && (
                    <div className="space-y-6">
                      {/* 4 KPI Cards */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                        <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
                          <p className="text-xs text-[#A1A1AA]">Lembaga Ditugaskan</p>
                          <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                            {previewTargetList.length}
                          </p>
                          <p className="mt-1 text-[11px] text-[#71717A] font-medium">Aktif dalam pembinaan</p>
                        </div>
                        <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
                          <p className="text-xs text-[#A1A1AA]">Total Santri ({selectedPeriode})</p>
                          <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                            {previewTargetList.reduce((sum, p) => {
                              const dp = periodikMap[p.id];
                              return sum + (dp ? dp.santriLaki + dp.santriPerempuan : p.totalSantriLatest);
                            }, 0).toLocaleString('id-ID')}
                          </p>
                          <p className="mt-1 text-[11px] text-[#71717A]">Mukim &amp; Non-mukim</p>
                        </div>
                        <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
                          <p className="text-xs text-[#A1A1AA]">Tenaga Pendidik</p>
                          <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                            {previewTargetList.reduce((sum, p) => {
                              const dp = periodikMap[p.id];
                              return sum + (dp ? dp.ustadzCount + dp.ustadzahCount : p.totalPendidikLatest);
                            }, 0).toLocaleString('id-ID')}
                          </p>
                          <p className="mt-1 text-[11px] text-[#71717A]">Ustadz &amp; Ustadzah</p>
                        </div>
                        <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
                          <p className="text-xs text-[#A1A1AA]">Status Verifikasi</p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium font-mono-num">
                            <span className="text-[#FAFAFA] font-semibold whitespace-nowrap">
                              {previewTargetList.filter((p) => p.verificationStatus === 'disetujui').length} Disetujui
                            </span>
                            <span className="text-[#71717A]" aria-hidden="true">·</span>
                            <span className="text-[#A1A1AA] whitespace-nowrap">
                              {previewTargetList.filter((p) => p.verificationStatus === 'ditolak').length} Revisi
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-[#71717A] font-mono-num">
                            {previewTargetList.filter((p) => p.verificationStatus === 'draft').length} Draft
                          </p>
                        </div>
                      </div>

                      {/* Revision Alerts */}
                      {previewTargetList.some((p) => p.verificationStatus === 'ditolak') && (
                        <div className="bg-[#16181F] border border-white/[0.28] rounded-2xl p-5 space-y-3">
                          <h2 className="text-sm font-semibold text-white">Perhatian: Catatan Revisi dari Kemenag</h2>
                          <div className="divide-y divide-white/[0.08]">
                            {previewTargetList
                              .filter((p) => p.verificationStatus === 'ditolak')
                              .map((p) => (
                                <div key={p.id} className="pt-3 first:pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                  <div className="space-y-1">
                                    <p className="font-semibold text-[#FAFAFA]">{p.nama}</p>
                                    <p className="text-[#A1A1AA]">{p.catatanRevisi || 'Mohon perbarui data sesuai ketentuan.'}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(p)}
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
                            onClick={() => setOperatorTab('lembaga')}
                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:underline whitespace-nowrap shrink-0"
                          >
                            Kelola Semua →
                          </button>
                        </div>
                        <div className="divide-y divide-white/[0.06] text-sm">
                          {previewTargetList.map((p) => {
                            const leg = legalitasMap[p.id] || null;
                            const dp = periodikMap[p.id] || null;
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
                                    onClick={() => openEditModal(p)}
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
                  {operatorTab === 'lembaga' && (
                    <div className="space-y-5">
                      <div>
                        <h2 className="text-lg font-semibold text-[#FAFAFA]">Pengelolaan Lembaga Pesantren</h2>
                        <p className="text-xs text-[#A1A1AA] mt-0.5">
                          Lengkapi profil pokok, data santri, tenaga pendidik, dan sarana prasarana untuk tahun ajaran {selectedPeriode}.
                        </p>
                      </div>

                      {previewTargetList.map((p) => {
                        const leg = legalitasMap[p.id] || null;
                        const dp = periodikMap[p.id] || null;
                        const comp = calculateCompleteness(p, leg, dp);
                        const canSubmit =
                          p.verificationStatus === 'draft' || p.verificationStatus === 'ditolak';

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

                            {p.verificationStatus === 'ditolak' && p.catatanRevisi && (
                              <div className="p-4 rounded-xl bg-[#0D0E12] border border-white/[0.25] text-sm text-[#FAFAFA]">
                                <p className="font-semibold">Catatan Revisi dari Kemenag:</p>
                                <p className="mt-1 text-[#A1A1AA]">{p.catatanRevisi}</p>
                              </div>
                            )}

                            {(p.ijopStatusSummary === 'kedaluwarsa' ||
                              p.ijopStatusSummary === 'segera_berakhir') && (
                              <div className="p-3 rounded-xl bg-white/[0.05] border border-white/[0.14] text-xs text-[#E4E4E7]">
                                Perhatian Legalitas: Status IJOP saat ini{' '}
                                <strong className="text-white">{IJOP_LABELS[p.ijopStatusSummary]}</strong>
                                {leg?.tanggalBerakhir ? ` (Berakhir ${leg.tanggalBerakhir})` : ''}.
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
                                  onClick={() => openEditModal(p)}
                                  className="px-4 py-2 text-sm font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.12] rounded-xl transition-colors whitespace-nowrap shrink-0"
                                >
                                  {canSubmit ? 'Lengkapi / Ubah Data' : 'Lihat Detail Data'}
                                </button>
                                {canSubmit && (
                                  previewOperatorMode ? (
                                    <button
                                      type="button"
                                      disabled
                                      title="Pengajuan aktif hanya saat masuk dengan akun Operator asli"
                                      className="px-4 py-2 text-sm font-medium text-[#71717A] bg-white/[0.06] border border-white/[0.08] rounded-xl cursor-not-allowed whitespace-nowrap shrink-0"
                                    >
                                      Ajukan Verifikasi (Mode Pratinjau)
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => triggerStatusTransition(p, 'diajukan')}
                                      className="px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors whitespace-nowrap shrink-0"
                                    >
                                      Ajukan Verifikasi
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {/* ================= TAB 3: LEGALITAS & IJOP ================= */}
                  {operatorTab === 'legalitas' && (
                    <div className="space-y-5">
                      <div>
                        <h2 className="text-lg font-semibold text-[#FAFAFA]">Legalitas &amp; Izin Operasional (IJOP)</h2>
                        <p className="text-xs text-[#A1A1AA] mt-0.5">
                          Informasi nomor SK IJOP, tanggal terbit, masa berlaku, dan riwayat dokumen lembaga.
                        </p>
                      </div>

                      {previewTargetList.map((p) => {
                        const leg = legalitasMap[p.id] || null;
                        const historyList = legalitasHistoryList.filter((h) => h.pesantrenId === p.id);

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
                    </div>
                  )}

                  {/* ================= TAB 4: RIWAYAT PENGAJUAN ================= */}
                  {operatorTab === 'riwayat' && (
                    <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                      <div>
                        <h2 className="text-lg font-semibold text-[#FAFAFA]">Riwayat Status Verifikasi</h2>
                        <p className="text-xs text-[#A1A1AA] mt-0.5">
                          Jejak log pengajuan verifikasi, tanggapan Kemenag, dan catatan revisi.
                        </p>
                      </div>

                      {verifikasiLogs.length === 0 ? (
                        <p className="text-sm text-[#A1A1AA] py-6 text-center">Belum ada riwayat pengajuan verifikasi.</p>
                      ) : (
                        <div className="divide-y divide-white/[0.06] text-sm">
                          {verifikasiLogs.map((log) => (
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
                                {formatTimestamp(log.createdAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <>
              {/* ================= ADMIN: DASHBOARD ================= */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  {!dataLoading && pesantrenList.length === 0 && (
                    <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.1] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-base font-semibold text-[#FAFAFA]">Database Pesantren Masih Kosong</h2>
                        <p className="text-sm text-[#A1A1AA] mt-1">
                          Tambahkan pesantren pertama atau muat 4 data contoh fiktif untuk menguji dashboard, peta publik, dan alur verifikasi.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                          type="button"
                          disabled={seeding}
                          onClick={handleSeedDummy}
                          className="px-4 py-2 text-sm font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.12] rounded-xl transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          {seeding ? 'Memuat...' : 'Muat Data Contoh (Dummy)'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(null)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tambah Pesantren</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 4 Dark Monochrome + Emerald KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                    <div className="bg-gradient-to-br from-[#171920] via-[#121619] to-[#0E1A16] border border-emerald-500/20 rounded-2xl p-4 sm:p-5">
                      <p className="text-xs text-[#A1A1AA]">Total Pesantren Terdata</p>
                      <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                        {dashboardMetrics.totalPesantren.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
                      <p className="text-xs text-[#A1A1AA]">Total Santri ({selectedPeriode})</p>
                      <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                        {dashboardMetrics.totalSantri.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
                      <p className="text-xs text-[#A1A1AA]">Tenaga Pendidik</p>
                      <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                        {dashboardMetrics.totalPendidik.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
                      <p className="text-xs text-[#A1A1AA]">Disetujui / Menunggu</p>
                      <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono-num text-[#FAFAFA]">
                        {dashboardMetrics.disetujuiCount} / {dashboardMetrics.menungguCount}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Kecamatan Breakdown */}
                    <section className="bg-[#131419] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-[#FAFAFA]">Sebaran per Kecamatan</h2>
                        <span className="text-xs text-[#71717A] font-mono-num">
                          {dashboardMetrics.kecamatanBars.length} kecamatan
                        </span>
                      </div>
                      {dashboardMetrics.kecamatanBars.length === 0 ? (
                        <p className="text-sm text-[#71717A]">Belum ada data wilayah.</p>
                      ) : (
                        <div className="space-y-3">
                          {dashboardMetrics.kecamatanBars.map(([kec, count]) => {
                            const max = dashboardMetrics.kecamatanBars[0]?.[1] || 1;
                            const pct = Math.round((count / max) * 100);
                            return (
                              <div key={kec} className="space-y-1.5">
                                <div className="flex justify-between text-xs">
                                  <span className="text-[#FAFAFA] font-medium">{kec}</span>
                                  <span className="font-mono-num text-[#A1A1AA]">{count} lembaga</span>
                                </div>
                                <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* IJOP Alerts */}
                    <section className="bg-[#131419] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-[#FAFAFA]">Notifikasi Legalitas &amp; IJOP</h2>
                        <button
                          type="button"
                          onClick={() => setActiveTab('legalitas')}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:underline whitespace-nowrap shrink-0"
                        >
                          Kelola Legalitas
                        </button>
                      </div>
                      {dashboardMetrics.ijopAlerts.length === 0 ? (
                        <p className="text-sm text-[#A1A1AA]">
                          Semua lembaga memiliki masa berlaku IJOP aktif.
                        </p>
                      ) : (
                        <ul className="divide-y divide-white/[0.06] text-sm">
                          {dashboardMetrics.ijopAlerts.slice(0, 5).map((p) => (
                            <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-[#FAFAFA]">{p.nama}</p>
                                <p className="text-xs text-[#71717A]">
                                  {p.kecamatan} · Berakhir {p.ijopExpiredAt || '-'}
                                </p>
                              </div>
                              <span
                                className={`text-xs whitespace-nowrap ${
                                  p.ijopStatusSummary === 'kedaluwarsa'
                                    ? 'text-white font-semibold underline decoration-white/40 underline-offset-4'
                                    : 'text-[#A1A1AA] font-medium'
                                }`}
                              >
                                {IJOP_LABELS[p.ijopStatusSummary]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>

                  {/* Pending Verification Preview */}
                  <section className="bg-[#131419] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-[#FAFAFA]">Antrean Verifikasi Masuk</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('verifikasi')}
                        className="text-xs font-medium text-[#E4E4E7] hover:text-white hover:underline whitespace-nowrap shrink-0"
                      >
                        Buka Halaman Verifikasi
                      </button>
                    </div>
                    {dashboardMetrics.pendingList.length === 0 ? (
                      <p className="text-sm text-[#A1A1AA]">
                        Tidak ada pengajuan menunggu verifikasi saat ini.
                      </p>
                    ) : (
                      <div className="divide-y divide-white/[0.06] text-sm">
                        {dashboardMetrics.pendingList.slice(0, 5).map((p) => (
                          <div key={p.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-[#FAFAFA]">{p.nama}</p>
                              <p className="text-xs text-[#71717A]">
                                {p.kecamatan} · Status: {STATUS_LABELS[p.verificationStatus]}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveTab('verifikasi')}
                              className="px-3 py-1.5 text-xs font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] rounded-xl whitespace-nowrap shrink-0 transition-colors"
                            >
                              Tinjau Pengajuan
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* ================= ADMIN: DATA PESANTREN ================= */}
              {activeTab === 'pesantren' && (
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="search"
                        aria-label="Cari pesantren"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari nama, NSPP, desa..."
                        className="px-3 py-2 text-sm bg-[#0D0E12] text-[#FAFAFA] placeholder:text-[#71717A] border border-white/[0.14] rounded-xl w-56 focus:border-emerald-400/70 focus:outline-none"
                      />
                      <select
                        aria-label="Filter kecamatan"
                        value={filterKecamatan}
                        onChange={(e) => setFilterKecamatan(e.target.value)}
                        className="px-3 py-2 text-sm bg-[#0D0E12] text-[#FAFAFA] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none"
                      >
                        <option value="ALL">Semua Kecamatan</option>
                        {kecamatanList.map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Filter status verifikasi"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as 'ALL' | VerificationStatus)}
                        className="px-3 py-2 text-sm bg-[#0D0E12] text-[#FAFAFA] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none"
                      >
                        <option value="ALL">Semua Status</option>
                        {Object.entries(STATUS_LABELS).map(([k, lbl]) => (
                          <option key={k} value={k}>{lbl}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => openEditModal(null)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Pesantren</span>
                    </button>
                  </div>

                  <div tabIndex={0} role="region" aria-label="Tabel Data Pesantren" className="table-region bg-[#131419] border border-white/[0.08] rounded-2xl overflow-hidden">
                    <table className="text-left text-sm">
                      <thead className="bg-[#181A22] text-xs font-medium text-[#A1A1AA] border-b border-white/[0.08]">
                        <tr>
                          <th className="py-3.5 px-4">Nama Pesantren</th>
                          <th className="py-3.5 px-4">NSPP</th>
                          <th className="py-3.5 px-4">Kecamatan</th>
                          <th className="py-3.5 px-4 text-right">Santri</th>
                          <th className="py-3.5 px-4">Status IJOP</th>
                          <th className="py-3.5 px-4">Verifikasi</th>
                          <th className="py-3.5 px-4 text-right">Lengkap</th>
                          <th className="py-3.5 px-4 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {filteredPesantren.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-[#A1A1AA]">
                              Tidak ada data pesantren yang sesuai.
                            </td>
                          </tr>
                        ) : (
                          filteredPesantren.map((p) => {
                            const comp = calculateCompleteness(p, legalitasMap[p.id] || null, periodikMap[p.id] || null);
                            return (
                              <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                                <th scope="row" className="py-3 px-4 font-medium text-[#FAFAFA]">
                                  <div>{p.nama}</div>
                                  <div className="text-xs font-normal text-[#71717A]">
                                    {p.assignedOperatorEmails.length > 0
                                      ? `Op: ${p.assignedOperatorEmails.join(', ')}`
                                      : 'Belum ada operator'}
                                  </div>
                                </th>
                                <td className="py-3 px-4 font-mono-num text-xs text-[#A1A1AA]">{p.nspp || '-'}</td>
                                <td className="py-3 px-4 text-[#A1A1AA]">{p.kecamatan}</td>
                                <td className="py-3 px-4 text-right font-mono-num text-[#FAFAFA]">
                                  {(periodikMap[p.id]
                                    ? periodikMap[p.id].santriLaki + periodikMap[p.id].santriPerempuan
                                    : p.totalSantriLatest
                                  ).toLocaleString('id-ID')}
                                </td>
                                <td className="py-3 px-4 text-xs">
                                  <span
                                    className={
                                      p.ijopStatusSummary === 'aktif'
                                        ? 'text-[#FAFAFA] font-semibold'
                                        : 'text-[#A1A1AA] font-medium'
                                    }
                                  >
                                    {IJOP_LABELS[p.ijopStatusSummary]}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-xs font-medium text-[#E4E4E7]">
                                  {STATUS_LABELS[p.verificationStatus]}
                                </td>
                                <td className="py-3 px-4 text-right font-mono-num text-xs text-[#E4E4E7]">
                                  {comp.percent}%
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(p)}
                                    className="px-2.5 py-1 text-xs font-medium text-[#FAFAFA] bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] rounded-lg transition-colors"
                                  >
                                    Kelola
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ================= ADMIN: VERIFIKASI ================= */}
              {activeTab === 'verifikasi' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        ['PENDING', 'Menunggu Verifikasi'],
                        ['ALL', 'Semua Lembaga'],
                        ['diajukan', 'Diajukan'],
                        ['diverifikasi', 'Diverifikasi'],
                        ['disetujui', 'Disetujui'],
                        ['ditolak', 'Perlu Revisi'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setVerQueueFilter(key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 ${
                          verQueueFilter === key
                            ? 'bg-emerald-500 border-emerald-400 text-[#041D13] font-semibold'
                            : 'bg-[#131419] border-white/[0.1] text-[#A1A1AA] hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {verificationQueue.length === 0 ? (
                      <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-8 text-center text-sm text-[#A1A1AA]">
                        Tidak ada pesantren pada filter status ini.
                      </div>
                    ) : (
                      verificationQueue.map((p) => {
                        const leg = legalitasMap[p.id] || null;
                        const dp = periodikMap[p.id] || null;
                        const comp = calculateCompleteness(p, leg, dp);
                        return (
                          <div
                            key={p.id}
                            className="bg-gradient-to-br from-[#171920] to-[#111217] border border-white/[0.08] rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className={`font-semibold ${p.verificationStatus === 'disetujui' ? 'text-emerald-400' : 'text-[#FAFAFA]'}`}>
                                  {STATUS_LABELS[p.verificationStatus]}
                                </span>
                                <span aria-hidden="true" className="text-[#71717A]">·</span>
                                <span className="text-[#A1A1AA] font-mono-num">
                                  Kelengkapan {comp.percent}%
                                </span>
                                <span aria-hidden="true" className="text-[#71717A]">·</span>
                                <span className="text-[#A1A1AA]">{p.kecamatan}</span>
                              </div>
                              <h3 className="text-base font-semibold text-[#FAFAFA]">{p.nama}</h3>
                              <p className="text-xs text-[#A1A1AA]">
                                IJOP: {leg?.nomorIjop || 'Belum ada'} ({IJOP_LABELS[p.ijopStatusSummary]}) ·
                                Santri: {dp ? dp.santriLaki + dp.santriPerempuan : p.totalSantriLatest} ·
                                Pendidik: {dp ? dp.ustadzCount + dp.ustadzahCount : p.totalPendidikLatest}
                              </p>
                              {p.catatanRevisi && (
                                <p className="text-xs text-white font-medium">Catatan: {p.catatanRevisi}</p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditModal(p)}
                                className="px-3 py-1.5 text-xs font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] rounded-xl whitespace-nowrap shrink-0 transition-colors"
                              >
                                Periksa Data
                              </button>
                              {p.verificationStatus === 'diajukan' && (
                                <button
                                  type="button"
                                  onClick={() => triggerStatusTransition(p, 'diverifikasi')}
                                  className="px-3 py-1.5 text-xs font-medium text-[#FAFAFA] border border-white/[0.2] hover:bg-white/[0.1] rounded-xl whitespace-nowrap shrink-0 transition-colors"
                                >
                                  Verifikasi Berkas
                                </button>
                              )}
                              {(p.verificationStatus === 'diajukan' ||
                                p.verificationStatus === 'diverifikasi') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => triggerStatusTransition(p, 'disetujui')}
                                    className="px-3 py-1.5 text-xs font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl whitespace-nowrap shrink-0 transition-colors"
                                  >
                                    Setujui &amp; Publikasikan
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => triggerStatusTransition(p, 'ditolak')}
                                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#0D0E12] border border-white/[0.35] hover:bg-white hover:text-[#09090B] rounded-xl whitespace-nowrap shrink-0 transition-colors"
                                  >
                                    Tolak / Revisi
                                  </button>
                                </>
                              )}
                              {p.verificationStatus === 'disetujui' && (
                                <button
                                  type="button"
                                  onClick={() => triggerStatusTransition(p, 'draft')}
                                  className="px-3 py-1.5 text-xs font-medium text-[#FAFAFA] border border-white/[0.18] bg-white/[0.06] hover:bg-white/[0.12] rounded-xl whitespace-nowrap shrink-0 transition-colors"
                                >
                                  Buka Revisi
                                </button>
                              )}
                              {p.verificationStatus === 'ditolak' && (
                                <button
                                  type="button"
                                  onClick={() => triggerStatusTransition(p, 'draft')}
                                  className="px-3 py-1.5 text-xs font-medium text-[#A1A1AA] border border-white/[0.15] hover:bg-white/[0.08] hover:text-white rounded-xl whitespace-nowrap shrink-0 transition-colors"
                                >
                                  Kembalikan ke Draft
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Riwayat Verifikasi */}
                  <section className="bg-[#131419] border border-white/[0.08] rounded-2xl p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-[#FAFAFA]">Riwayat Perubahan Status Verifikasi</h2>
                    <div className="table-region">
                      <table className="text-left text-xs">
                        <thead className="bg-[#181A22] text-[#A1A1AA]">
                          <tr>
                            <th className="py-2.5 px-3">Waktu</th>
                            <th className="py-2.5 px-3">Pesantren</th>
                            <th className="py-2.5 px-3">Transisi</th>
                            <th className="py-2.5 px-3">Aktor</th>
                            <th className="py-2.5 px-3">Catatan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {verifikasiLogs.slice(0, 20).map((log) => (
                            <tr key={log.id}>
                              <td className="py-2.5 px-3 font-mono-num text-[#71717A] whitespace-nowrap">
                                {formatTimestamp(log.createdAt)}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-[#FAFAFA]">{log.pesantrenNama}</td>
                              <td className="py-2.5 px-3 text-[#E4E4E7]">
                                {STATUS_LABELS[log.fromStatus]} → {STATUS_LABELS[log.toStatus]}
                              </td>
                              <td className="py-2.5 px-3 text-[#A1A1AA]">
                                {log.actorEmail || log.actorRole}
                              </td>
                              <td className="py-2.5 px-3 text-[#A1A1AA]">{log.catatanRevisi || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* ================= ADMIN: LEGALITAS & IJOP ================= */}
              {activeTab === 'legalitas' && (
                <div className="space-y-4">
                  <div className="table-region bg-[#131419] border border-white/[0.08] rounded-2xl overflow-hidden">
                    <table className="text-left text-sm">
                      <thead className="bg-[#181A22] text-xs font-medium text-[#A1A1AA] border-b border-white/[0.08]">
                        <tr>
                          <th className="py-3.5 px-4">Pesantren</th>
                          <th className="py-3.5 px-4">Nomor SK IJOP</th>
                          <th className="py-3.5 px-4">Terbit</th>
                          <th className="py-3.5 px-4">Berakhir</th>
                          <th className="py-3.5 px-4">Status IJOP</th>
                          <th className="py-3.5 px-4">Dokumen</th>
                          <th className="py-3.5 px-4 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {pesantrenList.map((p) => {
                          const leg = legalitasMap[p.id];
                          const safeLink = leg?.dokumenUrl && isSafeHttpsUrl(leg.dokumenUrl) ? leg.dokumenUrl : '';
                          return (
                            <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                              <th scope="row" className="py-3 px-4 font-medium text-[#FAFAFA]">
                                <div>{p.nama}</div>
                                <div className="text-xs font-normal text-[#71717A]">{p.kecamatan}</div>
                              </th>
                              <td className="py-3 px-4 font-mono-num text-xs text-[#E4E4E7]">{leg?.nomorIjop || '-'}</td>
                              <td className="py-3 px-4 font-mono-num text-xs text-[#A1A1AA]">{leg?.tanggalTerbit || '-'}</td>
                              <td className="py-3 px-4 font-mono-num text-xs text-[#A1A1AA]">{leg?.tanggalBerakhir || '-'}</td>
                              <td className="py-3 px-4 text-xs font-medium">
                                <span
                                  className={
                                    p.ijopStatusSummary === 'aktif'
                                      ? 'text-[#FAFAFA] font-semibold'
                                      : 'text-[#A1A1AA]'
                                  }
                                >
                                  {IJOP_LABELS[p.ijopStatusSummary]}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs">
                                {safeLink ? (
                                  <a
                                    href={safeLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white underline hover:text-zinc-300"
                                  >
                                    {leg?.dokumenNama || 'Buka SK'}
                                  </a>
                                ) : (
                                  <span className="text-[#71717A]">{leg?.dokumenNama || '-'}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(p)}
                                  className="px-2.5 py-1 text-xs font-medium text-[#FAFAFA] bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] rounded-lg whitespace-nowrap transition-colors"
                                >
                                  Perbarui IJOP
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ================= ADMIN: OPERATOR & AKSES ================= */}
              {activeTab === 'operator' && (
                <div className="space-y-6">
                  <form
                    onSubmit={handleAssignOperator}
                    className="bg-[#131419] border border-white/[0.08] rounded-2xl p-5 space-y-4"
                  >
                    <div>
                      <h2 className="text-base font-semibold text-[#FAFAFA]">Daftarkan &amp; Tugaskan Operator Pesantren</h2>
                      <p className="text-xs text-[#A1A1AA] mt-1">
                        Operator dapat masuk menggunakan Google Sign-In maupun Email &amp; Kata Sandi (melalui tab Aktivasi Akun) memakai email yang didaftarkan di sini.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label htmlFor="op-email" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                          Email Operator *
                        </label>
                        <input
                          id="op-email"
                          type="email"
                          required
                          value={opEmail}
                          onChange={(e) => setOpEmail(e.target.value)}
                          placeholder="operator@pesantren.sch.id"
                          className="field-input w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-emerald-400/70 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="op-name" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                          Nama Lengkap *
                        </label>
                        <input
                          id="op-name"
                          required
                          minLength={2}
                          value={opName}
                          onChange={(e) => setOpName(e.target.value)}
                          placeholder="Ustadz Ahmad"
                          className="field-input w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-emerald-400/70 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="op-phone" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                          Telepon / WA
                        </label>
                        <input
                          id="op-phone"
                          value={opPhone}
                          onChange={(e) => setOpPhone(e.target.value)}
                          placeholder="0812..."
                          className="w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-emerald-400/70 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="op-pesantren" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                          Pesantren Tujuan *
                        </label>
                        <select
                          id="op-pesantren"
                          required
                          value={opPesantrenId}
                          onChange={(e) => setOpPesantrenId(e.target.value)}
                          className="w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] focus:border-emerald-400/70 focus:outline-none"
                        >
                          {pesantrenList.length === 0 ? (
                            <option value="">Tambah pesantren dulu</option>
                          ) : (
                            pesantrenList.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nama}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={opSaving || pesantrenList.length === 0}
                        className="px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                      >
                        {opSaving ? 'Menyimpan...' : 'Tugaskan Operator'}
                      </button>
                    </div>
                  </form>

                  <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-[#FAFAFA]">Daftar Operator &amp; Hak Akses Aktif</h2>
                    <div className="table-region">
                      <table className="text-left text-sm">
                        <thead className="bg-[#181A22] text-xs font-medium text-[#A1A1AA]">
                          <tr>
                            <th className="py-2.5 px-3">Operator</th>
                            <th className="py-2.5 px-3">Status Akun</th>
                            <th className="py-2.5 px-3">Pesantren Ditugaskan</th>
                            <th className="py-2.5 px-3 text-right">Aksi Akun</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {invites.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-[#71717A]">
                                Belum ada operator yang didaftarkan.
                              </td>
                            </tr>
                          ) : (
                            invites.map((inv) => {
                              const linkedPesantren = pesantrenList.filter((ps) =>
                                ps.assignedOperatorEmails
                                  .map((e) => e.toLowerCase())
                                  .includes(inv.email.toLowerCase()),
                              );
                              return (
                                <tr key={inv.id}>
                                  <td className="py-3 px-3 text-[#FAFAFA]">
                                    <div className="font-medium">{inv.fullName}</div>
                                    <div className="text-xs text-[#71717A]">
                                      {inv.email} {inv.phone ? `· ${inv.phone}` : ''}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-xs">
                                    <span className={inv.isActive ? 'text-white font-semibold' : 'text-[#A1A1AA] font-medium'}>
                                      {inv.isActive ? 'Aktif' : 'Nonaktif'}
                                    </span>
                                    <div className="text-[#71717A]">
                                      {inv.linkedUid ? 'Sudah login Google' : 'Menunggu login pertama'}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-xs space-y-1 text-[#E4E4E7]">
                                    {linkedPesantren.length === 0 ? (
                                      <span className="text-[#71717A]">Tidak ada penugasan aktif</span>
                                    ) : (
                                      linkedPesantren.map((ps) => (
                                        <div key={ps.id} className="flex items-center gap-2">
                                          <span>{ps.nama}</span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              revokeOperatorFromPesantren(db, user, ps, inv.email, inv.linkedUid)
                                                .then(() => setFlashMsg(`Akses ${inv.email} pada ${ps.nama} dicabut.`))
                                                .catch((err) => setErrorBanner(err.message))
                                            }
                                            className="text-white underline hover:text-zinc-300"
                                          >
                                            Cabut
                                          </button>
                                        </div>
                                      ))
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleOperatorActive(db, user, inv.id, inv.email, inv.linkedUid, !inv.isActive)
                                          .then(() =>
                                            setFlashMsg(
                                              `Akun ${inv.email} ${!inv.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`,
                                            ),
                                          )
                                          .catch((err) => setErrorBanner(err.message))
                                      }
                                      className="px-3 py-1 text-xs font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] rounded-xl whitespace-nowrap transition-colors"
                                    >
                                      {inv.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {assignments.length > 0 && (
                    <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-5 space-y-3">
                      <h2 className="text-sm font-semibold text-[#FAFAFA]">Riwayat Penugasan Operator</h2>
                      <div className="table-region">
                        <table className="text-left text-xs">
                          <thead className="bg-[#181A22] text-[#A1A1AA]">
                            <tr>
                              <th className="py-2 px-3">Waktu</th>
                              <th className="py-2 px-3">Operator</th>
                              <th className="py-2 px-3">Pesantren</th>
                              <th className="py-2 px-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {assignments.slice(0, 15).map((asg) => (
                              <tr key={asg.id}>
                                <td className="py-2 px-3 font-mono-num text-[#71717A]">
                                  {formatTimestamp(asg.createdAt)}
                                </td>
                                <td className="py-2 px-3 text-[#A1A1AA]">{asg.operatorEmail}</td>
                                <td className="py-2 px-3 font-medium text-[#FAFAFA]">{asg.pesantrenNama}</td>
                                <td className="py-2 px-3 text-[#E4E4E7]">{asg.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ================= ADMIN: LAPORAN ================= */}
              {activeTab === 'laporan' && (
                <div className="space-y-4">
                  <div className="bg-[#131419] border border-white/[0.08] rounded-2xl p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="rep-kec" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                          Kecamatan
                        </label>
                        <select
                          id="rep-kec"
                          value={reportKecamatan}
                          onChange={(e) => setReportKecamatan(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-[#0D0E12] text-[#FAFAFA] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none"
                        >
                          <option value="ALL">Semua Kecamatan</option>
                          {kecamatanList.map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="rep-status" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                          Status Verifikasi
                        </label>
                        <select
                          id="rep-status"
                          value={reportStatus}
                          onChange={(e) => setReportStatus(e.target.value as 'ALL' | VerificationStatus)}
                          className="w-full px-3 py-2 text-sm bg-[#0D0E12] text-[#FAFAFA] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none"
                        >
                          <option value="ALL">Semua Status</option>
                          {Object.entries(STATUS_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>{lbl}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="rep-ijop" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                          Status IJOP
                        </label>
                        <select
                          id="rep-ijop"
                          value={reportIjop}
                          onChange={(e) => setReportIjop(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-[#0D0E12] text-[#FAFAFA] border border-white/[0.14] rounded-xl focus:border-emerald-400/70 focus:outline-none"
                        >
                          <option value="ALL">Semua IJOP</option>
                          {Object.entries(IJOP_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>{lbl}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={reportRows.length === 0}
                        onClick={() => exportPesantrenExcel(reportRows, kabupatenNama, selectedPeriode)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.12] rounded-xl disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Ekspor Excel (.xlsx)</span>
                      </button>
                      <button
                        type="button"
                        disabled={reportRows.length === 0}
                        onClick={() =>
                          exportPesantrenPdf(reportRows, kabupatenNama, selectedPeriode, reportKecamatan)
                        }
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Ekspor PDF (.pdf)</span>
                      </button>
                    </div>
                  </div>

                  <div className="table-region bg-[#131419] border border-white/[0.08] rounded-2xl overflow-hidden">
                    <table className="text-left text-sm">
                      <thead className="bg-[#181A22] text-xs font-medium text-[#A1A1AA] border-b border-white/[0.08]">
                        <tr>
                          <th className="py-3.5 px-4">Nama Pesantren</th>
                          <th className="py-3.5 px-4">Kecamatan</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4">IJOP</th>
                          <th className="py-3.5 px-4 text-right">Santri</th>
                          <th className="py-3.5 px-4 text-right">Pendidik</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {reportRows.map(({ pesantren: p, periodik: dp }) => (
                          <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="py-3 px-4 font-medium text-[#FAFAFA]">{p.nama}</td>
                            <td className="py-3 px-4 text-[#A1A1AA]">{p.kecamatan}</td>
                            <td className="py-3 px-4 text-xs text-[#E4E4E7]">{STATUS_LABELS[p.verificationStatus]}</td>
                            <td className="py-3 px-4 text-xs text-[#A1A1AA]">{IJOP_LABELS[p.ijopStatusSummary]}</td>
                            <td className="py-3 px-4 text-right font-mono-num text-[#FAFAFA]">
                              {(dp ? dp.santriLaki + dp.santriPerempuan : p.totalSantriLatest).toLocaleString('id-ID')}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-num text-[#E4E4E7]">
                              {(dp ? dp.ustadzCount + dp.ustadzahCount : p.totalPendidikLatest).toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ================= ADMIN: AUDIT LOG ================= */}
              {activeTab === 'audit' && (
                <div className="table-region bg-[#131419] border border-white/[0.08] rounded-2xl overflow-hidden">
                  <table className="text-left text-xs">
                    <thead className="bg-[#181A22] text-[#A1A1AA] border-b border-white/[0.08]">
                      <tr>
                        <th className="py-3.5 px-4">Waktu</th>
                        <th className="py-3.5 px-4">Aktor</th>
                        <th className="py-3.5 px-4">Aksi</th>
                        <th className="py-3.5 px-4">Ringkasan Aktivitas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-[#71717A]">
                            Belum ada log aktivitas tercatat.
                          </td>
                        </tr>
                      ) : (
                        auditLogs.slice(0, 50).map((log) => (
                          <tr key={log.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="py-2.5 px-4 font-mono-num text-[#71717A] whitespace-nowrap">
                              {formatTimestamp(log.createdAt)}
                            </td>
                            <td className="py-2.5 px-4 text-[#A1A1AA]">
                              {log.actorEmail} ({log.actorRole})
                            </td>
                            <td className="py-2.5 px-4 font-mono-num font-medium text-[#E4E4E7]">{log.action}</td>
                            <td className="py-2.5 px-4 text-[#FAFAFA]">{log.summary}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ================= ADMIN: PENGATURAN ================= */}
              {activeTab === 'pengaturan' && (
                <form
                  onSubmit={handleSaveConfig}
                  className="bg-[#131419] border border-white/[0.08] rounded-2xl p-6 max-w-2xl space-y-5"
                >
                  <div>
                    <h2 className="text-base font-semibold text-[#FAFAFA]">Konfigurasi Kebijakan Pendataan Kabupaten</h2>
                    <p className="text-xs text-[#A1A1AA] mt-1">
                      Pengaturan ini menyesuaikan kebijakan Kemenag Kabupaten tanpa perlu mengubah kode aplikasi.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="cfg-kab" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                        Nama Kabupaten / Kota
                      </label>
                      <input
                        id="cfg-kab"
                        required
                        minLength={2}
                        value={cfgKabupaten}
                        onChange={(e) => setCfgKabupaten(e.target.value)}
                        className="field-input w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] focus:border-emerald-400/70 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="cfg-periode" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                        Tahun Ajaran Aktif Default
                      </label>
                      <select
                        id="cfg-periode"
                        value={cfgPeriode}
                        onChange={(e) => setCfgPeriode(e.target.value)}
                        className="w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] focus:border-emerald-400/70 focus:outline-none"
                      >
                        {PERIODE_OPTIONS.map((pr) => (
                          <option key={pr} value={pr}>{pr}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-white/[0.08] pt-4 text-sm">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={cfgMultiOpPerPs}
                        onChange={(e) => setCfgMultiOpPerPs(e.target.checked)}
                        className="mt-1 accent-emerald-500"
                      />
                      <span>
                        <strong className="block font-medium text-[#FAFAFA]">Izinkan Multi-Operator per Pesantren</strong>
                        <span className="text-xs text-[#71717A]">
                          Jika dinonaktifkan, satu pesantren maksimal hanya memiliki satu operator aktif.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={cfgMultiPsPerOp}
                        onChange={(e) => setCfgMultiPsPerOp(e.target.checked)}
                        className="mt-1 accent-emerald-500"
                      />
                      <span>
                        <strong className="block font-medium text-[#FAFAFA]">Izinkan Satu Operator Mengelola Beberapa Pesantren</strong>
                        <span className="text-xs text-[#71717A]">
                          Berguna untuk yayasan dengan lebih dari satu unit pesantren.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={cfgPostApproval}
                        onChange={(e) => setCfgPostApproval(e.target.checked)}
                        className="mt-1 accent-emerald-500"
                      />
                      <span>
                        <strong className="block font-medium text-[#FAFAFA]">Izinkan Pembukaan Revisi Pasca-Persetujuan</strong>
                        <span className="text-xs text-[#71717A]">
                          Admin Kemenag dapat mengembalikan status Disetujui menjadi Draft jika diperlukan pembaruan.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={cfgPublicDir}
                        onChange={(e) => setCfgPublicDir(e.target.checked)}
                        className="mt-1 accent-emerald-500"
                      />
                      <span>
                        <strong className="block font-medium text-[#FAFAFA]">Aktifkan Direktori &amp; Peta Publik Pesantren</strong>
                        <span className="text-xs text-[#71717A]">
                          Menampilkan lembaga aktif yang telah disetujui kepada masyarakat umum.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={cfgSaving}
                      className="px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl disabled:opacity-60 whitespace-nowrap shrink-0 transition-colors"
                    >
                      {cfgSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </main>
      </div>

      {/* Shared Pesantren Form Modal */}
      <PesantrenFormModal
        open={formOpen}
        user={user}
        pesantren={editingPesantren}
        legalitas={editingPesantren ? legalitasMap[editingPesantren.id] || null : null}
        legalitasHistory={
          editingPesantren
            ? legalitasHistoryList.filter((h) => h.pesantrenId === editingPesantren.id)
            : []
        }
        periodik={editingPesantren ? periodikMap[editingPesantren.id] || null : null}
        activePeriode={selectedPeriode}
        onClose={() => {
          setFormOpen(false);
          setEditingPesantren(null);
        }}
        onSaved={(msg) => {
          setFormOpen(false);
          setEditingPesantren(null);
          setFlashMsg(msg);
        }}
      />

      {/* Shared Native Confirmation Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        requireReason={confirmState.requireReason}
        destructive={confirmState.destructive}
        onConfirm={handleConfirmTransition}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false, pesantren: null }))}
      />
    </div>
  );
}
