import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, message: '' };

  public static getDerivedStateFromError(error: Error): State {
    let readable = error.message;
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (parsed.error) {
        readable = `${parsed.error}${parsed.path ? ` (${parsed.operationType} pada ${parsed.path})` : ''}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: readable };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#0A0B0E] text-[#FAFAFA]">
          <div className="max-w-lg w-full bg-[#131419] border border-white/[0.1] rounded-2xl p-6 space-y-4">
            <h1 className="text-lg font-semibold text-[#FAFAFA]">Terjadi Kendala Sistem</h1>
            <p className="text-sm text-[#A1A1AA] leading-relaxed">
              Aplikasi mengalami kesalahan saat memproses permintaan. Silakan muat ulang halaman atau periksa hak akses akun Anda.
            </p>
            <div className="p-3 bg-[#0D0E12] border border-white/[0.08] rounded-xl text-xs font-mono-num text-[#E4E4E7] break-words">
              {this.state.message}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold text-[#041D13] bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
