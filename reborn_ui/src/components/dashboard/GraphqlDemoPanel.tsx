import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GraphqlExample = {
  label: string;
  query: string;
  variables: string;
};

const EXAMPLES: GraphqlExample[] = [
  {
    label: "Summary + basic zone fields",
    query: `query DashboardGraph($state: String!) {
  demoSummary(state: $state, sampleSize: 6) {
    message
    totalZones
    onlineZones
    sampleZoneKeys
  }
  zones(limit: 6, state: $state) {
    zoneKey
    zoneName
    state
  }
}`,
    variables: '{\n  "state": "ANY"\n}',
  },
  {
    label: "Only names",
    query: `query OnlyNames {
  zones(limit: 5, state: "ON") {
    zoneKey
    zoneName
  }
}`,
    variables: "{}",
  },
  {
    label: "Single zone detail",
    query: `query ZoneDetail($zoneKey: String!) {
  zone(zoneKey: $zoneKey) {
    zoneKey
    zoneName
    port
    bit
    state
    currentUptime
    dayUptime
    totalUptime
    enabled
    active
  }
}`,
    variables: '{\n  "zoneKey": "PORTA:0"\n}',
  },
];

function parseVariables(rawVariables: string): Record<string, unknown> {
  const trimmed = rawVariables.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("Variables must be a JSON object");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`Variables JSON error: ${message}`);
  }
}

export function GraphqlDemoPanel() {
  const [query, setQuery] = useState<string>(EXAMPLES[0].query);
  const [variables, setVariables] = useState<string>(EXAMPLES[0].variables);
  const [resultText, setResultText] = useState<string>("Run a query to see GraphQL response payload.");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const selectedFieldsHint = useMemo(() => {
    const known = ["zoneKey", "zoneName", "state", "currentUptime", "onlineZones"];
    return known.filter((field) => query.includes(field)).join(", ");
  }, [query]);

  const runQuery = async () => {
    setLoading(true);
    setError("");

    let parsedVariables: Record<string, unknown>;
    try {
      parsedVariables = parseVariables(variables);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid variables JSON");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables: parsedVariables,
        }),
      });

      const payload = (await response.json()) as unknown;
      setResultText(JSON.stringify(payload, null, 2));

      if (!response.ok) {
        setError("GraphQL request returned errors. Check the response payload below.");
      }
    } catch {
      setError("Network error while calling /api/graphql");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="panel-glass gap-3 text-slate-100">
      <CardHeader className="pb-0">
        <CardTitle>GraphQL Demo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-300">
          This panel sends live GraphQL queries to <span className="font-mono">/api/graphql</span>. Try changing
          selected fields and compare the response shape.
        </p>

        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button
              key={example.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery(example.query);
                setVariables(example.variables);
                setError("");
              }}
            >
              {example.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-2">
          <label htmlFor="graphql-query" className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Query
          </label>
          <textarea
            id="graphql-query"
            className="min-h-44 w-full rounded-xl border border-slate-500/30 bg-[rgba(15,23,42,0.65)] p-3 font-mono text-xs text-slate-100 outline-none focus:border-amber-400/70"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="graphql-variables" className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Variables (JSON)
          </label>
          <textarea
            id="graphql-variables"
            className="min-h-24 w-full rounded-xl border border-slate-500/30 bg-[rgba(15,23,42,0.65)] p-3 font-mono text-xs text-slate-100 outline-none focus:border-amber-400/70"
            value={variables}
            onChange={(event) => setVariables(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">Fields currently requested: {selectedFieldsHint || "custom"}</span>
          <Button type="button" variant="outline" onClick={() => void runQuery()} disabled={loading}>
            {loading ? "Running..." : "Run GraphQL Query"}
          </Button>
        </div>

        {error ? <div className="rounded-xl border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}

        <div className="rounded-xl border border-slate-500/30 bg-[rgba(2,6,23,0.78)] p-3">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-slate-100">{resultText}</pre>
        </div>
      </CardContent>
    </Card>
  );
}
