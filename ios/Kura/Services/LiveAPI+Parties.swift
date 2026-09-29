import Foundation

// Colecciones de fiesta over HTTP (`.claude/knowledge/state/fiesta-contract.md` §5, zod in
// `src/app/api/v1/_lib/schemas.ts` › "Parties", serializers in `_lib/wire/party.ts`). Every id and
// token goes through `APIPath` like the rest of the client.

extension LiveAPI {
    private struct PartyItems<T: Decodable>: Decodable { let items: [T] }

    /// `perGuestLimit` always goes on the wire: `null` is "ilimitadas", not "the default 3".
    private struct NewParty: Encodable {
        let name: String
        let perGuestLimit: Int?
        private enum CodingKeys: String, CodingKey { case name, perGuestLimit }
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(name, forKey: .name)
            try c.encode(perGuestLimit, forKey: .perGuestLimit)
        }
    }

    /// Only the fields set; `perGuestLimit: .some(nil)` is an explicit `null` (ilimitadas).
    private struct PartyPatch: Encodable {
        let name: String?
        let perGuestLimit: Int??
        private enum CodingKeys: String, CodingKey { case name, perGuestLimit }
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encodeIfPresent(name, forKey: .name)
            if let limit = perGuestLimit { try c.encode(limit, forKey: .perGuestLimit) }
        }
    }

    private struct SongPalette: Encodable { let paletteHex: [String]? }

    func parties() async throws -> [PartyCard] {
        let r: PartyItems<PartyCard> = try await client.decode(.get("parties"))
        return r.items
    }

    func createParty(name: String, perGuestLimit: Int?) async throws -> Party {
        try await client.decode(try .post("parties", NewParty(name: name, perGuestLimit: perGuestLimit)))
    }

    func party(id: String) async throws -> Party {
        try await client.decode(.get("parties/\(id)"))
    }

    func updateParty(id: String, name: String?, perGuestLimit: Int??) async throws -> Party {
        try await client.decode(try .patch("parties/\(id)", PartyPatch(name: name, perGuestLimit: perGuestLimit)))
    }

    func deleteParty(id: String) async throws {
        try await client.send(.delete("parties/\(id)"))
    }

    func rotatePartyInvite(id: String) async throws -> Party {
        try await client.decode(.post("parties/\(id)/invite"))
    }

    func revokePartyInvite(id: String) async throws -> Party {
        try await client.decode(.delete("parties/\(id)/invite"))
    }

    func searchPartySongs(id: String, query: String) async throws -> [PartySongHit] {
        let r: PartyItems<PartySongHit> = try await client.decode(.get("parties/\(id)/songs", [URLQueryItem(name: "q", value: query)]))
        return r.items
    }

    func addPartySong(id: String, titleID: String, paletteHex: [String]?) async throws -> Party {
        try await client.decode(try .put("parties/\(id)/songs/\(titleID)", SongPalette(paletteHex: paletteHex)))
    }

    func removePartySong(id: String, titleID: String) async throws -> Party {
        try await client.decode(.delete("parties/\(id)/songs/\(titleID)"))
    }

    func removeAndBlockPartyGuest(id: String, titleID: String) async throws -> Party {
        try await client.decode(.post("parties/\(id)/songs/\(titleID)/block"))
    }

    func fillPartySongPalette(id: String, titleID: String, hexes: [String]) async throws {
        try await client.send(try .put("parties/\(id)/songs/\(titleID)/palette", SongPalette(paletteHex: hexes)))
    }

    func unblockPartyGuest(id: String, guestRef: String) async throws -> Party {
        try await client.decode(.delete("parties/\(id)/blocked/\(guestRef)"))
    }

    func leaveParty(id: String) async throws {
        try await client.send(.post("parties/\(id)/leave"))
    }

    func invitePreview(token: String) async throws -> InvitePreview {
        // Public route with an OPTIONAL bearer: signed out it goes bare (`auth: false` never throws
        // `unauthorized` locally), signed in it carries the token so `viewer` comes back filled.
        // `auth: false` also keeps a 401 here from ending the session — the route never needs one.
        var e = Endpoint.get("invites/\(token)")
        e.auth = false
        e.explicitBearer = client.session.token
        return try await client.decode(e)
    }

    func joinParty(token: String) async throws -> PartyJoin {
        try await client.decode(.post("invites/\(token)/join"))
    }
}
