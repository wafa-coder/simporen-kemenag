import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { AuthWorkspace } from './components/AuthWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginModal } from './components/LoginModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OperatorSandboxWorkspace } from './components/OperatorSandboxWorkspace';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PublicDirectory } from './components/PublicDirectory';
import {
  OperationType,
  auth,
  checkFirestoreConnection,
  db,
  handleFirestoreError,
} from './firebase';
import { fetchPublicPesantrenRest, fetchPublicSystemConfigRest } from './lib/firestoreRest';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  type PublicPesantren,
  type SystemConfig,
  type UserProfile,
} from './types';

type AuthGateState =
  | 'loading'
  | 'unauthenticated'
  | 'unverified_email'
  | 'ready'
  | 'unregistered'
  | 'inactive';

function AppShell() {
  const [authState, setAuthState] = useState<AuthGateState>('loading');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [showPublic, setShowPublic] = useState(true);
  const [operatorSandbox, setOperatorSandbox] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState('');
  const [authError, setAuthError] = useState('');

  const [publicItems, setPublicItems] = useState<PublicPesantren[]>([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [connectionOffline, setConnectionOffline] = useState(false);
  const [retryingConn, setRetryingConn] = useState(false);

  const loadPublicViaRest = useCallback(async () => {
    const cfg = await fetchPublicSystemConfigRest();
    if (cfg !== null) {
      setSystemConfig((prev) => prev ?? cfg);
    }
    if (cfg?.publicDirectoryEnabled === false) {
      setPublicLoading(false);
      return;
    }
    const list = await fetchPublicPesantrenRest();
    if (list !== null) {
      setPublicItems((prev) => (prev.length > 0 ? prev : list));
      setPublicLoading(false);
    }
  }, []);

  const checkDbReachability = useCallback(async () => {
    setRetryingConn(true);
    const [status] = await Promise.all([
      checkFirestoreConnection(),
      loadPublicViaRest(),
    ]);
    setConnectionOffline(status === 'offline');
    if (status !== 'connected') {
      setPublicLoading(false);
    }
    setRetryingConn(false);
  }, [loadPublicViaRest]);

  useEffect(() => {
    let active = true;
    void checkDbReachability();

    const unsubConfig = onSnapshot(
      doc(db, 'system_config', 'default'),
      (snap) => {
        if (!active) return;
        setConnectionOffline(false);
        if (snap.exists()) {
          setSystemConfig(snap.data() as SystemConfig);
        } else {
          setSystemConfig(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'system_config/default'),
    );

    return () => {
      active = false;
      unsubConfig();
    };
  }, [checkDbReachability]);

  const canReadPublicDirectory =
    (systemConfig?.publicDirectoryEnabled ?? true) || userProfile?.role === 'super_admin';

  useEffect(() => {
    if (!canReadPublicDirectory) {
      setPublicItems([]);
      setPublicLoading(false);
      return;
    }

    let active = true;
    const unsubPublic = onSnapshot(
      query(collection(db, 'public_pesantren'), where('statusKeaktifan', '==', 'aktif')),
      (snap) => {
        if (!active) return;
        setConnectionOffline(false);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublicPesantren);
        list.sort((a, b) => a.nama.localeCompare(b.nama));
        setPublicItems(list);
        setPublicLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'public_pesantren'),
    );

    return () => {
      active = false;
      unsubPublic();
    };
  }, [canReadPublicDirectory]);

  const resolveUserSession = useCallback(async (fbUser: User | null) => {
    setAuthError('');
    setVerifyNotice('');
    if (!fbUser) {
      setUserProfile(null);
      setAuthEmail('');
      setAuthState('unauthenticated');
      setShowPublic(true);
      return;
    }

    setOperatorSandbox(false);
    const email = (fbUser.email || '').trim().toLowerCase();
    setAuthEmail(email);

    if (!fbUser.emailVerified) {
      setUserProfile(null);
      setAuthState('unverified_email');
      setShowPublic(false);
      return;
    }

    setAuthState('loading');

    try {
      // 1. Check Bootstrap or Delegated Super Admin
      const adminRef = doc(db, 'admins', fbUser.uid);
      const adminSnap = await getDoc(adminRef);
      const isBootstrap = email === BOOTSTRAP_ADMIN_EMAIL && fbUser.emailVerified;

      if (isBootstrap || adminSnap.exists()) {
        if (isBootstrap && !adminSnap.exists()) {
          await setDoc(adminRef, {
            uid: fbUser.uid,
            email,
            displayName: fbUser.displayName || 'Admin Kemenag',
            createdAt: serverTimestamp(),
          });
        }

        const userRef = doc(db, 'users', fbUser.uid);
        const userSnap = await getDoc(userRef);
        const displayName = fbUser.displayName || 'Admin Kemenag';

        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: fbUser.uid,
            email,
            displayName,
            role: 'super_admin',
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        setUserProfile({
          uid: fbUser.uid,
          email,
          displayName,
          role: 'super_admin',
          isActive: true,
        });
        setAuthState('ready');
        setLoginModalOpen(false);
        setShowPublic(false);
        return;
      }

      // 2. Operator Flow: verify invite / active user record
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);
      const inviteSnap = await getDocs(
        query(collection(db, 'operator_invites'), where('email', '==', email)),
      );
      const activeInviteDoc = inviteSnap.docs.find((d) => d.data().isActive === true) || null;
      const anyInviteDoc = inviteSnap.docs[0] || null;

      if (!userSnap.exists()) {
        if (!activeInviteDoc) {
          setUserProfile(null);
          setAuthState(anyInviteDoc ? 'inactive' : 'unregistered');
          setLoginModalOpen(false);
          setShowPublic(false);
          return;
        }

        const inviteData = activeInviteDoc.data();
        const displayName = fbUser.displayName || inviteData.fullName || email;
        await setDoc(userRef, {
          uid: fbUser.uid,
          email,
          displayName,
          role: 'operator',
          isActive: true,
          inviteId: activeInviteDoc.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingProfile = userSnap.data() as UserProfile;
        if (!existingProfile.isActive || (anyInviteDoc && anyInviteDoc.data().isActive === false)) {
          setUserProfile(null);
          setAuthState('inactive');
          setLoginModalOpen(false);
          setShowPublic(false);
          return;
        }
      }

      // Link UID to invite & assigned pesantren (Action 1 in firestore.rules)
      if (activeInviteDoc && !activeInviteDoc.data().linkedUid) {
        await updateDoc(activeInviteDoc.ref, {
          linkedUid: fbUser.uid,
          updatedAt: serverTimestamp(),
        });
      }

      const psSnap = await getDocs(
        query(collection(db, 'pesantren'), where('assignedOperatorEmails', 'array-contains', email)),
      );
      for (const psDoc of psSnap.docs) {
        const existingUids = (psDoc.data().assignedOperatorUids as string[]) || [];
        if (!existingUids.includes(fbUser.uid)) {
          await updateDoc(psDoc.ref, {
            assignedOperatorUids: [...existingUids, fbUser.uid],
            updatedAt: serverTimestamp(),
          });
        }
      }

      setUserProfile({
        uid: fbUser.uid,
        email,
        displayName: fbUser.displayName || activeInviteDoc?.data().fullName || email,
        role: 'operator',
        isActive: true,
      });
      setAuthState('ready');
      setLoginModalOpen(false);
      setShowPublic(false);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Terjadi kendala saat memverifikasi akun di Firebase.',
      );
      setAuthState('unauthenticated');
    }
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      void resolveUserSession(fbUser);
    });
    return () => unsubAuth();
  }, [resolveUserSession]);

  const handleLoginClick = () => {
    if (authState === 'ready' && userProfile) {
      setShowPublic(false);
      return;
    }
    if (operatorSandbox) {
      setShowPublic(false);
      return;
    }
    if (authState === 'unverified_email' || authState === 'unregistered' || authState === 'inactive') {
      setShowPublic(false);
      return;
    }
    setLoginModalOpen(true);
  };

  const handleRefreshVerification = async () => {
    if (!auth.currentUser) return;
    setVerifyBusy(true);
    setVerifyNotice('');
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      if (!auth.currentUser.emailVerified) {
        setVerifyNotice(
          'Email masih belum terverifikasi. Klik tautan verifikasi di kotak masuk atau spam email Anda terlebih dahulu.',
        );
      } else {
        await resolveUserSession(auth.currentUser);
      }
    } catch (err) {
      setVerifyNotice(
        err instanceof Error ? err.message : 'Gagal memeriksa ulang status verifikasi email.',
      );
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setVerifyBusy(true);
    setVerifyNotice('');
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyNotice(
        `Email verifikasi baru telah dikirim ke ${authEmail}. Silakan periksa kotak masuk atau folder spam.`,
      );
    } catch (err) {
      setVerifyNotice(
        err instanceof Error ? err.message : 'Gagal mengirim ulang email verifikasi. Coba beberapa saat lagi.',
      );
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUserProfile(null);
    setAuthState('unauthenticated');
    setShowPublic(true);
  };

  if (!showPublic && operatorSandbox && authState !== 'ready') {
    return (
      <OperatorSandboxWorkspace
        config={systemConfig}
        onOpenPublicDirectory={() => setShowPublic(true)}
        onExitSandbox={() => {
          setOperatorSandbox(false);
          setShowPublic(true);
        }}
      />
    );
  }

  if (!showPublic && authState === 'loading') {
    return (
      <div className="min-h-screen bg-[#0A0B0E] flex items-center justify-center p-6">
        <div className="bg-[#131419] border border-white/[0.1] rounded-2xl p-6 max-w-sm w-full text-center space-y-2">
          <p className="text-sm font-semibold text-[#FAFAFA]">Memverifikasi Akses Portal</p>
          <p className="text-xs text-[#A1A1AA]">Mendeteksi peran Super Admin atau Operator secara otomatis...</p>
        </div>
      </div>
    );
  }

  if (!showPublic && authState === 'unverified_email') {
    return (
      <div className="min-h-screen bg-[#0A0B0E] flex items-center justify-center p-6 text-[#FAFAFA]">
        <div className="bg-[#131419] border border-white/[0.1] rounded-2xl p-6 max-w-md w-full space-y-4">
          <p className="text-xs font-medium text-emerald-400">Verifikasi Email Diperlukan</p>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">Verifikasi Alamat Email Anda</h1>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            Untuk menjaga keamanan akses lembaga, email{' '}
            <strong className="text-[#FAFAFA]">{authEmail}</strong> wajib diverifikasi sebelum terhubung ke peran Super Admin atau Operator Pesantren.
          </p>
          {verifyNotice && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200"
            >
              {verifyNotice}
            </div>
          )}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              disabled={verifyBusy}
              onClick={handleRefreshVerification}
              className="px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl disabled:opacity-60 transition-colors"
            >
              {verifyBusy ? 'Memeriksa...' : 'Saya Sudah Verifikasi'}
            </button>
            <button
              type="button"
              disabled={verifyBusy}
              onClick={handleResendVerification}
              className="px-4 py-2 text-sm font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.12] rounded-xl disabled:opacity-60 transition-colors"
            >
              Kirim Ulang Email
            </button>
            <button
              type="button"
              onClick={() => setShowPublic(true)}
              className="px-4 py-2 text-sm font-medium text-[#A1A1AA] hover:text-white rounded-xl transition-colors"
            >
              Direktori Publik
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-medium text-[#FAFAFA] border border-white/[0.18] hover:bg-white/[0.08] rounded-xl transition-colors"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!showPublic && (authState === 'unregistered' || authState === 'inactive')) {
    return (
      <div className="min-h-screen bg-[#0A0B0E] flex items-center justify-center p-6 text-[#FAFAFA]">
        <div className="bg-[#131419] border border-white/[0.1] rounded-2xl p-6 max-w-md w-full space-y-4">
          <p className="text-xs font-medium text-[#A1A1AA]">Akses Portal Terbatas</p>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">
            {authState === 'inactive' ? 'Akun Operator Dinonaktifkan' : 'Email Belum Terdaftar sebagai Operator'}
          </h1>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            Akun <strong className="text-[#FAFAFA]">{authEmail || 'Anda'}</strong>{' '}
            {authState === 'inactive'
              ? 'saat ini berstatus nonaktif oleh Admin Kemenag Kabupaten.'
              : 'belum didaftarkan oleh Admin Kemenag Kabupaten pada modul Operator & Akses.'}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowPublic(true)}
              className="px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors"
            >
              Kembali ke Direktori Publik
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.12] rounded-xl transition-colors"
            >
              Keluar Akun
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!showPublic && authState === 'ready' && userProfile) {
    return (
      <AuthWorkspace
        user={userProfile}
        config={systemConfig}
        onOpenPublicDirectory={() => setShowPublic(true)}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div>
      <OfflineIndicator />
      {connectionOffline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-[#131419] border-b border-white/[0.1] px-6 py-2.5 text-xs text-[#E4E4E7] flex flex-wrap items-center justify-center gap-3"
        >
          <span>Koneksi ke Cloud Firestore sedang tertunda atau offline.</span>
          <button
            type="button"
            disabled={retryingConn}
            onClick={() => void checkDbReachability()}
            className="px-2.5 py-1 font-medium text-[#FAFAFA] bg-white/[0.08] border border-white/[0.16] rounded-lg hover:bg-white/[0.14] disabled:opacity-60 transition-colors"
          >
            {retryingConn ? 'Menghubungkan...' : 'Coba Hubungkan Ulang'}
          </button>
        </div>
      )}
      {authError && (
        <div role="alert" className="bg-[#16181F] border-b border-white/[0.2] px-6 py-2.5 text-xs font-medium text-white text-center">
          {authError}
        </div>
      )}
      <PublicDirectory
        items={publicItems}
        loading={publicLoading}
        config={systemConfig}
        onLoginClick={handleLoginClick}
        signingIn={false}
      />
      <LoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onStartOperatorDemo={() => {
          setLoginModalOpen(false);
          setOperatorSandbox(true);
          setShowPublic(false);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
