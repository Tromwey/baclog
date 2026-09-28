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
    /// Kanji 蔵 of §marca · C — only the entrance (brand material), never the interface.
    static let kanji = "HiraMinProN-W6"

    static let all = [newsRegular, newsMedium, newsItalic, newsMediumItalic,
                      hankRegular, hankMedium, hankSemiBold, monoRegular, monoMedium]
}

enum UIWeight { case regular, medium, semibold }

/// `Font.kura.*` — sizes are the DS values (specified in px at 390 pt wide) at
/// the default text size, and they follow Dynamic Type: each size scales with
/// the text style it sits closest to (`relativeTo:`), into the accessibility sizes.
/// Fixed-geometry chrome caps itself at `xxxLarge` with `kFixedChrome()`.
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
    /// Fixed-geometry chrome (dock, top chips, covers, collection/feed cards, toast) stops
    /// growing at xxxLarge: its frames are exact and it's secondary to the reading text,
    /// which scales into the accessibility sizes. Never put this on a screen or a sheet.
    func kFixedChrome() -> some View { dynamicTypeSize(...DynamicTypeSize.xxxLarge) }

    /// Red Hat Mono · UPPERCASE · tracking +8 % (dates, counts, labels).
    func monoLabel(_ size: CGFloat = 11, tracking: Double = 0.08, color: Color = KColor.text2, medium: Bool = false) -> some View {
        self.font(.kura.mono(size, medium: medium))
            .tracking(size * tracking)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }
}

/// The three versions of the mark (design/kura/sistema-de-diseno.dc.html §marca · logo), the
/// twin of the web's `Wordmark` (src/components/kura/components.tsx). One recipe each; pick by
/// WHERE it appears:
/// - `.a` principal (default): *kura* in Newsreader MediumItalic, tracking −3.5 %. Splash and any
///   wordmark inside the app. At least 24 pt tall — the k is 0.714 em, so never under 34
///   (`Wordmark.minimum`); smaller than that, use `.b`.
/// - `.b` sello: KURA in Red Hat Mono Medium, tracking +24 %. Spines, card feet, small signatures.
/// - `.c` con kanji: 蔵 in the serif JP (Hiragino Mincho W6 = 600; W3 would be 300) at 1.5× the
///   kura, a 15/48 gap, *kura* at −3 %, 蔵's ink centred on the kura's optical centre. Brand
///   material only — in the app that's the entrance before the account, NEVER the interface. The
///   kura keeps A's minimum. Same numbers as the web's `LOCKUP_C` (src/components/kura/
///   lockup-c.ts) — change both together. §marca's 2×/700 is kept only for isolated brand pieces
///   (press, merch); 1.5× is the founder's call (2026-09-28).
/// `size` is the latin part's point size. Never A and B together; VoiceOver reads one word.
struct Wordmark: View {
    enum Variant { case a, b, c }
    static let minimum: CGFloat = 34
    /// §marca · C at product proportions (web `LOCKUP_C`): 蔵 size, gap and baseline drop, × s.
    static let lockupKanji: CGFloat = 1.5
    static let lockupGap: CGFloat = 15 / 48
    static let lockupDrop: CGFloat = 0.25

    var variant: Variant = .a
    var size: CGFloat? = nil
    var color: Color = KColor.text

    var body: some View {
        mark
            .foregroundStyle(color)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("kura")
    }

    @ViewBuilder private var mark: some View {
        switch variant {
        case .b:
            let s = size ?? 11
            Text("KURA")
                .font(.kura.mono(s, medium: true))
                .tracking(s * 0.24)
                .padding(.leading, s * 0.24) // balances the tracking after the A, as §marca centres it
        case .c:
            let s = max(Self.minimum, size ?? Self.minimum)
            HStack(alignment: .firstTextBaseline, spacing: s * Self.lockupGap) {
                // Baselines aligned, then 蔵 drops `lockupDrop` so its ink (centre 0.381 em)
                // lands on the kura's optical centre (0.32 em over its baseline).
                Text("蔵")
                    .font(.custom(KFontName.kanji, fixedSize: s * Self.lockupKanji))
                    .alignmentGuide(.firstTextBaseline) { d in d[.firstTextBaseline] - s * Self.lockupDrop }
                Text("kura")
                    .font(.kura.newsMediumItalic(s, fixed: true))
                    .tracking(-s * 0.03)
            }
        case .a:
            let s = max(Self.minimum, size ?? Self.minimum)
            Text("kura")
                .font(.kura.newsMediumItalic(s, fixed: true))
                .tracking(-s * 0.035)
        }
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
