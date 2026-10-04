import Foundation

/// One "dónde ver" row. `kind` is a wire value (`service`, `justwatch`, …); anything unknown
/// still decodes and renders as a generic row that opens `url`.
struct WatchOption: Hashable, Identifiable, Decodable {
    var id: String { name }
    let short: String
    let name: String
    let kind: String
    /// Deep link from JustWatch / the preferred music service, when the API has one.
    var url: URL? = nil
    /// A streaming service the API resolved for this title: `url` is the service's own https link,
    /// so a tap goes straight to its host and iOS hands it to the installed app.
    // "streaming" doubles as the label builds before 2026-10 print next to the row.
    var isService: Bool { kind == "streaming" }
    /// Theatrical row ("En cines"): its label is computed from the release date.
    var isCinema: Bool { short == "cine" }

    init(short: String, name: String, kind: String, url: URL? = nil) {
        self.short = short; self.name = name; self.kind = kind; self.url = url
    }

    private enum CodingKeys: String, CodingKey { case short, name, provider, kind, url }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let n = try c.decodeIfPresent(String.self, forKey: .name) ?? c.decodeIfPresent(String.self, forKey: .provider) ?? ""
        name = n
        short = try c.decodeIfPresent(String.self, forKey: .short) ?? String(n.lowercased().prefix(3))
        kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? ""
        url = try c.decodeIfPresent(String.self, forKey: .url).flatMap(URL.init(string:))
    }
}
