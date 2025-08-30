import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

export function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const nav = useNavigate();

  // SIGNUP
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  // wspólne
  const [password, setPassword] = useState("");
  // SIGNIN – jedno pole: e-mail lub login
  const [identifier, setIdentifier] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function isEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  async function resolveEmailFromIdentifier(input: string): Promise<string> {
    const trimmed = input.trim();
    if (isEmail(trimmed)) return trimmed; // to jest e-mail
    // to jest login → znajdź e-mail w profiles
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .ilike("username", trimmed)
      .maybeSingle();
    if (error) throw error;
    if (!data?.email) {
      throw new Error("Nie znaleziono użytkownika o takim loginie.");
    }
    return data.email;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === "signup") {
        // walidacja loginu
        if (!USERNAME_REGEX.test(username)) {
          throw new Error(
            "Nieprawidłowy login. Dozwolone: 3–20 znaków, litery/cyfry/_"
          );
        }

        // pre-check dostępności loginu (case-insensitive)
        const { data: taken, error: chkErr } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", username)
          .maybeSingle();
        if (chkErr) throw chkErr;
        if (taken) throw new Error("Podany login już istnieje.");

        // rejestracja — przekaż login w metadanych
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) throw error;

        // Supabase przy duplikacie e-maila potrafi zwrócić usera z identities = []
        const identities = (data?.user as any)?.identities;
        if (!identities || identities.length === 0) {
          throw new Error("Konto powiązane z tym adresem e-mail już istnieje.");
        }

        setInfo(
          "Konto utworzone. Sprawdź skrzynkę i potwierdź e-mail, aby się zalogować."
        );
        return; // zostajemy na stronie
      }

      // LOGOWANIE: e-mail LUB login
      const resolvedEmail = await resolveEmailFromIdentifier(identifier);
      const { error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });
      if (error) throw error;
      nav("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Błąd logowania/rejestracji");
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const idForReset = mode === "signin" ? identifier : email;
      if (!idForReset.trim()) {
        throw new Error(
          "Podaj e-mail lub login, aby wysłać link do resetu hasła."
        );
      }
      const resolvedEmail = await resolveEmailFromIdentifier(idForReset);
      const { error } = await supabase.auth.resetPasswordForEmail(
        resolvedEmail,
        {
          redirectTo: window.location.origin + "/",
        }
      );
      if (error) throw error;
      setInfo("Wysłaliśmy link do resetu hasła (sprawdź e-mail).");
    } catch (err: any) {
      setError(err?.message ?? "Nie udało się wysłać linku do resetu hasła.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          maxWidth: 380,
          width: "100%",
          padding: 24,
          background: "#fff",
          color: "#111",
          borderRadius: 12,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ marginBottom: 16, textAlign: "center" }}>
          {mode === "signup" ? "Rejestracja" : "Ligowiec - Typuj ze znajomymi!"}
        </h1>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          {mode === "signup" ? (
            <>
              <input
                type="text"
                placeholder="Login (3–20, litery/cyfry/_ )"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
              <input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </>
          ) : (
            <input
              type="text"
              placeholder="E-mail lub login"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
            />
          )}

          <input
            type="password"
            placeholder={mode === "signup" ? "Hasło (min. 6 znaków)" : "Hasło"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "..." : mode === "signup" ? "Utwórz konto" : "Zaloguj"}
          </button>

          <button
            type="button"
            onClick={onForgotPassword}
            disabled={busy}
            style={{
              textAlign: "center",
              background: "none",
              border: "none",
              color: "#0a66c2",
              cursor: "pointer",
            }}
          >
            Nie pamiętasz hasła?
          </button>

          {error && <div style={{ color: "red" }}>{error}</div>}
          {info && <div style={{ color: "green" }}>{info}</div>}
        </form>

        <div style={{ marginTop: 12, textAlign: "center" }}>
          {mode === "signup" ? (
            <span>
              Masz już konto? <Link to="/">Zaloguj się</Link>
            </span>
          ) : (
            <span>
              Nie masz konta? <Link to="/signup">Zarejestruj się</Link>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
