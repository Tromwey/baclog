import Foundation

/// The contract rule of a list that IS a page (`LossyPage`), with no decoder and no log in it —
/// `KuraTests` compiles this file alone.
///
/// Elements this build can't read are dropped one by one. When TWO OR MORE were dropped and none
/// survived, the page's shape changed: on the FIRST page that is a contract error (the screen says
/// it failed instead of "no tienes nada" over data that exists). On a LATER page (a request that
/// carried a `cursor`) it is an empty page that keeps its `nextCursor`: what's already on screen is
/// real, and one stretch of the list this build can't read must not end the list in an error — the
/// paginator goes on, under its own cap.
enum PageContract {
    static func isBreak(kept: Int, dropped: Int, firstPage: Bool) -> Bool {
        firstPage && kept == 0 && dropped >= 2
    }

    /// A request is a later page when it carries a non-empty `cursor`.
    static func isLaterPage(cursor: String?) -> Bool { !(cursor ?? "").isEmpty }

    /// A paginator whose sentinel asks again per cursor (someone else's followers / following)
    /// stops asking on its own after this many pages IN A ROW that added no row and still carried
    /// a cursor: a server (or a stretch this build can't read) that keeps answering "nothing, and
    /// there's more" would otherwise be walked without end. The end of the list then offers
    /// Reintentar, which starts the count over.
    static let maxEmptyPages = 3

    /// The run of empty pages after one that added `added` rows.
    static func emptyRun(_ run: Int, added: Int) -> Int { added > 0 ? 0 : run + 1 }

    /// Whether the paginator stops here (only while there IS a next page to ask for).
    static func stalled(emptyRun: Int, hasNext: Bool) -> Bool { hasNext && emptyRun >= maxEmptyPages }
}
