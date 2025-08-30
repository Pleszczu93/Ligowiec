import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  favorite_team: string | null;
  last5matches: string | null; // (zostawione, docelowo liczymy z meczów)
  points: number | null;
  avatar_url: string | null;
  bio: string | null;
};

type League = { id: string; name: string };

type RecentMatch = {
  round_no: number;
  opponent_username: string;
  my_goals: number;
  opp_goals: number;
  result: "Z" | "R" | "P";
};

export default function ProfilePage() {
  const { username } = useParams();
  const [meId, setMeId] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [leagueId, setLeagueId] = useState<string | null>(null);

  const [position, setPosition] = useState<number | null>(null);
  const [recent, setRecent] = useState<("Z" | "R" | "P")[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [totals, setTotals] = useState<{ w: number; d: number; l: number }>({
    w: 0,
    d: 0,
    l: 0,
  });

  const [error, setError] = useState<string | null>(null);

  // Kto jest zalogowany (czy pokazać "Edytuj profil")
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
    })();
  }, []);

  // Profil + ligi usera
  useEffect(() => {
    (async () => {
      setError(null);
      // 1) profil
      const { data: p, error: e1 } = await supabase
        .from("profiles")
        .select(
          "id, username, favorite_team, last5matches, points, avatar_url, bio"
        )
        .ilike("username", String(username))
        .maybeSingle();
      if (e1) {
        setError(e1.message);
        return;
      }
      if (!p) {
        setError("Nie znaleziono profilu.");
        return;
      }
      setProfile(p);

      // 2) ligi tego użytkownika
      const { data: lgs, error: e2 } = await supabase
        .from("leagues")
        .select("id, name, league_members!inner(user_id)")
        .eq("league_members.user_id", p.id)
        .order("created_at", { ascending: false });
      if (e2) {
        setError(e2.message);
        return;
      }
      const simple = (lgs ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
      })) as League[];
      setLeagues(simple);
      if (simple.length > 0) setLeagueId(simple[0].id);
    })();
  }, [username]);

  // Tabela pozycji + forma (5) + ostatnie 10 meczów + totals Z/R/P dla wybranej ligi
  useEffect(() => {
    (async () => {
      if (!leagueId || !profile) return;
      setError(null);

      // 1) pozycja w tabeli
      const { data: tab, error: e3 } = await supabase
        .from("league_table")
        .select("user_id, username, points")
        .eq("league_id", leagueId);
      if (e3) {
        setError(e3.message);
        return;
      }
      const sorted = (tab ?? []).sort(
        (a: any, b: any) => (b.points ?? 0) - (a.points ?? 0)
      );
      const idx = sorted.findIndex((r: any) => r.user_id === profile.id);
      setPosition(idx >= 0 ? idx + 1 : null);

      // 2) ostatnie 10 gier – pełne dane
      const { data: fx10, error: e4 } = await supabase
        .from("fixture_scores")
        .select(
          "round_no, home_username, away_username, home_goals, away_goals, home_pts, away_pts, home_user_id, away_user_id"
        )
        .eq("league_id", leagueId)
        .or(`home_user_id.eq.${profile.id},away_user_id.eq.${profile.id}`)
        .order("round_no", { ascending: false })
        .limit(10);
      if (e4) {
        setError(e4.message);
        return;
      }

      const recentForm = (fx10 ?? []).slice(0, 5).map((f: any) => {
        const meHome = f.home_user_id === profile.id;
        const myPts = meHome ? f.home_pts : f.away_pts;
        if (myPts === 3) return "Z";
        if (myPts === 1) return "R";
        return "P";
      });
      setRecent(recentForm);

      const mapped10: RecentMatch[] = (fx10 ?? []).map((f: any) => {
        const meHome = f.home_user_id === profile.id;
        const opponent_username = meHome
          ? f.away_username ?? "—"
          : f.home_username ?? "—";
        const my_goals = meHome ? f.home_goals ?? 0 : f.away_goals ?? 0;
        const opp_goals = meHome ? f.away_goals ?? 0 : f.home_goals ?? 0;
        const myPts = meHome ? f.home_pts : f.away_pts;
        const result: "Z" | "R" | "P" =
          myPts === 3 ? "Z" : myPts === 1 ? "R" : "P";
        return {
          round_no: f.round_no,
          opponent_username,
          my_goals,
          opp_goals,
          result,
        };
      });
      setRecentMatches(mapped10);

      // 3) totals Z/R/P z CAŁEGO sezonu (bez limitu)
      const { data: allFx, error: e5 } = await supabase
        .from("fixture_scores")
        .select("home_pts, away_pts, home_user_id, away_user_id")
        .eq("league_id", leagueId)
        .or(`home_user_id.eq.${profile.id},away_user_id.eq.${profile.id}`);
      if (e5) {
        setError(e5.message);
        return;
      }
      let w = 0,
        d = 0,
        l = 0;
      (allFx ?? []).forEach((f: any) => {
        const meHome = f.home_user_id === profile.id;
        const myPts = meHome ? f.home_pts : f.away_pts;
        if (myPts === 3) w++;
        else if (myPts === 1) d++;
        else l++;
      });
      setTotals({ w, d, l });
    })();
  }, [leagueId, profile]);

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "40px auto",
        padding: 16,
        fontFamily:
          "system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
      }}
    >
      <h1>Profil {profile?.username ?? username}</h1>
      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      {profile && (
        <>
          {/* Avatar */}
          {profile.avatar_url && (
            <img
              src={profile.avatar_url}
              alt="avatar"
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                objectFit: "cover",
                margin: "8px 0",
              }}
            />
          )}

          {/* Ulubiony zespół */}
          <p>
            <b>Ulubiony zespół:</b> {profile.favorite_team ?? "—"}
          </p>

          {/* Opis */}
          {profile.bio && (
            <div style={{ marginTop: 12 }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: "bold" }}>Opis:</h2>
              <p style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                {profile.bio}
              </p>
            </div>
          )}

          {/* Wybór ligi + pozycja + forma */}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            <label>
              Liga:{" "}
              <select
                value={leagueId ?? ""}
                onChange={(e) => setLeagueId(e.target.value || null)}
              >
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <span>
              <b>Miejsce w tabeli:</b> {position ?? "—"}
            </span>
            <span>
              <b>Forma (5):</b> {recent.length ? recent.join(",") : "—"}
            </span>
            <span>
              <b>Bilans (sezon):</b> {totals.w}-{totals.d}-{totals.l}
            </span>
          </div>

          {/* Ostatnie mecze (10) */}
          <div style={{ marginTop: 16 }}>
            <h2
              style={{
                fontSize: "1.1rem",
                fontWeight: "bold",
                marginBottom: 8,
              }}
            >
              Ostatnie mecze (10)
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      Kolejka
                    </th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      Przeciwnik
                    </th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      Wynik
                    </th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                      Rezultat
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentMatches.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: 8 }}>
                        Brak meczów.
                      </td>
                    </tr>
                  ) : (
                    recentMatches.map((m, i) => (
                      <tr key={i}>
                        <td
                          style={{
                            padding: 8,
                            borderBottom: "1px solid #f0f0f0",
                          }}
                        >
                          {m.round_no}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            borderBottom: "1px solid #f0f0f0",
                          }}
                        >
                          {m.opponent_username}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            borderBottom: "1px solid #f0f0f0",
                          }}
                        >
                          {m.my_goals} : {m.opp_goals}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            borderBottom: "1px solid #f0f0f0",
                          }}
                        >
                          {m.result}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edytuj profil – tylko właściciel */}
          {profile.id === meId && (
            <div style={{ marginTop: 8 }}>
              <Link
                to={`/profile/${encodeURIComponent(
                  profile.username || ""
                )}/edit`}
              >
                ✏️ Edytuj profil
              </Link>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Link to="/dashboard">← Wróć</Link>
          </div>
        </>
      )}
    </div>
  );
}
