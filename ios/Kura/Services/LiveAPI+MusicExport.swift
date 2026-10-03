import Foundation

// "Llévala a otra app" over HTTP (`.claude/knowledge/state/export-contract.md` §8, zod in
// `src/app/api/v1/_lib/schemas.ts` › "Music export", serializer `_lib/wire/music.ts`). Every id
// goes through `APIPath`; the provider is named explicitly (`provider.rawValue`).

extension LiveAPI {
    private struct TidalStart: Decodable { let authorizeUrl: String }
    private struct TidalComplete: Encodable { let ref: String; let claim: String }

    func musicServices() async throws -> MusicServices {
        try await client.decode(.get("music/services"))
    }

    func startTidalAuth() async throws -> URL {
        let r: TidalStart = try await client.decode(.post("music/tidal/start"))
        // Only TIDAL's own https consent page is ever opened in the browser sheet.
        guard let url = URL(string: r.authorizeUrl), url.scheme == "https",
              let host = url.host?.lowercased(), host == "tidal.com" || host.hasSuffix(".tidal.com") else {
            throw KuraAPIError.server("Respuesta inesperada del servidor")
        }
        return url
    }

    func completeTidalAuth(ref: String, claim: String) async throws -> MusicServices {
        try await client.decode(try .post("music/tidal/complete", TidalComplete(ref: ref, claim: claim)))
    }

    func disconnectTidal() async throws {
        try await client.send(.delete("music/tidal"))
    }

    func partyExport(id: String, provider: MusicProvider) async throws -> ExportState {
        try await exportState(.get("parties/\(id)/exports/\(provider.rawValue)"), provider)
    }

    /// The state of the provider that was ASKED about (its own `provider` field is read leniently).
    private func exportState(_ e: Endpoint, _ provider: MusicProvider) async throws -> ExportState {
        var state: ExportState = try await ExportState.$requested.withValue(provider) { try await client.decode(e) }
        state.provider = provider
        return state
    }

    func startPartyExport(id: String, provider: MusicProvider) async throws -> ExportState {
        try await exportState(.post("parties/\(id)/exports/\(provider.rawValue)"), provider)
    }

    func stepTidalExport(id: String) async throws -> ExportState {
        try await exportState(.post("parties/\(id)/exports/tidal/step"), .tidal)
    }

    func reportAppleMusicExport(id: String, report: AppleMusicReport) async throws -> ExportState {
        try await exportState(try .put("parties/\(id)/exports/apple_music", report), .appleMusic)
    }
}
