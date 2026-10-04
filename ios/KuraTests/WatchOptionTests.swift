import XCTest

/// «Dónde ver» por servicio: `watch` llega con una fila por servicio (`kind: "streaming"`, link
/// directo al host del servicio) y la de JustWatch al final; un `kind` nuevo no rompe nada.
final class WatchOptionTests: XCTestCase {
    private func decode(_ json: String) throws -> [WatchOption] {
        try JSONDecoder().decode([WatchOption].self, from: Data(json.utf8))
    }

    func testServiceRowsThenJustWatchKeepOrderAndDirectURLs() throws {
        let rows = try decode("""
        [{"short":"tv","name":"Apple TV","kind":"streaming","url":"https://tv.apple.com/show/umc.cmc.abc"},
         {"short":"nf","name":"Netflix","kind":"streaming","url":"https://www.netflix.com/title/80057281"},
         {"short":"jw","name":"JustWatch","kind":"justwatch","url":"https://www.justwatch.com/mx"}]
        """)
        XCTAssertEqual(rows.map(\.name), ["Apple TV", "Netflix", "JustWatch"])
        XCTAssertEqual(rows.map(\.isService), [true, true, false])
        XCTAssertEqual(rows[0].url?.host, "tv.apple.com")
        XCTAssertEqual(rows[1].url?.host, "www.netflix.com")
        XCTAssertEqual(rows.last?.kind, "justwatch")
    }

    func testUnknownKindStillDecodesAsGenericRowWithURL() throws {
        let rows = try decode(#"[{"short":"x","name":"Servicio nuevo","kind":"bundle","url":"https://example.com/t"}]"#)
        XCTAssertEqual(rows.count, 1)
        XCTAssertFalse(rows[0].isService)
        XCTAssertEqual(rows[0].kind, "bundle")
        XCTAssertEqual(rows[0].url?.absoluteString, "https://example.com/t")
    }

    func testMissingKindAndURLDoNotThrow() throws {
        let rows = try decode(#"[{"name":"Algo"}]"#)
        XCTAssertEqual(rows[0].kind, "")
        XCTAssertNil(rows[0].url)
    }
}
