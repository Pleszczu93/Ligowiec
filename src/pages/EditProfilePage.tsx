import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  favorite_team: string | null;
  bio: string | null;
  avatar_url: string | null;
  email?: string | null;
};

function extractAvatarPath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/avatars/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.substring(idx + marker.length);
}

export default function EditProfilePage() {
  const { username } = useParams<{ username: string }>();
  const nav = useNavigate();

  const [meId, setMeId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [favoriteTeam, setFavoriteTeam] = useState("");
  const [bio, setBio] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      const { data: s } = await supabase.auth.getUser();
      const uid = s.user?.id ?? null;
      if (!uid) {
        nav("/");
        return;
      }
      setMeId(uid);

      const { data: p, error: e1 } = await supabase
        .from("profiles")
        .select("id, username, favorite_team, bio, avatar_url, email")
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

      if (p.id !== uid) {
        setError("Brak uprawnień do edycji tego profilu.");
        return;
      }

      setProfile(p);
      setFavoriteTeam(p.favorite_team ?? "");
      setBio(p.bio ?? "");
    })();
  }, [username, nav]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const avatarToShow = useMemo(
    () => preview ?? profile?.avatar_url ?? null,
    [preview, profile?.avatar_url]
  );

  async function onSave() {
    if (!profile || !meId) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      let avatar_url = profile.avatar_url ?? null;

      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${meId}/${Date.now()}.${ext}`;

        const up = await supabase.storage.from("avatars").upload(path, file, {
          upsert: true,
          contentType: file.type || `image/${ext}`,
        });
        if (up.error) throw up.error;

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        avatar_url = data.publicUrl;
      }

      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          favorite_team: favoriteTeam || null,
          bio: bio || null,
          avatar_url: avatar_url,
        })
        .eq("id", meId);
      if (updErr) throw updErr;

      setInfo("Profil zapisany.");
      setTimeout(
        () => nav(`/profile/${encodeURIComponent(String(username))}`),
        600
      );
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się zapisać profilu.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAvatar() {
    if (!profile || !profile.avatar_url) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const path = extractAvatarPath(profile.avatar_url);
      if (!path)
        throw new Error(
          "Nieprawidłowy URL avatara – nie mogę wyliczyć ścieżki."
        );

      const { error: delErr } = await supabase.storage
        .from("avatars")
        .remove([path]);
      if (delErr) throw delErr;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", profile.id);
      if (updErr) throw updErr;

      setProfile({ ...profile, avatar_url: null });
      setPreview(null);
      setFile(null);
      setInfo("Avatar usunięty.");
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się usunąć avatara.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "40px auto",
        padding: 16,
        fontFamily:
          "system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
      }}
    >
      <h1>Edytuj profil {username}</h1>
      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}
      {info && <div style={{ color: "green", marginBottom: 12 }}>{info}</div>}

      {!profile ? (
        <div>Ładowanie…</div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                background: "#f4f4f4",
                overflow: "hidden",
              }}
            >
              {avatarToShow ? (
                <img
                  src={avatarToShow}
                  alt="avatar"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#888",
                  }}
                >
                  brak
                </div>
              )}
            </div>

            <div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div style={{ fontSize: 12, color: "#666" }}>
                Obsługujemy png/jpg/webp. Maks. kilka MB.
              </div>

              {profile?.avatar_url && (
                <button
                  type="button"
                  onClick={deleteAvatar}
                  disabled={busy}
                  style={{ marginTop: 8 }}
                >
                  {busy ? "..." : "Usuń avatar"}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <label>
              Ulubiony zespół:
              <input
                type="text"
                value={favoriteTeam}
                onChange={(e) => setFavoriteTeam(e.target.value)}
                placeholder="np. Górnik Zabrze"
                style={{ display: "block", width: "100%", marginTop: 4 }}
              />
            </label>

            <label>
              Opis (bio):
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Kilka słów o sobie…"
                rows={5}
                style={{ display: "block", width: "100%", marginTop: 4 }}
              />
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onSave} disabled={busy}>
                {busy ? "..." : "Zapisz"}
              </button>
              <button onClick={() => nav(-1)} disabled={busy}>
                Anuluj
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
