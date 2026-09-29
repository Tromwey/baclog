import type { ExportState } from "@/modules/music-export/types";
import type { ExportStateWire } from "../schemas";

/**
 * Music export — module `ExportState` → wire. PURE (check-music-export
 * parses it against `ExportStateSchema`). The module shape is already
 * JSON-safe (no dates); this is the one place that would change if it
 * stopped being so.
 */
export function toExportState(s: ExportState): ExportStateWire {
  return {
    provider: s.provider,
    playlistName: s.playlistName,
    status: s.status,
    total: s.total,
    exported: s.exported,
    processed: s.processed,
    current: s.current,
    playlist: s.playlist,
    missing: s.missing.map((m) => ({ ...m })),
    songs: s.songs.map((m) => ({ ...m })),
    busy: s.busy,
  };
}
