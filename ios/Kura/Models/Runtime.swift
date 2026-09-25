import SwiftUI

// Wire conventions (`KuraJSON`), the Kura calendar, the welcome art, `KuraRuntime` and the public links.

// MARK: - Wire conventions (API.md §1)
//
// Every model that comes over the wire is `Decodable` and TOLERANT: unknown keys
// are ignored (Swift's default), anything §3 marks optional or nonexistent is
// read with `decodeIfPresent`, and dates go through `KuraJSON.decoder`, which
// accepts ISO 8601 with and without fractional seconds. Request bodies are
// separate `Encodable` structs (see `LiveAPI.swift`) so the read models never
// need to round-trip.

enum KuraJSON {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let dateOnly: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate, .withDashSeparatorInDate]
        return f
    }()

    static func date(from s: String) -> Date? {
        withFraction.date(from: s) ?? plain.date(from: s) ?? dateOnly.date(from: s)
    }

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            guard let d = date(from: s) else {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Fecha ISO 8601 inválida: \(s)")
            }
            return d
        }
        return d
    }()

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    /// A calendar day pinned to 12:00 UTC so `startOfDay` lands on the same
    /// date in every time zone the app can run in. The wire's `release.date`
    /// is an instant whose hour varies by source — video arrives at 06:00Z
    /// (midnight in Mexico City), albums keep iTunes' hour (00, 07, 08 or
    /// 12Z) — but the release DAY is always the UTC calendar date of that
    /// instant, so we keep only that date and re-anchor it at noon. Never
    /// read the wire hour: 00:00Z would be "yesterday" in Mexico City.
    static func utcNoon(year: Int, month: Int, day: Int) -> Date? {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c.date(from: DateComponents(year: year, month: month, day: day, hour: 12))
    }

    static func utcComponents(_ d: Date) -> DateComponents {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c.dateComponents([.year, .month, .day], from: d)
    }

    static func dayAtNoon(_ d: Date) -> Date {
        let c = utcComponents(d)
        return utcNoon(year: c.year ?? 1970, month: c.month ?? 1, day: c.day ?? 1) ?? d
    }

    /// "12,4 k" / "48,7 k" / "214" — the ribbon format the frames use.
    static func count(_ n: Int) -> String {
        if n >= 1_000_000 { return trimmed(Double(n) / 1_000_000) + " M" }
        if n >= 1_000 { return trimmed(Double(n) / 1_000) + " k" }
        return String(n)
    }

    private static func trimmed(_ v: Double) -> String {
        let s = String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
        return s.hasSuffix(",0") ? String(s.dropLast(2)) : s
    }
}

/// Kura's calendar for release days and countdowns ("hoy", "14 h", "16 oct"): Gregorian on
/// Mexico City time, Spanish (MX). Production code reads THIS — `MockData.calendar` is the mock's
/// copy and doesn't exist outside DEBUG.
enum KCalendar {
    static let kura: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Mexico_City") ?? .current
        c.locale = Locale(identifier: "es_MX")
        return c
    }()
}

/// The three covers fanned out on the welcome (13). A fixed, named art source — NOT the mock:
/// the welcome is drawn before any account exists, so live has no catalog to take them from.
/// Same titles and covers the mock shows (the mock's `titles` registry wins when it has them).
enum WelcomeArt {
    private static func tmdb(_ path: String) -> URL? { URL(string: "https://image.tmdb.org/t/p/w500/\(path)") }

    static let titles: [Title] = [
        Title(id: "chihiro", name: "El viaje de Chihiro", format: .film, year: 2001, creator: "Hayao Miyazaki",
              palette: ["#c53e42", "#794244"], coverURL: tmdb("2RcxjDykOssx4SfqshewyI9vfSl.jpg")),
        Title(id: "odyssey", name: "The Odyssey", format: .film, year: 2026, creator: "Christopher Nolan",
              palette: ["#5ca6cb", "#33566e"], coverURL: tmdb("mKPGRRyXIwN8JOLhAbWnxV1gNrS.jpg")),
        Title(id: "ma", name: "Ma", format: .album, year: 2019, creator: "Devendra Banhart",
              palette: ["#c33d3b", "#ae4c69"],
              coverURL: URL(string: "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/b3/84/c8/b384c84d-b4a8-8f05-a37e-8aab02ba698d/075597924053.jpg/600x600bb.jpg")),
    ]

    static func title(_ id: String) -> Title? { titles.first { $0.id == id } }
}

/// Runtime switches that a model needs before the store exists.
enum KuraRuntime {
    /// True when the app runs on `MockAPI` (`-kuraScreen` / `-kuraMock`). A constant `false` in
    /// Release, where the mock isn't compiled in.
    #if DEBUG
    nonisolated(unsafe) static var usesMock = false
    #else
    static let usesMock = false
    #endif
    /// Origin of `KURA_API_BASE` (no `/api/v1`): relative `avatarUrl`s resolve against it.
    nonisolated(unsafe) static var apiOrigin: URL?
    /// The session's bearer, for requests outside `APIClient` (profile photos on
    /// `/api/avatar`, which serve a private account's photo only to its owner).
    nonisolated(unsafe) static var bearer: @Sendable () -> String? = { nil }

    /// `avatarUrl` may come relative (`/api/avatar/{key}`).
    static func resolve(_ raw: String?) -> URL? {
        guard let raw, !raw.isEmpty else { return nil }
        if raw.hasPrefix("/") { return URL(string: raw, relativeTo: apiOrigin)?.absoluteURL }
        return URL(string: raw)
    }
}

// MARK: - Public links

/// The web's public URLs, built in ONE place. Exact shapes = the clean URLs of `next.config.ts`
/// (fallback rewrites onto `src/app/u/[username]/**`):
/// profile `/{handle}` · public collection `/{handle}/{collectionId}` (the collection's id, never a
/// slug) · public item `/{handle}/item/{titleId}`. Every one 404s unless the handle's profile is
/// public (and, for a collection, the collection too) — callers decide whether to offer it.
/// Base = the API origin (Debug → `localhost:3010`, Release → `baclog.app`); mock → `baclog.app`.
enum PublicLinks {
    static var base: URL { KuraRuntime.apiOrigin ?? URL(string: "https://baclog.app")! }

    static func profile(_ handle: String) -> URL? {
        guard let h = clean(handle) else { return nil }
        return base.appending(path: h)
    }

    static func collection(_ handle: String, id: String) -> URL? {
        guard let h = clean(handle), !id.isEmpty else { return nil }
        return base.appending(path: h).appending(path: id)
    }

    static func item(_ handle: String, titleID: String) -> URL? {
        guard let h = clean(handle), !titleID.isEmpty, ExternalRef.parse(localID: titleID) == nil else { return nil }
        return base.appending(path: h).appending(path: "item").appending(path: titleID)
    }

    /// "baclog.app/mariel.ok/…" — the link as printed on a card (no scheme).
    static func display(_ url: URL) -> String {
        let s = url.absoluteString
        if let r = s.range(of: "://") { return String(s[r.upperBound...]) }
        return s
    }

    private static func clean(_ handle: String) -> String? {
        let h = handle.trimmingCharacters(in: .whitespaces).drop(while: { $0 == "@" })
        return h.isEmpty ? nil : String(h)
    }
}
