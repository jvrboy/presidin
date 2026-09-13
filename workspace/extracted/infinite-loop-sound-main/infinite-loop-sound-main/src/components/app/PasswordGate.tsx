import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

const KEY = "diq.unlocked.v1";
const PASSWORD = "@Ttsepang1";

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      setOk(localStorage.getItem(KEY) === "1");
    } catch {
      setOk(false);
    }
  }, []);

  if (ok === null) return null;
  if (ok) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === PASSWORD) {
      try {
        localStorage.setItem(KEY, "1");
      } catch {}
      setOk(true);
    } else {
      setErr("Incorrect password.");
    }
  };

  return (
    <div className="dark min-h-screen grid place-items-center bg-background text-foreground p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-primary/15 grid place-items-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-lg font-semibold">DivergenceIQ</div>
            <div className="text-xs text-muted-foreground">Protected access</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Password</label>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setErr("");
            }}
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Enter password"
          />
          {err && <div className="text-xs text-bear">{err}</div>}
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-semibold hover:opacity-90"
        >
          Unlock
        </button>
        <div className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
          Don't have the password? Request access via WhatsApp:{" "}
          <a
            href="https://wa.me/27601475034?text=Hi%2C%20I%27m%20requesting%20access%20to%20DivergenceIQ."
            target="_blank"
            rel="noreferrer"
            className="text-primary font-semibold underline"
          >
            +27 60 147 5034
          </a>
        </div>
      </form>
    </div>
  );
}
