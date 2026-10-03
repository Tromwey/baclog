import Foundation

/// The birth date of the age gate (`POST /me/onboarding { birthDate: "YYYY-MM-DD" }`), with no UI
/// in it — `KuraTests` compiles this file alone. The server computes the exact age and stores
/// ONLY the year; the app never keeps the date either (it lives in the form's three fields).
enum BirthDate {
    static let minYear = 1900

    private static func digits(_ s: String) -> String { s.filter { $0.isASCII && $0.isNumber } }

    /// Day and month typed (1–2 digits) and a four-digit year: enough to judge the date.
    static func isComplete(day: String, month: String, year: String) -> Bool {
        !digits(day).isEmpty && !digits(month).isEmpty && digits(year).count == 4
    }

    /// `YYYY-MM-DD` for a REAL calendar day (no 31 de abril, 29 de febrero only in leap years),
    /// from 1900 on and not after `today` (the device's calendar day); nil otherwise.
    static func wire(day: String, month: String, year: String, today: Date = Date(),
                     timeZone: TimeZone = .current) -> String? {
        guard isComplete(day: day, month: month, year: year),
              let d = Int(digits(day)), let m = Int(digits(month)), let y = Int(digits(year)),
              y >= minYear, (1...12).contains(m), d >= 1, d <= daysIn(month: m, year: y) else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let now = cal.dateComponents([.year, .month, .day], from: today)
        guard let ty = now.year, let tm = now.month, let td = now.day, (y, m, d) <= (ty, tm, td) else { return nil }
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    static func daysIn(month: Int, year: Int) -> Int {
        switch month {
        case 2: return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 ? 29 : 28
        case 4, 6, 9, 11: return 30
        default: return 31
        }
    }

    /// Whole years between a wire date and `today` in UTC, as the server counts them (a 29 de
    /// febrero has its birthday on 1 de marzo in a common year). Only the mock uses it.
    static func age(wire: String, today: Date = Date()) -> Int? {
        let p = wire.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let now = cal.dateComponents([.year, .month, .day], from: today)
        guard let ty = now.year, let tm = now.month, let td = now.day else { return nil }
        return ty - p[0] - ((tm, td) < (p[1], p[2]) ? 1 : 0)
    }
}
