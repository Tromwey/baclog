import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// "No puedo esperar": release labels and sentences, and the derived waiting list.
extension AppStore {
    // MARK: No puedo esperar

    private static let months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    /// Release days are read on Mexico City's calendar (`KCalendar`), in live and mock alike.
    var cal: Calendar { KCalendar.kura }

    /// True while the title (or, for a series, its announced season) is not out.
    func isUnreleased(_ t: Title) -> Bool {
        guard let r = t.release else { return false }
        if t.upcomingSeason != nil { return false } // the show itself is out; the season waits
        return isUnreleased(r)
    }

    func isUnreleased(_ r: Release) -> Bool {
        switch r {
        case .day(let d): return cal.startOfDay(for: d) > cal.startOfDay(for: now)
        case .month(let y, let m):
            let c = cal.dateComponents([.year, .month], from: now)
            return (y, m) > (c.year ?? 0, c.month ?? 0)
        case .year(let y): return y > (cal.component(.year, from: now))
        case .unknown: return true
        }
    }

    /// Release day on the Mexico City calendar ("hoy"): the server compares the stored instant,
    /// so for a few hours it still says "upcoming" and a mark needs `preview: true`.
    func isReleaseDay(_ t: Title) -> Bool {
        guard case .day(let d)? = t.release else { return false }
        return cal.startOfDay(for: d) == cal.startOfDay(for: now)
    }

    /// The DS countdown: "14 h", "3 d", "16 oct", "oct 2026", "2027", "sin fecha", "hoy", "ya salió".
    func label(for r: Release) -> String {
        switch r {
        case .day(let d):
            let today = cal.startOfDay(for: now)
            let day = cal.startOfDay(for: d)
            if day < today { return "ya salió" }
            if day == today { return "hoy" }
            let days = cal.dateComponents([.day], from: today, to: day).day ?? 0
            let hours = Int((d.timeIntervalSince(now) / 3600).rounded(.up))
            if days <= 1 && hours <= 24 {
                return "\(max(hours, 1)) h"
            } else if days <= 7 {
                return "\(days) d"
            } else {
                let comps = cal.dateComponents([.year, .month, .day], from: d)
                var s = "\(comps.day ?? 0) \(Self.months[(comps.month ?? 1) - 1])"
                if comps.year != cal.component(.year, from: now) { s += " \(comps.year ?? 0)" }
                return s
            }
        case .month(let y, let m): return "\(Self.months[m - 1]) \(y)"
        case .year(let y): return "\(y)"
        case .unknown: return "sin fecha"
        }
    }

    func releaseLabel(_ t: Title, withSeason: Bool = false) -> String? {
        guard let r = t.release else { return nil }
        let base = label(for: r)
        if withSeason, let s = t.upcomingSeason { return "T\(s) · \(base)" }
        return base
    }

    /// Long form for sentences: "sale el 16 oct".
    func sentence(for r: Release) -> String {
        let text = label(for: r)
        switch text {
        case "ya salió", "hoy", "sin fecha": return text
        default:
            if text.hasSuffix(" h") || text.hasSuffix(" d") { return "sale en \(text)" }
            if case .day = r { return "sale el \(text)" }
            return "sale en \(text)" // "sale en oct 2026" / "sale en 2027"
        }
    }

    /// The first moment of the release period, on the Mexico City calendar (nil = no date).
    func releaseStart(_ r: Release) -> Date? {
        switch r {
        case .day(let d): return cal.startOfDay(for: d)
        case .month(let y, let m): return cal.date(from: DateComponents(year: y, month: m, day: 1))
        case .year(let y): return cal.date(from: DateComponents(year: y, month: 1, day: 1))
        case .unknown: return nil
        }
    }

    func releaseSentence(_ t: Title) -> String? {
        t.release.map(sentence(for:))
    }

    /// The automatic collection: announced titles you saved, until you complete them.
    /// Once out, a title stays ("ya salió") only if you saved it while it was still announced
    /// (or while we don't know yet when you saved it):
    /// the wire sends `release` for every dated title, past or future, so without this an old
    /// album you never completed would land here the moment you opened its ficha.
    /// Cached until titles, states, collections or the clock change (both the tab root and the
    /// automatic collection ask on every render).
    var waitingTitles: [Title] {
        _ = (titles, userTitles, collections, now) // observed
        if let w = s.derived.waiting { return w }
        let w = computeWaitingTitles()
        s.derived.waiting = w
        return w
    }

    private func computeWaitingTitles() -> [Title] {
        let list = libraryIDs.compactMap { titles[$0] }.filter { t in
            guard let r = t.release, mark(t.id) == nil else { return false }
            if isUnreleased(t) || t.upcomingSeason != nil { return true }
            guard let out = releaseStart(r) else { return false }
            // No `savedAt` yet (your library state hasn't arrived): "don't know yet", so it stays
            // instead of silently dropping out until `me/titles` answers.
            guard let savedAt = userTitles[t.id]?.savedAt else { return true }
            return savedAt < out
        }
        func key(_ t: Title) -> (Int, Date) {
            guard let r = t.release else { return (9, .distantFuture) }
            if !isUnreleased(t) && t.upcomingSeason == nil { return (0, .distantPast) }
            switch r {
            case .day(let d): return (1, d)
            case .month(let y, let m): return (2, cal.date(from: DateComponents(year: y, month: m)) ?? .distantFuture)
            case .year(let y): return (3, cal.date(from: DateComponents(year: y)) ?? .distantFuture)
            case .unknown: return (4, .distantFuture)
            }
        }
        return list.sorted { key($0) < key($1) }
    }
}
