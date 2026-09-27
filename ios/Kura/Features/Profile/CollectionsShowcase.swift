import SwiftUI

/// The collections on a profile (Colecciones formalizado · 3a/3b): the PINNED collection (or the
/// first) big and floating — its fan at 186 on its floor shadow, "fijada · 12 títulos", the name
/// in Newsreader 28, the line in italic — then four more in two columns of fans at 99 with the
/// name at 20 and the count, and "Ver las N" at the section's right.
///
/// No boxes: the page's feed gradient is the only surface. On your own profile "Ver las N" goes
/// to Tus colecciones (`onSeeAll`); on someone else's it unfolds the rest right here, and the
/// featured one gets a glass Compartir. Twin of the web's `collections-showcase.tsx`.
struct ShowcaseItem: Identifiable {
    let id: String
    let name: String
    let vibe: String?
    let count: Int
    let pinned: Bool
    let fan: [Title]
    /// nil = not openable (a preview).
    let open: (() -> Void)?
    /// Own profile only: holding the fan opens 9a (the collection's options).
    var hold: (() -> Void)? = nil
    /// Visitor only: the featured one's public page.
    var shareLink: URL? = nil
}

struct CollectionsShowcase<Empty: View>: View {
    let title: String
    let items: [ShowcaseItem]
    /// Own profile: "Ver las N" goes there instead of unfolding.
    var onSeeAll: (() -> Void)? = nil
    @ViewBuilder var empty: Empty
    @State private var open = false

    private static var grid: Int { 4 }

    var body: some View {
        let featured = items.first(where: \.pinned) ?? items.first
        let rest = items.filter { $0.id != featured?.id }
        let shown = open ? rest : Array(rest.prefix(Self.grid))
        let n = items.count
        let seeAll = n == 1 ? "Ver la colección" : "Ver las \(n)"

        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.kura.section).foregroundStyle(KColor.text).accessibilityAddTraits(.isHeader)
                Spacer()
                if n > 0 {
                    if let onSeeAll {
                        Button(seeAll, action: onSeeAll)
                            .font(.kura.ui(14, .medium))
                            .foregroundStyle(KColor.text2)
                            .frame(minHeight: 44)
                    } else if rest.count > Self.grid {
                        Button(open ? "Ver menos" : seeAll) { withAnimation(KMotion.snappy) { open.toggle() } }
                            .font(.kura.ui(14, .medium))
                            .foregroundStyle(KColor.text2)
                            .frame(minHeight: 44)
                    }
                }
            }
            .padding(.horizontal, 20)

            if let featured {
                VStack(spacing: 8) {
                    FanView(covers: featured.fan, lead: 186, ghost: featured.fan.isEmpty)
                        .modifier(OpenOnTap(open: featured.open, hold: featured.hold, label: "Abrir \(featured.name)"))
                    Text("\(featured.pinned ? "fijada · " : "")\(featured.count) \(featured.count == 1 ? "título" : "títulos")")
                        .monoLabel(10)
                    Text(featured.name)
                        .font(.kura.news(28))
                        .foregroundStyle(KColor.text)
                        .multilineTextAlignment(.center)
                        .modifier(OpenOnTap(open: featured.open, label: featured.name))
                    if let vibe = featured.vibe { VibeLine(text: vibe, size: 15) }
                    if let link = featured.shareLink {
                        ShareLink(item: link) {
                            HStack(spacing: 6) {
                                Image(systemName: "square.and.arrow.up").font(.system(size: 14, weight: .semibold))
                                Text("Compartir").font(.kura.ui(14, .semibold))
                            }
                            .foregroundStyle(KColor.text)
                            .padding(.leading, 13)
                            .padding(.trailing, 16)
                            .frame(height: 40)
                            .background(KColor.glassBg, in: Capsule())
                        }
                        .kPress()
                        .accessibilityLabel("Compartir \(featured.name)")
                        .padding(.top, 8)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.top, 6)
                .padding(.bottom, 10)

                if !shown.isEmpty {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 16, alignment: .top),
                                        GridItem(.flexible(), spacing: 16, alignment: .top)],
                              spacing: 30) {
                        ForEach(shown) { c in
                            VStack(spacing: 8) {
                                FanView(covers: c.fan, lead: 99, ghost: c.fan.isEmpty)
                                VStack(spacing: 5) {
                                    Text(c.name)
                                        .font(.kura.news(20))
                                        .foregroundStyle(KColor.text)
                                        .multilineTextAlignment(.center)
                                    Text("\(c.count) \(c.count == 1 ? "título" : "títulos")").monoLabel(10)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .modifier(OpenOnTap(open: c.open, hold: c.hold, label: "\(c.name), \(c.count) \(c.count == 1 ? "título" : "títulos")"))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                }
            } else {
                empty.frame(maxWidth: .infinity)
            }
        }
    }
}

extension CollectionsShowcase where Empty == EmptyView {
    init(title: String, items: [ShowcaseItem], onSeeAll: (() -> Void)? = nil) {
        self.init(title: title, items: items, onSeeAll: onSeeAll) { EmptyView() }
    }
}

/// Tap-to-open with the press feel (+ hold for 9a on your own profile), or nothing when there's
/// nowhere to go (a preview).
private struct OpenOnTap: ViewModifier {
    let open: (() -> Void)?
    var hold: (() -> Void)? = nil
    let label: String

    func body(content: Content) -> some View {
        if let open {
            content
                .contentShape(Rectangle())
                .kPressable(longPress: hold, action: open)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isButton)
                .modifier(HoldAccessibility(hold: hold))
        } else {
            content.accessibilityElement(children: .combine)
        }
    }
}

/// VoiceOver's way to the hold: an "Opciones" action.
private struct HoldAccessibility: ViewModifier {
    let hold: (() -> Void)?
    func body(content: Content) -> some View {
        if let hold { content.accessibilityAction(named: "Opciones", hold) } else { content }
    }
}
