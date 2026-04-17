import { describe, expect, it } from 'vitest';
import type { Measurement } from './db/schema';
import { toMeasurementDto } from './types';

function baseRow(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: 1,
    timestamp: new Date('2026-04-17T12:00:00Z'),
    downloadMbps: 100,
    uploadMbps: 50,
    latencyUnloadedMs: 10,
    latencyLoadedMs: 20,
    bufferBloatMs: 10,
    status: 'success',
    error: null,
    serverLocations: null,
    userLocation: null,
    userIp: null,
    ...overrides,
  };
}

describe('toMeasurementDto', () => {
  it('carries serverLocations, userLocation, userIp when present', () => {
    const dto = toMeasurementDto(
      baseRow({
        serverLocations: ['Paris', 'Frankfurt'],
        userLocation: 'Paris, France',
        userIp: '81.0.0.1',
      }),
    );
    expect(dto.serverLocations).toEqual(['Paris', 'Frankfurt']);
    expect(dto.userLocation).toBe('Paris, France');
    expect(dto.userIp).toBe('81.0.0.1');
  });

  it('passes nulls through when fields are missing', () => {
    const dto = toMeasurementDto(baseRow());
    expect(dto.serverLocations).toBeNull();
    expect(dto.userLocation).toBeNull();
    expect(dto.userIp).toBeNull();
  });

  it('converts timestamp to epoch millis', () => {
    const dto = toMeasurementDto(baseRow());
    expect(dto.timestamp).toBe(new Date('2026-04-17T12:00:00Z').getTime());
  });
});
