import { Injectable, Logger } from '@nestjs/common';

interface GeoResult {
  latitude: number;
  longitude: number;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private cache = new Map<string, GeoResult | null>();
  private lastRequestTime = 0;

  private async rateLimitedFetch(query: string): Promise<GeoResult | null> {
    const cached = this.cache.get(query);
    if (cached !== undefined) return cached;

    // Nominatim requires max 1 req/s
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < 1100) {
      await new Promise((r) => setTimeout(r, 1100 - elapsed));
    }
    this.lastRequestTime = Date.now();

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'pt-BR',
          'User-Agent': 'GoverneAI/1.0',
        },
      });
      const data = await res.json();
      if (data.length > 0) {
        const result: GeoResult = {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        };
        this.cache.set(query, result);
        return result;
      }
      this.cache.set(query, null);
      return null;
    } catch (err) {
      this.logger.warn(`Geocoding failed for "${query}": ${err}`);
      return null;
    }
  }

  async geocode(parts: {
    address?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }): Promise<GeoResult | null> {
    const { address, neighborhood, city, state, zipCode } = parts;

    // Fallback progressivo
    const attempts = [
      [address, neighborhood, city, state].filter(Boolean).join(', '),
      [neighborhood, city, state].filter(Boolean).join(', '),
      zipCode ? `${zipCode}, Brasil` : '',
      [city, state].filter(Boolean).join(', '),
    ].filter(Boolean);

    for (const query of attempts) {
      const result = await this.rateLimitedFetch(query);
      if (result) return result;
    }
    return null;
  }

  /**
   * Geocode em batch com progresso. Retorna mapa de index → resultado.
   */
  async geocodeBatch(
    items: Array<{
      address?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    }>,
  ): Promise<Map<number, GeoResult>> {
    const results = new Map<number, GeoResult>();
    for (let i = 0; i < items.length; i++) {
      const result = await this.geocode(items[i]);
      if (result) results.set(i, result);
    }
    return results;
  }
}
