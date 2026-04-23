// Stubbed API client. Typed surface is stable; swap method bodies for real
// fetch/axios calls when the moto-diag backend contract lands.
import Config from 'react-native-config';
import {applyAuth} from './auth';
import type {DiagnosticReport, DtcCode, HealthCheckResponse, VehicleProfile} from '../types/api';

export interface ApiClient {
  healthCheck(): Promise<HealthCheckResponse>;
  getVehicleProfile(vin: string): Promise<VehicleProfile>;
  getDtcCodes(vin: string): Promise<DtcCode[]>;
  submitDiagnosticReport(report: DiagnosticReport): Promise<{id: string}>;
}

export interface ApiClientOptions {
  baseUrl?: string;
}

export function makeClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? Config.API_BASE_URL ?? 'http://localhost:8000';

  const getHeaders = (): Record<string, string> =>
    applyAuth({'Content-Type': 'application/json', Accept: 'application/json'});

  // eslint-disable-next-line no-console
  console.log(`[api] client configured with baseUrl=${baseUrl}`);

  return {
    async healthCheck() {
      void getHeaders();
      return {status: 'stub', version: '0.0.0-stub'};
    },
    async getVehicleProfile(vin) {
      void getHeaders();
      throw new Error(`[api stub] getVehicleProfile(${vin}) not implemented`);
    },
    async getDtcCodes(vin) {
      void getHeaders();
      throw new Error(`[api stub] getDtcCodes(${vin}) not implemented`);
    },
    async submitDiagnosticReport(_report) {
      void getHeaders();
      throw new Error('[api stub] submitDiagnosticReport not implemented');
    },
  };
}
