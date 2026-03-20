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
