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

/// `Font.kura.*` — sizes are fixed (the DS is specified in px at 390 pt wide).
struct KuraFonts {
    // Newsreader — brand voice, always lowercase in titles.
    func news(_ size: CGFloat) -> Font { .custom(KFontName.newsRegular, fixedSize: size) }
    func newsMedium(_ size: CGFloat) -> Font { .custom(KFontName.newsMedium, fixedSize: size) }
    func newsItalic(_ size: CGFloat) -> Font { .custom(KFontName.newsItalic, fixedSize: size) }
    func newsMediumItalic(_ size: CGFloat) -> Font { .custom(KFontName.newsMediumItalic, fixedSize: size) }

    // Hanken Grotesk — interface.
    func ui(_ size: CGFloat, _ weight: UIWeight = .regular) -> Font {
        switch weight {
        case .regular: return .custom(KFontName.hankRegular, fixedSize: size)
        case .medium: return .custom(KFontName.hankMedium, fixedSize: size)
        case .semibold: return .custom(KFontName.hankSemiBold, fixedSize: size)
        }
    }

    // Red Hat Mono — data.
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
            .font(.kura.newsMediumItalic(size))
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
