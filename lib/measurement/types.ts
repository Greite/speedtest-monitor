// lib/measurement/types.ts

export type EngineResult = {
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyUnloadedMs: number | null;
  latencyLoadedMs: number | null;
  bufferBloatMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  userLocation: string | null;
  userIp: string | null;
  userIsp: string | null;
  serverLocations: string[] | null;
};
