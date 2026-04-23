export interface HealthCheckResponse {
  status: string;
  version: string;
}

export interface VehicleProfile {
  vin: string;
  make: string;
  model: string;
  year: number;
  engineCode?: string;
}

export interface DtcCode {
  code: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
}

export interface DiagnosticReport {
  vin: string;
  capturedAt: string;
  dtcCodes: DtcCode[];
  liveData?: Record<string, number | string>;
}
