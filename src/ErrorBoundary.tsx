import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleClearCache = () => {
    localStorage.clear();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-300 flex flex-col items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Произошла ошибка в интерфейсе</h2>
                <p className="text-xs text-zinc-500">Компонент <code className="font-mono text-zinc-400">&lt;App&gt;</code> завершился сбоем.</p>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-rose-400 overflow-x-auto max-h-40 whitespace-pre-wrap">
              {this.state.error?.toString() || 'Неизвестная ошибка'}
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Это может происходить из-за несовместимых или поврежденных данных в локальном кэше браузера. Вы можете сбросить настройки приложения, чтобы вернуть его в исходное рабочее состояние.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Повторить
              </button>
              <button
                onClick={this.handleClearCache}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-rose-600/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Сбросить кэш
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
