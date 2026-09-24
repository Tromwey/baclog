import SwiftUI
import UIKit

/// The three families of the DS. PostScript names verified against the TTFs in
/// `Resources/Fonts` (see `FontCheck`).
enum KFontName {
    static let newsRegular = "Newsreader-Regular"
    static let newsMedium = "Newsreader-Medium"
    static let newsItalic = "Newsreader-Italic"
    static let newsMediumItalic = "Newsreader-MediumItalic"
    static let hankRegular = "HankenGrotesk-Regular"
    static let hankMedium = "HankenGrotesk-Medium"
    static let hankSemiBold = "HankenGrotesk-SemiBold"
    static let monoRegular = "RedHatMono-Regular"
    static let monoMedium = "RedHatMono-Medium"
    /// Kanji 蔵 — only on onboarding, never in the interface.
    static let kanji = "HiraMinProN-W6"

    static let all = [newsRegular, newsMedium, newsItalic, newsMediumItalic,
                      hankRegular, hankMedium, hankSemiBold, monoRegular, monoMedium]
}

enum UIWeight { case regular, medium, semibold }

/// `Font.kura.*` — sizes are the DS values (specified in px at 390 pt wide) at
/// the default text size, and they follow Dynamic Type: each size scales with
/// the text style it sits closest to (`relativeTo:`). `RootView` caps the growth
/// at `xxxLarge` so the fixed frames (covers, chips 44, sheets) keep holding.
///
/// What stays FIXED on purpose (`fixed: true` / `mono`):
/// - Red Hat Mono is the data voice: uppercase labels on cover badges, the
///   spine (rotated to the card's exact height), ribbons and counters live in
///   fixed geometry and are secondary to the title/name next to them, which
///   does scale.
/// - The wordmark, the seal's initials and the dock labels are drawn into a
///   fixed shape (brand mark, circle, floating bar with Large Content Viewer).
struct KuraFonts {
    /// The text style whose Dynamic Type curve a DS size follows.
    static func style(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case 34...: return .largeTitle
        case 28..<34: return .title
        case 22..<28: return .title2
        case 20..<22: return .title3
        case 17..<20: return .body
        case 16..<17: return .callout
        case 15..<16: return .subheadline
        case 13..<15: return .footnote
        case 12..<13: return .caption
        default: return .caption2
        }
    }

    private func face(_ name: String, _ size: CGFloat, fixed: Bool) -> Font {
        fixed ? .custom(name, fixedSize: size) : .custom(name, size: size, relativeTo: KuraFonts.style(for: size))
    }

    // Newsreader — brand voice, always lowercase in titles.
    func news(_ size: CGFloat, fixed: Bool = false) -> Font { face(KFontName.newsRegular, size, fixed: fixed) }
    func newsMedium(_ size: CGFloat, fixed: Bool = false) -> Font { face(KFontName.newsMedium, size, fixed: fixed) }
    func newsItalic(_ size: CGFloat, fixed: Bool = false) -> Font { face(KFontName.newsItalic, size, fixed: fixed) }
    func newsMediumItalic(_ size: CGFloat, fixed: Bool = false) -> Font { face(KFontName.newsMediumItalic, size, fixed: fixed) }

    // Hanken Grotesk — interface.
    func ui(_ size: CGFloat, _ weight: UIWeight = .regular, fixed: Bool = false) -> Font {
        switch weight {
        case .regular: return face(KFontName.hankRegular, size, fixed: fixed)
        case .medium: return face(KFontName.hankMedium, size, fixed: fixed)
        case .semibold: return face(KFontName.hankSemiBold, size, fixed: fixed)
        }
    }

    // Red Hat Mono — data. Fixed (see above).
    func mono(_ size: CGFloat, medium: Bool = false) -> Font {
        .custom(medium ? KFontName.monoMedium : KFontName.monoRegular, fixedSize: size)
    }

    // Semantic scale (sistema-de-diseno · typeScale)
    var profile: Font { news(40) }
    var screenTitle: Font { news(36) }
    var emptyPhrase: Font { news(34) }
    var workTitle: Font { newsItalic(30) }
    var section: Font { news(24) }
    var sheetTitle: Font { news(22) }
    var body: Font { ui(15) }
    var note: Font { ui(13) }
    var data: Font { mono(11) }
}

extension Font {
    static let kura = KuraFonts()
}

extension View {
    /// Red Hat Mono · UPPERCASE · tracking +8 % (dates, counts, labels).
    func monoLabel(_ size: CGFloat = 11, tracking: Double = 0.08, color: Color = KColor.text2, medium: Bool = false) -> some View {
        self.font(.kura.mono(size, medium: medium))
            .tracking(size * tracking)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }
}

/// The wordmark "kura": Newsreader MediumItalic, tracking −3.5 %.
struct Wordmark: View {
    var size: CGFloat
    var body: some View {
        Text("kura")
            .font(.kura.newsMediumItalic(size, fixed: true))
            .tracking(-size * 0.035)
            .foregroundStyle(KColor.text)
            .accessibilityLabel("kura")
    }
}

/// DEBUG check that every bundled font resolves. If one fails, prints the
/// families UIKit knows about so the name can be fixed.
enum FontCheck {
    static func run() {
        #if DEBUG
        var missing: [String] = []
        for name in KFontName.all where UIFont(name: name, size: 20) == nil {
            missing.append(name)
        }
        if missing.isEmpty {
            print("[Kura] fonts OK: \(KFontName.all.count) faces registered")
        } else {
            print("[Kura] ⚠︎ missing fonts: \(missing)")
            for family in UIFont.familyNames.sorted() {
                print("  \(family): \(UIFont.fontNames(forFamilyName: family))")
            }
        }
        if UIFont(name: KFontName.kanji, size: 20) == nil {
            print("[Kura] ⚠︎ kanji font \(KFontName.kanji) not available")
        }
        #endif
    }
}
