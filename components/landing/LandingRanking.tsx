"use client";

import { nativeRpc } from '@/lib/native-rpc';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { RefreshCw, Trophy, UserRound, X } from "lucide-react";
type LeaderboardRow = {
  rank: number;
  display_name: string;
  classroom: string;
  mandatory_average: number;
};

const LeaderboardContext = createContext<() => void>(() => {});

export function LeaderboardLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const open = useContext(LeaderboardContext);

  function activate(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    open();
  }

  return (
    <a href="#leaderboard" className={className} onClick={activate}>
      {children}
    </a>
  );
}

export default function LandingRanking({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const previousOverflow = useRef<string | null>(null);
  const requestId = useRef(0);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(
    () => () => {
      requestId.current += 1;
      if (previousOverflow.current !== null) {
        document.body.style.overflow = previousOverflow.current;
      }
    },
    [],
  );

  async function loadRows() {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await nativeRpc(
        "vokasi_public_leaderboard",
      );
      if (rpcError) throw rpcError;
      if (currentRequest !== requestId.current) return;

      const normalized = ((data ?? []) as unknown as LeaderboardRow[])
        .map((row) => ({
          rank: Number(row.rank),
          display_name: String(row.display_name || "Siswa"),
          classroom: String(row.classroom || "Siswa terdaftar"),
          mandatory_average: Number(row.mandatory_average),
        }))
        .filter(
          (row) =>
            Number.isFinite(row.rank) &&
            Number.isFinite(row.mandatory_average),
        );
      setRows(normalized);
      setExpanded(normalized.length > 1);
    } catch {
      if (currentRequest === requestId.current) {
        setError(
          "Peringkat belum dapat dimuat. Periksa koneksi lalu coba kembali.",
        );
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  function open() {
    if (dialog.current?.open) return;
    trigger.current = document.activeElement as HTMLElement | null;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    setExpanded(false);
    void loadRows();
  }

  function close() {
    requestId.current += 1;
    dialog.current?.close();
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
    trigger.current?.focus();
  }

  const champion = rows[0];
  const remaining = rows.slice(1);

  return (
    <LeaderboardContext.Provider value={open}>
      {children}
      <dialog
        ref={dialog}
        className="vkw-ranking-dialog"
        aria-labelledby="vkw-ranking-title"
        aria-describedby="vkw-ranking-description"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="vkw-ranking-modal">
          <button
            type="button"
            className="vkw-ranking-close"
            onClick={close}
            aria-label="Tutup leaderboard"
          >
            <X size={20} />
          </button>

          <header className="vkw-ranking-modal-header">
            <p className="vkw-ranking-eyebrow">PENCAPAIAN SISWA</p>
            <h2 id="vkw-ranking-title">
              Leaderboard <em>VOKASI</em>
            </h2>
            <p id="vkw-ranking-description">
              Peringkat berdasarkan nilai rata-rata wajib terverifikasi pada
              periode berjalan.
            </p>
            <button
              type="button"
              className="vkw-ranking-refresh"
              onClick={() => void loadRows()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "vkw-is-spinning" : ""} />
              Perbarui nilai
            </button>
          </header>

          {loading && (
            <div className="vkw-ranking-state" role="status" aria-live="polite">
              <span className="vkw-ranking-state-icon">
                <Trophy size={24} />
              </span>
              <strong>Memuat peringkat siswa…</strong>
              <p>Mengambil nilai terverifikasi dari database sekolah.</p>
            </div>
          )}

          {!loading && error && (
            <div className="vkw-ranking-state" role="alert">
              <strong>Leaderboard belum tersedia</strong>
              <p>{error}</p>
              <button
                type="button"
                className="vkw-ranking-secondary-button"
                onClick={() => void loadRows()}
              >
                Coba lagi
              </button>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="vkw-ranking-state">
              <span className="vkw-ranking-state-icon">
                <Trophy size={24} />
              </span>
              <strong>Belum ada peringkat</strong>
              <p>
                Peringkat akan muncul setelah tersedia hasil wajib yang
                terverifikasi pada periode ini.
              </p>
            </div>
          )}

          {!loading && !error && champion && (
            <div className="vkw-ranking-content">
              <section className="vkw-ranking-podium" aria-label="Peringkat pertama">
                <div className="vkw-ranking-avatar" aria-hidden="true">
                  <UserRound size={62} strokeWidth={1.35} />
                </div>
                <span className="vkw-ranking-rank-chip">1</span>
                <span className="vkw-ranking-trophy-chip">
                  <Trophy size={14} /> #1
                </span>
                <article className="vkw-ranking-champion-card">
                  <span className="vkw-ranking-champion-label">CHAMPION</span>
                  <p className="vkw-ranking-average-label">NILAI RATA-RATA</p>
                  <strong className="vkw-ranking-champion-score">
                    {champion.mandatory_average}
                    <small>/100</small>
                  </strong>
                  <h3>{champion.display_name}</h3>
                  <p className="vkw-ranking-classroom">
                    {champion.classroom} · Identitas disamarkan
                  </p>
                  <button
                    type="button"
                    className="vkw-ranking-detail-button"
                    onClick={() => setExpanded((value) => !value)}
                    aria-expanded={expanded}
                    aria-controls="vkw-ranking-details"
                  >
                    {expanded ? "Sembunyikan daftar" : "Lihat semua peringkat"}
                  </button>
                </article>
                <div className="vkw-ranking-podium-base" aria-hidden="true">
                  01
                </div>
              </section>

              {expanded && (
                <section
                  className="vkw-ranking-details"
                  id="vkw-ranking-details"
                  aria-label="Daftar peringkat siswa"
                >
                  <div className="vkw-ranking-details-heading">
                    <div>
                      <p className="vkw-ranking-eyebrow">HASIL TERVERIFIKASI</p>
                      <h3>Peringkat siswa</h3>
                    </div>
                    <span>{rows.length} siswa</span>
                  </div>
                  {remaining.length > 0 ? (
                    <ol className="vkw-ranking-modal-list" start={2}>
                      {remaining.map((row) => (
                        <li key={row.rank}>
                          <span className="vkw-ranking-row-number">
                            {String(row.rank).padStart(2, "0")}
                          </span>
                          <span className="vkw-ranking-row-avatar" aria-hidden="true">
                            <UserRound size={19} />
                          </span>
                          <span className="vkw-ranking-row-person">
                            <strong>{row.display_name}</strong>
                            <small>{row.classroom} · Nama disamarkan</small>
                          </span>
                          <strong className="vkw-ranking-row-score">
                            {row.mandatory_average}
                            <small>/100</small>
                          </strong>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="vkw-ranking-only-one">
                      Saat ini baru ada satu siswa yang memenuhi syarat
                      peringkat pada periode ini.
                    </p>
                  )}
                </section>
              )}

              <p className="vkw-ranking-privacy-note">
                Nama siswa disamarkan untuk menjaga privasi. Nilai dan urutan
                peringkat diambil dari hasil terverifikasi.
              </p>
            </div>
          )}
        </div>
      </dialog>
    </LeaderboardContext.Provider>
  );
}
