import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { useDialogLightDismiss } from '../lib/useDialogLightDismiss';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onStartOperatorDemo: () => void;
}

type AuthMode = 'signin' | 'activate' | 'reset';

function mapAuthErrorMessage(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: string }).code)
      : '';
  const message = err instanceof Error ? err.message : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email atau kata sandi tidak sesuai. Pastikan akun sudah diaktivasi terlebih dahulu.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah memiliki akun kata sandi. Silakan gunakan tab Masuk atau Lupa Sandi.';
    case 'auth/weak-password':
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    case 'auth/invalid-email':
      return 'Format alamat email tidak valid.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan masuk. Tunggu beberapa saat lalu coba lagi.';
    case 'auth/operation-not-allowed':
      return 'Login Email & Kata Sandi belum diaktifkan di Firebase Console. Aktifkan di Authentication -> Sign-in method -> Email/Password, atau gunakan Masuk dengan Google.';
    case 'auth/popup-blocked':
      return 'Jendela popup Google diblokir browser. Izinkan popup untuk situs ini atau gunakan Email & Kata Sandi.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    default:
      return message || 'Gagal memproses autentikasi. Periksa koneksi Anda dan coba lagi.';
  }
}

export function LoginModal({ open, onClose, onStartOperatorDemo }: LoginModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setErrorMsg('');
      setInfoMsg('');
      setPassword('');
      setConfirmPassword('');
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useDialogLightDismiss(dialogRef, onClose, open && !busy);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrorMsg('');
    setInfoMsg('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleGoogleLogin = async () => {
    setBusy(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err) {
      const msg = mapAuthErrorMessage(err);
      if (msg) setErrorMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Alamat email wajib diisi.');
      return;
    }

    if (mode === 'activate' && password !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        onClose();
      } else if (mode === 'activate') {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await sendEmailVerification(cred.user);
        onClose();
      } else {
        await sendPasswordResetEmail(auth, cleanEmail);
        setInfoMsg(
          `Tautan atur ulang kata sandi telah dikirim ke ${cleanEmail}. Periksa kotak masuk atau folder spam Anda.`,
        );
      }
    } catch (err) {
      setErrorMsg(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="login-modal-title"
      {...({ closedby: busy ? 'closerequest' : 'any' } as Record<string, string>)}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (open && !busy) onClose();
      }}
      className="m-auto w-full max-w-md rounded-2xl border border-white/[0.12] bg-gradient-to-b from-[#171920] to-[#111217] p-0 text-[#FAFAFA] shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-4">
        <div>
          <p className="text-xs font-medium text-[#A1A1AA]">
            Portal Kemenag &amp; Operator Pesantren
          </p>
          <h2 id="login-modal-title" className="text-lg font-semibold mt-0.5 text-[#FAFAFA]">
            Masuk ke Sistem Pendataan
          </h2>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label="Tutup jendela masuk"
          onClick={onClose}
          className="p-1.5 text-[#A1A1AA] hover:text-white rounded-lg hover:bg-white/[0.08] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-5">
        <p className="text-xs text-[#A1A1AA] leading-relaxed">
          Peran <strong className="text-[#FAFAFA]">Super Admin Kemenag</strong> maupun <strong className="text-[#FAFAFA]">Operator Pesantren</strong> akan dideteksi otomatis sesuai email akun yang Anda gunakan.
        </p>

        {/* Primary Google Sign-In */}
        <button
          type="button"
          disabled={busy}
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[#FAFAFA] bg-white/[0.06] border border-white/[0.14] hover:bg-white/[0.12] rounded-xl transition-colors disabled:opacity-60"
        >
          <svg className="w-4 h-4 shrink-0 text-[#FAFAFA]" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="currentColor"
              fillOpacity="0.75"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="currentColor"
              fillOpacity="0.55"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="currentColor"
              fillOpacity="0.85"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          <span>{busy ? 'Memproses...' : 'Masuk dengan Google'}</span>
        </button>

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-white/[0.08]" />
          <span className="px-3 text-xs text-[#71717A]">atau gunakan Email &amp; Kata Sandi</span>
          <div className="flex-grow border-t border-white/[0.08]" />
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0E12] border border-white/[0.08] rounded-xl text-xs font-medium">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`py-1.5 px-2 rounded-lg transition-colors whitespace-nowrap ${
              mode === 'signin'
                ? 'bg-emerald-500 text-[#041D13] font-semibold'
                : 'text-[#A1A1AA] hover:text-white'
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => switchMode('activate')}
            className={`py-1.5 px-2 rounded-lg transition-colors whitespace-nowrap ${
              mode === 'activate'
                ? 'bg-emerald-500 text-[#041D13] font-semibold'
                : 'text-[#A1A1AA] hover:text-white'
            }`}
          >
            Aktivasi Akun
          </button>
          <button
            type="button"
            onClick={() => switchMode('reset')}
            className={`py-1.5 px-2 rounded-lg transition-colors whitespace-nowrap ${
              mode === 'reset'
                ? 'bg-emerald-500 text-[#041D13] font-semibold'
                : 'text-[#A1A1AA] hover:text-white'
            }`}
          >
            Lupa Sandi
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-white/[0.06] border border-white/[0.28] text-white text-xs font-medium leading-relaxed"
          >
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.14] text-[#E4E4E7] text-xs leading-relaxed"
          >
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-3.5 text-sm">
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-[#E4E4E7] mb-1">
              Alamat Email Terdaftar <span className="text-white font-semibold">*</span>
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@pesantren.sch.id"
              className="field-input w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-emerald-400/70 focus:outline-none"
            />
            <p className="field-error mt-1 text-xs text-white font-medium">
              Masukkan alamat email yang valid.
            </p>
          </div>

          {mode !== 'reset' && (
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                Kata Sandi <span className="text-white font-semibold">*</span>
              </label>
              <input
                id="login-password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'activate' ? 'new-password' : 'current-password'}
                disabled={busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="field-input w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-emerald-400/70 focus:outline-none"
              />
              <p className="field-error mt-1 text-xs text-white font-medium">
                Kata sandi minimal 6 karakter.
              </p>
            </div>
          )}

          {mode === 'activate' && (
            <div>
              <label htmlFor="login-confirm-password" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                Ulangi Kata Sandi <span className="text-white font-semibold">*</span>
              </label>
              <input
                id="login-confirm-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                disabled={busy}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang kata sandi"
                className="field-input w-full rounded-xl border border-white/[0.14] bg-[#0D0E12] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-emerald-400/70 focus:outline-none"
              />
              <p className="text-[11px] text-[#71717A] mt-1.5">
                Khusus email operator yang sudah didaftarkan Kemenag untuk login tanpa akun Google. Tautan verifikasi akan dikirim ke email Anda.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 px-4 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors disabled:opacity-60"
          >
            {busy
              ? 'Memproses...'
              : mode === 'signin'
                ? 'Masuk dengan Email'
                : mode === 'activate'
                  ? 'Buat Kata Sandi & Kirim Verifikasi'
                  : 'Kirim Tautan Atur Ulang Sandi'}
          </button>
        </form>

        <div className="pt-4 border-t border-white/[0.08] space-y-2">
          <p className="text-xs font-medium text-[#FAFAFA]">Uji Coba Cepat Operator</p>
          <button
            type="button"
            disabled={busy}
            onClick={onStartOperatorDemo}
            className="w-full py-2 px-4 text-xs font-medium text-[#FAFAFA] bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.12] rounded-xl transition-colors disabled:opacity-60"
          >
            Masuk Simulasi Operator Uji (Data Contoh)
          </button>
          <p className="text-[11px] text-[#71717A] leading-relaxed">
            Menjalankan portal operator dengan data contoh lokal tanpa mengubah database Firestore.
          </p>
        </div>
      </div>
    </dialog>
  );
}
