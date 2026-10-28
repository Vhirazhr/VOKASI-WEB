"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck, X } from "lucide-react";
import { currentRole, signIn } from "@/lib/auth";
import { configured } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";
import SchoolMark from "./SchoolMark";
type Intent = "dashboard" | "leaderboard";
type OpenAccess = (role: UserRole, intent: Intent, forceLogin?: boolean) => void;
const AccessContext = createContext<OpenAccess>(() => {});
export function AccessLink({
  children,
  className,
  role = "student",
  intent = "dashboard",
}: {
  children: ReactNode;
  className?: string;
  role?: UserRole;
  intent?: Intent;
}) {
  const open = useContext(AccessContext);
  function activate(e: MouseEvent<HTMLAnchorElement>) {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(role, intent);
  }
  return (
    <a href={`/?login=1&role=${role}`} className={className} onClick={activate}>
      {children}
    </a>
  );
}
export default function LandingAccess({ children }: { children: ReactNode }) {
  const router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    generation = useRef(0),
    trigger = useRef<HTMLElement | null>(null),
    overflow = useRef<string | null>(null);
  const [role, setRole] = useState<UserRole>("student"),
    [intent, setIntent] = useState<Intent>("dashboard"),
    [identity, setIdentity] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [pending, setPending] = useState(false),
    [checking, setChecking] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      generation.current++;
      if (overflow.current !== null)
        document.body.style.overflow = overflow.current;
    },
    [],
  );
  const close = useCallback(() => {
    generation.current++;
    dialog.current?.close();
    if (overflow.current !== null) {
      document.body.style.overflow = overflow.current;
      overflow.current = null;
    }
    setPassword("");
    setIdentity("");
    setError("");
    setVisible(false);
    setPending(false);
    setChecking(false);
    trigger.current?.focus();
  }, []);
  const finish = useCallback((accountRole: UserRole, destination: Intent) => {
    close();
    if (destination === "leaderboard" && accountRole === "student")
      document
        .getElementById("leaderboard")
        ?.scrollIntoView({ behavior: "instant" });
    else router.push(accountRole === "admin" ? "/admin" : "/siswa");
  }, [close, router]);
  const open = useCallback((nextRole: UserRole, nextIntent: Intent, forceLogin = false) => {
    if (dialog.current?.open) return;
    const request = ++generation.current;
    setRole(nextRole);
    setIntent(nextIntent);
    setError("");
    setPassword("");
    setVisible(false);
    trigger.current = document.activeElement as HTMLElement;
    overflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    input.current?.focus();
    // Redirects caused by an expired session must show the login form, even if
    // Supabase is still finishing a token refresh in the background.
    if (forceLogin || !configured()) return;
    setChecking(true);
    void currentRole()
      .then((account) => {
        if (request === generation.current && dialog.current?.open && account)
          finish(account.role, nextIntent);
      })
      .catch(() => {})
      .finally(() => {
        if (request === generation.current) setChecking(false);
      });
  }, [finish]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("login") !== "1") return;
    const nextRole: UserRole = url.searchParams.get("role") === "admin" ? "admin" : "student";
    const nextIntent: Intent = url.searchParams.get("intent") === "leaderboard" ? "leaderboard" : "dashboard";
    // Defer until the landing page is mounted, and cancel the first pass in
    // React Strict Mode so the dialog is opened exactly once in development.
    const timer = window.setTimeout(() => {
      url.searchParams.delete("login");
      url.searchParams.delete("role");
      url.searchParams.delete("intent");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      open(nextRole, nextIntent, true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || checking) return;
    const request = ++generation.current,
      submittedRole = role,
      destination = intent;
    setPending(true);
    setError("");
    try {
      await signIn(identity, password, submittedRole);
      if (request === generation.current && dialog.current?.open)
        finish(submittedRole, destination);
    } catch (cause) {
      if (request === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Login belum berhasil. Silakan coba kembali.",
        );
    } finally {
      if (request === generation.current) {
        setPending(false);
        setPassword("");
      }
    }
  }
  return (
    <AccessContext.Provider value={open}>
      {children}
      <dialog
        ref={dialog}
        className="vkw-login-dialog"
        aria-labelledby="vkw-login-title"
        aria-describedby="vkw-login-description"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const b = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < b.left ||
              e.clientX > b.right ||
              e.clientY < b.top ||
              e.clientY > b.bottom
            )
              close();
          }
        }}
      >
        <div className="vkw-login-inner">
          <button
            type="button"
            className="vkw-dialog-close"
            onClick={close}
            aria-label="Tutup login"
          >
            <X size={20} />
          </button>
          <div className="vkw-login-brand">
            <SchoolMark compact />
            <span>
              VOKASI<small>SMK NEGERI 1 SINGOSARI</small>
            </span>
          </div>
          <p className="vkw-kicker">AKSES PEMBELAJARAN</p>
          <h2 id="vkw-login-title">Masuk ke VOKASI</h2>
          <p id="vkw-login-description">
            Gunakan akun yang terdaftar di sekolah.
          </p>
          <div className="vkw-login-tabs" role="group" aria-label="Jenis akun">
            {(["student", "admin"] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={pending || checking}
                aria-pressed={role === value}
                onClick={() => {
                  setRole(value);
                  setIdentity("");
                  setPassword("");
                  setError("");
                }}
              >
                {value === "student" ? "Siswa" : "Admin"}
              </button>
            ))}
          </div>
          {!configured() && (
            <p className="vkw-form-error" role="alert">
              Layanan login belum tersedia. Silakan hubungi pengelola sekolah.
            </p>
          )}
          <form onSubmit={submit}>
            <label htmlFor="vkw-identity">
              {role === "student"
                ? "Nama lengkap atau username"
                : "Email admin"}
            </label>
            <input
              ref={input}
              id="vkw-identity"
              name="username"
              type={role === "admin" ? "email" : "text"}
              autoComplete="username"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              required
              disabled={pending}
            />
            {role === "student" && (
              <p className="vkw-field-help">
                Jika nama sama, gunakan Nama Lengkap | Kelas.
              </p>
            )}
            <label htmlFor="vkw-password">Password</label>
            <div className="vkw-password-field">
              <input
                id="vkw-password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={pending}
              />
              <button
                type="button"
                aria-label={visible ? "Sembunyikan password" : "Lihat password"}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <p className="vkw-form-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="vkw-primary vkw-login-submit"
              disabled={pending || checking || !configured()}
            >
              {pending
                ? "Memeriksa akun…"
                : checking
                  ? "Memeriksa sesi…"
                  : "Masuk"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="vkw-login-note">
            <ShieldCheck size={14} /> Akun dan akses dikelola oleh sekolah
          </p>
        </div>
      </dialog>
    </AccessContext.Provider>
  );
}
