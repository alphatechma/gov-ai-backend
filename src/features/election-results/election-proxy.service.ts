import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

// Perfis com escopo municipal (filtra por city)
const LOCAL_PROFILES = ['VEREADOR', 'PREFEITO', 'VICE_PREFEITO', 'SECRETARIO'];

// Mapeamento perfil politico → cargo no TSE
const PROFILE_TO_CARGO: Record<string, string> = {
  VEREADOR: 'VEREADOR',
  PREFEITO: 'PREFEITO',
  VICE_PREFEITO: 'PREFEITO',
  SECRETARIO: 'VEREADOR',
  DEPUTADO_ESTADUAL: 'DEPUTADO ESTADUAL',
  DEPUTADO_FEDERAL: 'DEPUTADO FEDERAL',
  SENADOR: 'SENADOR',
  GOVERNADOR: 'GOVERNADOR',
  VICE_GOVERNADOR: 'GOVERNADOR',
};

@Injectable()
export class ElectionProxyService {
  private readonly logger = new Logger(ElectionProxyService.name);
  private readonly client: AxiosInstance;

  constructor() {
    const baseURL = process.env.ELECTION_SERVICE_URL || 'http://localhost:3050';
    this.client = axios.create({ baseURL, timeout: 600000 });
    this.logger.log(`Election service proxy: ${baseURL}`);
  }

  // ── Elections (filtrado por tenant) ──

  async listElectionsForTenant(tenant: { politicalProfile: string; state: string; city?: string }) {
    const cargo = PROFILE_TO_CARGO[tenant.politicalProfile] || '';
    const isLocal = LOCAL_PROFILES.includes(tenant.politicalProfile);

    const params: Record<string, string> = {};
    if (tenant.state) params.state = tenant.state;
    if (isLocal && tenant.city) params.city = tenant.city;
    if (cargo) params.cargo = cargo;

    const { data } = await this.client.get('/elections', { params });
    return data;
  }

  async listElections(query?: Record<string, string | undefined>) {
    const params: Record<string, string> = {};
    if (query) {
      Object.entries(query).forEach(([k, v]) => { if (v) params[k] = v; });
    }
    const { data } = await this.client.get('/elections', { params });
    return data;
  }

  async deleteElection(electionId: string) {
    const { data } = await this.client.delete(`/elections/${electionId}`);
    return data;
  }

  // ── Import ──

  async importUpload(fileBuffer: Buffer, originalname: string, metadata: { year: number; state: string; municipalityName: string; round?: number }) {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fileBuffer, { filename: originalname });
    form.append('year', String(metadata.year));
    form.append('state', metadata.state);
    form.append('municipalityName', metadata.municipalityName);
    if (metadata.round) form.append('round', String(metadata.round));

    const { data } = await this.client.post(
      '/elections/import/upload',
      form,
      { headers: form.getHeaders(), timeout: 600000 },
    );
    return data;
  }

  async getTseMunicipalities(state: string) {
    const { data } = await this.client.get(`/elections/tse/municipalities/${state}`);
    return data;
  }

  // ── Analysis (proxy all) ──

  async analysis(electionId: string, endpoint: string, query?: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([k, v]) => { if (v) params.set(k, v); });
    }
    const qs = params.toString();
    const url = `/elections/${electionId}/analysis/${endpoint}${qs ? `?${qs}` : ''}`;
    const { data } = await this.client.get(url);
    return data;
  }
}
