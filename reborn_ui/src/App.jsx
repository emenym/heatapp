import { useEffect, useMemo, useState } from "react";

const sortByPortBit = (a, b) => {
  if (a.port === b.port) {
    return a.bit - b.bit;
  }
  return a.port.localeCompare(b.port);
};

function App() {
  const [zones, setZones] = useState([]);
  const [mapping, setMapping] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renameDraft, setRenameDraft] = useState({});
  const [mapForm, setMapForm] = useState({
    port: "PORTA",
    bit: 0,
    zone_key: "",
    zone_name: "",
    enabled: true,
  });

  const zoneCount = zones.length;
  const onlineCount = useMemo(() => zones.filter((z) => z.state === "1").length, [zones]);

  const fetchAll = async () => {
    setError("");
    try {
      const [zonesRes, mapRes] = await Promise.all([
        fetch("/api/zones"),
        fetch("/api/mapping"),
      ]);

      if (!zonesRes.ok) {
        throw new Error("Failed to load zones");
      }
      if (!mapRes.ok) {
        throw new Error("Failed to load mapping");
      }

      const zonesData = await zonesRes.json();
      const mapData = await mapRes.json();
      setZones((zonesData.zones || []).slice().sort(sortByPortBit));
      setMapping((mapData.mapping || []).slice().sort(sortByPortBit));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10000);
    return () => clearInterval(id);
  }, []);

  const doPoll = async () => {
    setError("");
    const res = await fetch("/api/poll", { method: "POST" });
    if (!res.ok) {
      setError("Poll request failed");
      return;
    }
    fetchAll();
  };

  const submitRename = async (zoneKey) => {
    const zoneName = (renameDraft[zoneKey] || "").trim();
    if (!zoneName) {
      setError("Rename requires a non-empty zone_name");
      return;
    }

    const res = await fetch(`/api/zones/${encodeURIComponent(zoneKey)}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone_name: zoneName }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Rename failed");
      return;
    }

    setRenameDraft((prev) => ({ ...prev, [zoneKey]: "" }));
    fetchAll();
  };

  const submitMapping = async (e) => {
    e.preventDefault();
    setError("");

    const body = {
      port: mapForm.port,
      bit: Number(mapForm.bit),
      zone_key: mapForm.zone_key || undefined,
      zone_name: mapForm.zone_name || undefined,
      enabled: !!mapForm.enabled,
    };

    const res = await fetch("/api/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Mapping update failed");
      return;
    }

    setMapForm((prev) => ({ ...prev, zone_name: "", zone_key: "" }));
    fetchAll();
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">heatapp reborn</p>
          <h1>Zone Control Matrix</h1>
          <p className="subhead">Stable identity by zone_key, mutable display labels, and live channel mapping.</p>
        </div>
        <div className="hero-stats">
          <div>
            <span>Zones</span>
            <strong>{zoneCount}</strong>
          </div>
          <div>
            <span>Active</span>
            <strong>{onlineCount}</strong>
          </div>
          <button onClick={doPoll}>Poll Now</button>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="grid">
        <section className="panel">
          <h2>Zones</h2>
          {loading ? <p>Loading zones...</p> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Bit</th>
                  <th>Zone Key</th>
                  <th>Name</th>
                  <th>State</th>
                  <th>Current</th>
                  <th>24h</th>
                  <th>Total</th>
                  <th>Rename</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.zone_key}>
                    <td>{zone.port}</td>
                    <td>{zone.bit}</td>
                    <td className="mono">{zone.zone_key}</td>
                    <td>{zone.zone_name}</td>
                    <td>
                      <span className={zone.state === "1" ? "state on" : "state off"}>{zone.state === "1" ? "ON" : "OFF"}</span>
                    </td>
                    <td>{zone.current_uptime}s</td>
                    <td>{zone.day_uptime}s</td>
                    <td>{zone.total_uptime}s</td>
                    <td>
                      <div className="inline-edit">
                        <input
                          value={renameDraft[zone.zone_key] || ""}
                          onChange={(e) => setRenameDraft((prev) => ({ ...prev, [zone.zone_key]: e.target.value }))}
                          placeholder="New name"
                        />
                        <button onClick={() => submitRename(zone.zone_key)}>Save</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Hardware Map</h2>
          <form className="mapping-form" onSubmit={submitMapping}>
            <label>
              Port
              <select value={mapForm.port} onChange={(e) => setMapForm((p) => ({ ...p, port: e.target.value }))}>
                <option value="PORTA">PORTA</option>
                <option value="PORTB">PORTB</option>
              </select>
            </label>
            <label>
              Bit
              <input type="number" min="0" max="7" value={mapForm.bit} onChange={(e) => setMapForm((p) => ({ ...p, bit: e.target.value }))} />
            </label>
            <label>
              Zone Key (optional)
              <input value={mapForm.zone_key} onChange={(e) => setMapForm((p) => ({ ...p, zone_key: e.target.value }))} placeholder="PORTA:3" />
            </label>
            <label>
              Zone Name (required for new key)
              <input value={mapForm.zone_name} onChange={(e) => setMapForm((p) => ({ ...p, zone_name: e.target.value }))} placeholder="Studio" />
            </label>
            <label className="check">
              <input type="checkbox" checked={mapForm.enabled} onChange={(e) => setMapForm((p) => ({ ...p, enabled: e.target.checked }))} />
              Enabled
            </label>
            <button type="submit">Apply Mapping Change</button>
          </form>

          <div className="table-wrap map-list">
            <table>
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Bit</th>
                  <th>Zone Key</th>
                  <th>Name</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((item) => (
                  <tr key={`${item.port}-${item.bit}`}>
                    <td>{item.port}</td>
                    <td>{item.bit}</td>
                    <td className="mono">{item.zone_key}</td>
                    <td>{item.zone_name}</td>
                    <td>{item.enabled ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
