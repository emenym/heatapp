export type Port = "PORTA" | "PORTB" | string;

export type Zone = {
  port: Port;
  bit: number;
  zone_key: string;
  zone_name: string;
  state: string;
  current_uptime: number;
  day_uptime: number;
  total_uptime: number;
  enabled: boolean;
  active: boolean;
};

export type MonitoringStatus = {
  last_sample_at: string;
  sample_source: "hardware" | "mock";
  expected_interval_seconds: number;
};

export type DataRange = {
  first: string | null;
  last: string | null;
};

export type MappingItem = {
  port: Port;
  bit: number;
  zone_key: string;
  zone_name: string;
  enabled: boolean;
};

export type ZonesResponse = {
  zones?: Zone[];
};

export type MappingResponse = {
  mapping?: MappingItem[];
};

export type ApiErrorResponse = {
  error?: string;
};

export type MapFormState = {
  port: Port;
  bit: number;
  zone_key: string;
  zone_name: string;
  enabled: boolean;
};
