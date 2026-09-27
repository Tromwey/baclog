import SwiftUI

/// The fan (Colecciones formalizado · "El abanico es la colección"): three covers with no box —
/// the front one upright and centred, the second tilted −10° behind on the left, the third +9°
/// behind on the right — standing on a soft floor shadow. One geometry, drawn at lead = 225 on a
/// 300 × 243 box and scaled by `s = lead / 225`: 225 a collection's header and the carousel ·
/// 186 the pinned one on a profile · 99 the profile grid · 51 a picker row · 22 a pill.
///
/// Each slot keeps its title's native form: a poster 2:3, a record 1:1 (front 150×225 / 180×180,
/// behind 117×176 / 135×135, every slot on the same centre). A missing title (a collection of one
/// or two) is an empty `s1` slot; `ghost` draws all three empty with the dashed "+" in front (the
/// empty and loading states). No art = the palette fallback (`CoverImage`).
///
/// The twin of the web's `src/components/kura/fan.tsx` — same numbers; change both or neither.
struct FanView: View {
    /// Up to three, front first (`AppStore.fan(of:)`).
    let covers: [Title]
    /// Height of the front cover.
    let lead: CGFloat
    var ghost = false
    /// Accessible name ("Portadas de verano 2026"); nil = decorative.
    var label: String? = nil
    @Environment(AppStore.self) private var store: AppStore?

    // The frames' geometry at lead = 225, on a 300 × 243 box.
    private static let boxW: CGFloat = 300
    private static let boxH: CGFloat = 243
    private static let front = (cx: CGFloat(150), cy: CGFloat(112.5))
    private static let left = (cx: CGFloat(69.5), cy: CGFloat(126), rot: -10.0)
    private static let right = (cx: CGFloat(231.5), cy: CGFloat(126.5), rot: 9.0)

    /// The box a fan of this lead takes (the floor shadow sits on its bottom edge).
    static func box(_ lead: CGFloat) -> CGSize {
        let s = lead / 225
        return CGSize(width: (boxW * s).rounded(),
                      height: max(boxH * s, lead + 18 * min(1, s * 2.3)).rounded())
    }

    private var s: CGFloat { lead / 225 }
    private var radius: CGFloat { s >= 0.5 ? 14 : s >= 0.35 ? 10 : s >= 0.18 ? 7 : 4 }

    var body: some View {
        let size = Self.box(lead)
        ZStack(alignment: .topLeading) {
            if s >= 0.35 { floor(size) }
            // Painted back to front: left, right, then the front one.
            slot(covers[safe: 1], index: 0)
            slot(covers[safe: 2], index: 1)
            slot(covers[safe: 0], index: 2)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label ?? "")
        .accessibilityHidden(label == nil)
    }

    /// A soft radial shadow the fan stands on.
    private func floor(_ size: CGSize) -> some View {
        let w = 174 * s + 70 * (1 - s)
        let h = max(10, 24 * s)
        return Ellipse()
            .fill(EllipticalGradient(colors: [Color.black.opacity(0.55), Color.black.opacity(0)],
                                     center: .center, startRadiusFraction: 0, endRadiusFraction: 0.5))
            .frame(width: w, height: h)
            .position(x: size.width / 2, y: size.height - h / 2)
            .allowsHitTesting(false)
    }

    @ViewBuilder
    private func slot(_ title: Title?, index i: Int) -> some View {
        let isFront = i == 2
        let at: (cx: CGFloat, cy: CGFloat) = isFront ? Self.front : i == 0 ? (Self.left.cx, Self.left.cy) : (Self.right.cx, Self.right.cy)
        let rot = isFront ? 0 : (i == 0 ? Self.left.rot : Self.right.rot)
        // An empty back slot on the right keeps the record's square (the frames' mix).
        let album = title.map { $0.format == .album } ?? (!isFront && i == 1)
        let wh: (CGFloat, CGFloat) = isFront ? (album ? (180, 180) : (150, 225)) : (album ? (135, 135) : (117, 176))
        let empty = ghost || title == nil
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        ZStack {
            KColor.s1
            if !empty, let title {
                CoverImage(url: title.coverURL, palette: title.palette)
                    .task(id: title.id) { if title.palette.isEmpty { store?.fillPaletteIfNeeded(title) } }
            }
            if ghost && isFront {
                // Dashed mock affordance (exempt from the borderless rule).
                shape.strokeBorder(Color.white.opacity(0.18), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
                if lead >= 60 {
                    Image(systemName: "plus")
                        .font(.system(size: max(18, 26 * s).rounded(), weight: .medium))
                        .foregroundStyle(KColor.text2)
                }
            }
        }
        .frame(width: wh.0 * s, height: wh.1 * s)
        .clipShape(shape)
        .modifier(FanShadow(s: s))
        .rotationEffect(.degrees(rot))
        .position(x: at.cx * s, y: at.cy * s)
    }
}

/// The cover shadow by scale: the system's cover shadow at header sizes, tighter below.
private struct FanShadow: ViewModifier {
    let s: CGFloat
    func body(content: Content) -> some View {
        if s >= 0.35 {
            content.kShadow(.cover)
        } else if s >= 0.18 {
            // `0 10px 18px -8px rgba(0,0,0,.9)`
            content.shadow(color: .black.opacity(0.75), radius: 6, x: 0, y: 7)
        } else {
            // `0 3px 6px -3px rgba(0,0,0,.9)`
            content.shadow(color: .black.opacity(0.7), radius: 2, x: 0, y: 2)
        }
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

// MARK: - Pickers

/// A collection in a picker (Colecciones formalizado · 7a — "guardar en", "mover a"): its mini fan
/// at 51 instead of a thumbnail, the name in Newsreader 18, "N títulos · ya está" in mono, and the
/// check disc. 72 tall. The caller owns the state. Twin of the web's `FanPickRow`.
struct FanPickRow: View {
    let name: String
    let covers: [Title]
    let count: Int
    let on: Bool
    /// "ya está" / "aquí está" after the count.
    var note: String? = nil
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                FanView(covers: covers, lead: 51)
                VStack(alignment: .leading, spacing: 3) {
                    Text(name).font(.kura.news(18)).foregroundStyle(KColor.text).lineLimit(1)
                    Text("\(count) \(count == 1 ? "título" : "títulos")\(note.map { " · \($0)" } ?? "")")
                        .monoLabel(10)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                RadioMark(on: on)
            }
            .padding(.horizontal, 8)
            .frame(minHeight: 72)
            .contentShape(Rectangle())
        }
        .buttonStyle(SheetRowStyle())
        .disabled(disabled)
        .opacity(disabled ? 0.45 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name), \(count) \(count == 1 ? "título" : "títulos")\(note.map { ", \($0)" } ?? "")")
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

/// "Nueva colección" as the first row of a picker: the "+" in the fan's column.
struct NewCollectionRow: View {
    var label = "Nueva colección"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(KColor.text2)
                    .frame(width: FanView.box(51).width)
                Text(label).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(SheetRowStyle())
    }
}
