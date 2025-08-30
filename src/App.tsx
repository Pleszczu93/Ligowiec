import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function App() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) setError(error.message);
      else setProfiles(data ?? []);
    })();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Ligowiec – Typuj ze znajomymi</h1>
      {error ? (
        <p style={{ color: "red" }}>Błąd: {error}</p>
      ) : (
        <pre>{JSON.stringify(profiles, null, 2)}</pre>
      )}
    </div>
  );
}

export default App;
