import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";

type League = {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
};

type LeagueRow = {
  league_id: string;
  user_id: string;
  username: string | null;
  favorite_team: string | null;
  points: number;
  last5matches: string | null;
  joined_at: string;
};

type FixtureScore = {
  league_id: string;
  round_no: number;
  home_user_id: string;
  home_username: string | null;
  away_user_id: string;
  away_username: string | null;
  home_goals: number;
  away_goals: number;
  home_pts: number;
  away_pts: number;
};

type RealMatch = {
  id: string;
  league_code: string;
  season: number;
  matchday: number;
  kickoff: string | null;
  home_team: string;
  away_team: string;
  home_goals: number | null;
  away_goals: number | null;
};

export function Dashboard() {
  const nav = useNavigate();

  // Sesja / user
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Ligi
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);

  // Tabela ligi
  const [tableRows, setTableRows] = useState<LeagueRow[]>([]);

  // Create/join
  const [newLeagueName, setNewLeagueName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // Kolejki / terminarz / mapowanie
  const [roundNo, setRoundNo] = useState<number>(1);
  const [mapLeagueCode, setMapLeagueCode] = useState<"EKSTRA" | "BUNDES">(
    "EKSTRA"
  );
  const [mapSeason, setMapSeason] = useState<number>(2025);
  const [mapMatchday, setMapMatchday] = useState<number>(1);

  // Mecze realne + typowanie
  const [realMatches, setRealMatches] = useState<RealMatch[]>([]);
  const [myPreds, setMyPreds] = useState<
    Record<string, { h: string; a: string }>
  >({}); // real_match_id -> {h,a}

  // H2H wyniki
  const [fixtures, setFixtures] = useState<FixtureScore[]>([]);

  // UX
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // ======== Sesja ========
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      if (!user) {
        nav("/");
        return;
      }
      setUserId(user.id);

      // dociągnij username z profiles
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      if (!profErr && prof) setUsername(prof.username ?? null);

      await loadLeagues(user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  // Domyślny wybór ligi
  useEffect(() => {
    if (leagues.length > 0 && !selectedLeagueId) {
      setSelectedLeagueId(leagues[0].id);
    }
  }, [leagues, selectedLeagueId]);

  // Załaduj tabelę po zmianie ligi
  useEffect(() => {
    if (!selectedLeagueId) return;
    loadLeagueTable(selectedLeagueId);
  }, [selectedLeagueId]);

  // ======== Data loaders ========
  async function loadLeagues(uid: string) {
    setError(null);
    const { data, error } = await supabase
      .from("leagues")
      .select(
        "id, name, owner_id, invite_code, created_at, league_members!inner(user_id)"
      )
      .eq("league_members.user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      owner_id: r.owner_id,
      invite_code: r.invite_code,
      created_at: r.created_at,
    })) as League[];
    setLeagues(rows);
  }

  async function loadLeagueTable(leagueId: string) {
    setError(null);
    const { data, error } = await supabase
      .from("league_table")
      .select(
        "league_id, user_id, username, favorite_team, points, last5matches, joined_at"
      )
      .eq("league_id", leagueId);

    if (error) {
      setError(error.message);
      return;
    }
    const sorted = (data ?? []).sort((a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points;
      const ua = (a.username ?? "").toLowerCase();
      const ub = (b.username ?? "").toLowerCase();
      return ua.localeCompare(ub);
    }) as LeagueRow[];
    setTableRows(sorted);
  }

  async function loadFixtureScores() {
    if (!selectedLeagueId) return;
    setError(null);
    const { data, error } = await supabase
      .from("fixture_scores")
      .select(
        "league_id, round_no, home_user_id, home_username, away_user_id, away_username, home_goals, away_goals, home_pts, away_pts"
      )
      .eq("league_id", selectedLeagueId)
      .eq("round_no", roundNo);
    if (error) setError(error.message);
    else setFixtures(data ?? []);
  }

  async function loadRealMatchesForMapping() {
    if (!selectedLeagueId) return;
    // Najpierw sprawdź mapowanie dla (league_id, round_no)
    setError(null);
    const { data: map, error: mapErr } = await supabase
      .from("round_matchday_map")
      .select("*")
      .eq("league_id", selectedLeagueId)
      .eq("round_no", roundNo)
      .maybeSingle();
    if (mapErr) {
      setError(mapErr.message);
      return;
    }
    if (!map) {
      setInfo("Brak mapowania tej kolejki – ustaw je poniżej.");
      setRealMatches([]);
      return;
    }
    // Wczytaj mecze realne
    const { data, error } = await supabase
      .from("real_matches")
      .select("*")
      .eq("league_code", map.league_code)
      .eq("season", map.season)
      .eq("matchday", map.matchday)
      .order("kickoff", { ascending: true });
    if (error) setError(error.message);
    else {
      setRealMatches(data ?? []);
      // zainicjuj stan preds dla wygody
      const init: Record<string, { h: string; a: string }> = {};
      (data ?? []).forEach((m) => (init[m.id] = { h: "", a: "" }));
      setMyPreds(init);
    }
  }

  // ======== Actions ========
  async function createLeague() {
    if (!userId) return;
    const name = newLeagueName.trim();
    if (name.length < 3) {
      setError("Nazwa ligi musi mieć co najmniej 3 znaki.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error } = await supabase
        .from("leagues")
        .insert([{ name, owner_id: userId }])
        .select()
        .single();
      if (error) throw error;
      setInfo(
        `Liga "${data.name}" utworzona. Kod zaproszenia: ${data.invite_code}`
      );
      setNewLeagueName("");
      await loadLeagues(userId);
      setSelectedLeagueId(data.id);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się utworzyć ligi.");
    } finally {
      setBusy(false);
    }
  }

  async function joinLeague() {
    if (!userId) return;
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("Wpisz poprawny kod zaproszenia.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error } = await supabase.rpc("join_league_by_code", {
        p_code: code,
      });
      if (error) throw error;
      setInfo("Dołączono do ligi.");
      setJoinCode("");
      await loadLeagues(userId);
      if (data) setSelectedLeagueId(String(data));
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się dołączyć do ligi.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    nav("/");
  }

  async function generateSchedule() {
    if (!selectedLeagueId) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.rpc("rpc_generate_round_robin", {
        p_league_id: selectedLeagueId,
        p_double: false,
      });
      if (error) throw error;
      setInfo("Terminarz wygenerowany.");
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się wygenerować terminarza.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping() {
    if (!selectedLeagueId) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.from("round_matchday_map").upsert({
        league_id: selectedLeagueId,
        round_no: roundNo,
        league_code: mapLeagueCode,
        season: mapSeason,
        matchday: mapMatchday,
      });
      if (error) throw error;
      setInfo("Mapowanie zapisane.");
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się zapisać mapowania.");
    } finally {
      setBusy(false);
    }
  }

  async function savePred(matchId: string) {
    if (!userId) return;
    const pair = myPreds[matchId];
    if (!pair) return;
    const ph = parseInt(pair.h, 10);
    const pa = parseInt(pair.a, 10);
    if (Number.isNaN(ph) || Number.isNaN(pa) || ph < 0 || pa < 0) {
      setError("Podaj poprawne liczby bramek (0+).");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.from("user_predictions").insert({
        user_id: userId,
        real_match_id: matchId,
        pred_home_goals: ph,
        pred_away_goals: pa,
      });
      if (error?.message?.includes("duplicate key value")) {
        const { error: upErr } = await supabase
          .from("user_predictions")
          .update({ pred_home_goals: ph, pred_away_goals: pa })
          .eq("user_id", userId)
          .eq("real_match_id", matchId);
        if (upErr) throw upErr;
        setInfo("Typ zaktualizowany.");
      } else if (error) {
        throw error;
      } else {
        setInfo("Typ zapisany.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się zapisać typu.");
    } finally {
      setBusy(false);
    }
  }

  const selectedLeague = useMemo(
    () => leagues.find((l) => l.id === selectedLeagueId) || null,
    [leagues, selectedLeagueId]
  );

  return (
    <div className="container">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>
          Ligowiec – Typuj ze znajomymi!
        </h1>

        <div style={{ fontSize: 14 }}>
          Zalogowano jako: <b>{username ?? "—"}</b>
          <button onClick={logout} style={{ marginLeft: 8 }}>
            Wyloguj
          </button>
        </div>
      </header>

      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}
      {info && <div style={{ color: "green", marginBottom: 12 }}>{info}</div>}

      {/* --- Sekcja: Utwórz ligę / Dołącz --- */}
      <section
        style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}
      >
        <div
          style={{
            background: "#fff",
            padding: 16,
            border: "1px solid #eee",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Utwórz ligę</h2>
          <input
            type="text"
            placeholder="Nazwa ligi"
            value={newLeagueName}
            onChange={(e) => setNewLeagueName(e.target.value)}
          />
          <button
            onClick={createLeague}
            disabled={busy}
            style={{ marginTop: 8 }}
          >
            {busy ? "..." : "Utwórz"}
          </button>
          <p style={{ fontSize: 12, color: "#555" }}>
            Właściciel zostanie automatycznie dodany jako członek.
          </p>
        </div>

        <div
          style={{
            background: "#fff",
            padding: 16,
            border: "1px solid #eee",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Dołącz do ligi</h2>
          <input
            type="text"
            placeholder="Kod zaproszenia (np. 8 znaków)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button onClick={joinLeague} disabled={busy} style={{ marginTop: 8 }}>
            {busy ? "..." : "Dołącz"}
          </button>
        </div>
      </section>

      <hr style={{ margin: "20px 0" }} />

      {/* --- Sekcja: Wybór ligi + kod --- */}
      <section
        style={{
          background: "#fff",
          padding: 16,
          border: "1px solid #eee",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>Twoje ligi</h2>
          <select
            value={selectedLeagueId ?? ""}
            onChange={(e) => setSelectedLeagueId(e.target.value || null)}
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {selectedLeague && (
            <span style={{ fontSize: 12, color: "#555" }}>
              Kod zaproszenia: <b>{selectedLeague.invite_code}</b>
              {userId === selectedLeague.owner_id ? " (właściciel)" : ""}
            </span>
          )}
        </div>
      </section>

      <hr style={{ margin: "20px 0" }} />

      {/* --- Sekcja: Tabela ligi --- */}
      <section
        style={{
          background: "#fff",
          padding: 16,
          border: "1px solid #eee",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Tabela ligi</h2>
        {tableRows.length === 0 ? (
          <p>Brak danych do wyświetlenia.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Login
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Ulubiony zespół
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "8px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Punkty
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Forma (5)
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={r.user_id}>
                    <td
                      style={{
                        padding: "8px",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      {r.username ? (
                        <Link to={`/profile/${encodeURIComponent(r.username)}`}>
                          {r.username}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      {r.favorite_team ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        borderBottom: "1px solid #f0f0f0",
                        textAlign: "right",
                      }}
                    >
                      {r.points}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      {r.last5matches ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <hr style={{ margin: "20px 0" }} />

      {/* --- Sekcja: Kolejki / terminarz / mapowanie --- */}
      <section
        style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}
      >
        <div
          style={{
            background: "#fff",
            padding: 16,
            border: "1px solid #eee",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Terminarz</h2>
          <button
            onClick={generateSchedule}
            disabled={!selectedLeagueId || busy}
          >
            {busy ? "..." : "Generuj terminarz (1 runda)"}
          </button>
          <p style={{ fontSize: 12, color: "#555" }}>
            Wymaga min. 2 członków w lidze.
          </p>
        </div>

        <div
          style={{
            background: "#fff",
            padding: 16,
            border: "1px solid #eee",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Mapowanie kolejki</h2>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <label>
              Kolejka:{" "}
              <input
                type="number"
                value={roundNo}
                onChange={(e) => setRoundNo(parseInt(e.target.value, 10) || 1)}
                style={{ width: 70 }}
              />
            </label>
            <label>
              Liga:&nbsp;
              <select
                value={mapLeagueCode}
                onChange={(e) => setMapLeagueCode(e.target.value as any)}
              >
                <option value="EKSTRA">Ekstraklasa</option>
                <option value="BUNDES">Bundesliga</option>
              </select>
            </label>
            <label>
              Sezon:{" "}
              <input
                type="number"
                value={mapSeason}
                onChange={(e) =>
                  setMapSeason(parseInt(e.target.value, 10) || 2025)
                }
                style={{ width: 90 }}
              />
            </label>
            <label>
              Kolejka realna:{" "}
              <input
                type="number"
                value={mapMatchday}
                onChange={(e) =>
                  setMapMatchday(parseInt(e.target.value, 10) || 1)
                }
                style={{ width: 70 }}
              />
            </label>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={saveMapping} disabled={!selectedLeagueId || busy}>
              {busy ? "..." : "Zapisz mapowanie"}
            </button>
            <button
              onClick={loadRealMatchesForMapping}
              disabled={!selectedLeagueId}
            >
              Pokaż mecze realne
            </button>
          </div>
        </div>
      </section>

      {/* --- Sekcja: Typowanie meczów realnych --- */}
      <section
        style={{
          marginTop: 12,
          background: "#fff",
          padding: 16,
          border: "1px solid #eee",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Typuj mecze tej kolejki</h2>
        {realMatches.length === 0 ? (
          <p>
            Brak meczów do typowania (najpierw ustaw mapowanie i/lub dodaj mecze
            do <code>real_matches</code>).
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {realMatches.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: "1px solid #f0f0f0",
                  paddingBottom: 8,
                }}
              >
                <div style={{ minWidth: 220 }}>
                  {m.home_team} vs {m.away_team}
                </div>
                <input
                  type="number"
                  placeholder="gospodarz"
                  value={myPreds[m.id]?.h ?? ""}
                  onChange={(e) =>
                    setMyPreds((prev) => ({
                      ...prev,
                      [m.id]: { h: e.target.value, a: prev[m.id]?.a ?? "" },
                    }))
                  }
                  style={{ width: 80 }}
                />
                <span>:</span>
                <input
                  type="number"
                  placeholder="goście"
                  value={myPreds[m.id]?.a ?? ""}
                  onChange={(e) =>
                    setMyPreds((prev) => ({
                      ...prev,
                      [m.id]: { h: prev[m.id]?.h ?? "", a: e.target.value },
                    }))
                  }
                  style={{ width: 80 }}
                />
                <button onClick={() => savePred(m.id)} disabled={busy}>
                  {busy ? "..." : "Zapisz typ"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Sekcja: Wyniki H2H --- */}
      <section
        style={{
          marginTop: 12,
          background: "#fff",
          padding: 16,
          border: "1px solid #eee",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Wyniki H2H tej kolejki</h2>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <label>
            Kolejka:{" "}
            <input
              type="number"
              value={roundNo}
              onChange={(e) => setRoundNo(parseInt(e.target.value, 10) || 1)}
              style={{ width: 70 }}
            />
          </label>
          <button onClick={loadFixtureScores} disabled={!selectedLeagueId}>
            Odśwież
          </button>
        </div>
        {fixtures.length === 0 ? (
          <p>Brak wyników do wyświetlenia.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: 8,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  Home (user)
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: 8,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  Gole
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: 8,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  vs
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: 8,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  Gole
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: 8,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  Away (user)
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: 8,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  Punkty
                </th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map((f, i) => (
                <tr key={i}>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                    {f.home_username ?? f.home_user_id}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      textAlign: "center",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    {f.home_goals}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      textAlign: "center",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    :
                  </td>
                  <td
                    style={{
                      padding: 8,
                      textAlign: "center",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    {f.away_goals}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      borderBottom: "1px solid " + "#f0f0f0",
                    }}
                  >
                    {f.away_username ?? f.away_user_id}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      textAlign: "center",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    {f.home_pts} – {f.away_pts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
