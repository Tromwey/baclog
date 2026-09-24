import SwiftUI

/// Feed v10 · a STACK of tinted cards: each card pins under the header and the
/// next one slides over it. Tiers L 620 / M 500 / S 370 (capped to the screen
/// so the next card's edge always shows), snap per card.
struct FeedView: View {
    @Environment(AppStore.self) private var store
    @State private var position: String?

    /// How far a card's body runs past its own height, so the card rising from
    /// underneath always mounts over filled color instead of bare bg.
    private let ext: CGFloat = 120

    var body: some View {
        Group {
            if store.following.isEmpty && store.me.followingCount == 0 {
                FeedEmptyView()
            } else if !store.feedLoaded && store.visibleFeed.isEmpty {
                loading
            } else if store.visibleFeed.isEmpty {
                quiet
            } else {
                stack
            }
        }
        .task { await store.loadFeed() }
        // Every tab is mounted at launch, so the first load may predate the first follow:
        // reload when the tab is shown with a stale followed set.
        .onChange(of: store.tab) { _, tab in
            if tab == .feed && store.feedStale { Task { await store.loadFeed(force: true) } }
        }
    }

    /// Followed people, nothing from them yet.
    private var quiet: some View {
        VStack(spacing: 0) {
            header
            VStack(alignment: .leading, spacing: 14) {
                Text("tu gente todavía no hace nada.").font(.kura.news(32)).foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Cuando completen, se obsesionen o reseñen algo, aparece aquí.")
                    .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
                GlassButton(title: "Buscar más gente", systemImage: "magnifyingglass") { store.select(.discover) }
                    .padding(.top, 6)
            }
            .padding(.horizontal, 28)
            .padding(.top, 60)
            Spacer()
        }
        .background(KColor.bg.ignoresSafeArea())
        .ignoresSafeArea(.container, edges: [.top, .bottom])
    }

    /// The stack's shape while `GET /feed` runs.
    private var loading: some View {
        VStack(spacing: 0) {
            header
            VStack(alignment: .leading, spacing: 14) {
                Skeleton(radius: 999).frame(width: 150, height: 28)
                Skeleton().frame(maxWidth: .infinity).frame(height: 260)
                Skeleton(radius: 6).frame(width: 220, height: 26)
                Skeleton(radius: 5).frame(width: 140, height: 12)
                Spacer()
            }
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(KColor.s1)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: KRadius.screen, topTrailingRadius: KRadius.screen, style: .continuous))
        }
        .background(KColor.bg.ignoresSafeArea())
        .ignoresSafeArea(.container, edges: [.top, .bottom])
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu feed")
    }

    private var stack: some View {
        VStack(spacing: 0) {
            header
            GeometryReader { geo in
                let events = store.visibleFeed
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        ForEach(Array(events.enumerated()), id: \.element.id) { i, e in
                            let h = tierHeight(e.tier, viewport: geo.size.height)
                            FeedCard(event: e, height: h)
                                .frame(height: h + ext, alignment: .top)
                                .background(Tint.card(palette(e)))
                                .clipShape(UnevenRoundedRectangle(topLeadingRadius: KRadius.screen,
                                                                  topTrailingRadius: KRadius.screen,
                                                                  style: .continuous))
                                .kShadow(.stack)
                                .padding(.bottom, -ext)
                                .visualEffect { content, proxy in
                                    let y = proxy.frame(in: .scrollView).minY
                                    return content.offset(y: y < 0 ? -y : 0)
                                }
                                .zIndex(Double(i))
                                .onAppear { if i >= events.count - 2 { Task { await store.loadMoreFeed() } } }
                        }
                        // The stack's light continues past the last card.
                        Tint.ends(palette(events.last)).1.color
                            .frame(height: max(geo.size.height - tierHeight(events.last?.tier ?? .M, viewport: geo.size.height), 0) + ext)
                            .zIndex(-1)
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: $position, anchor: .top)
                .task {
                    guard let anchor = store.debugFeedAnchor else { return }
                    try? await Task.sleep(for: .milliseconds(900))
                    position = anchor
                }
            }
        }
        .background(KColor.bg.ignoresSafeArea())
        .ignoresSafeArea(.container, edges: [.top, .bottom])
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            Text("tu feed").font(.kura.screenTitle).foregroundStyle(KColor.text)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            ZStack(alignment: .topTrailing) {
                IconChip44(systemName: "bell", iconSize: 17, weight: .medium, label: store.hasUnread ? "Notificaciones, hay nuevas" : "Notificaciones") {
                    store.push(.notifications)
                }
                if store.hasUnread {
                    Circle().fill(KColor.text).frame(width: 8, height: 8)
                        .offset(x: -9, y: 9)
                        .allowsHitTesting(false)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, KSize.chromeTop)
        .padding(.bottom, 14)
        .background(KColor.bg)
    }

    private func tierHeight(_ t: FeedEvent.Tier, viewport: CGFloat) -> CGFloat {
        switch t {
        case .L: return min(620, viewport * 0.86)
        case .M: return min(500, viewport * 0.7)
        case .S: return min(370, viewport * 0.52)
        }
    }

    /// A card is never lit by nothing: the cover's palette, else the author's.
    private func palette(_ e: FeedEvent?) -> [String] {
        guard let e else { return ["#6c6b76"] }
        switch e.kind {
        case .burst(_, let ids):
            let first = ids.first.flatMap { store.title($0)?.palette } ?? []
            let last = ids.last.flatMap { store.title($0)?.palette } ?? []
            if let a = first.first { return [a, last.count > 1 ? last[1] : a] }
        case .suggestion(let pid, _, _, _):
            if let p = store.person(pid), !p.hexes.isEmpty { return p.hexes }
        default:
            if let id = e.titleID, let t = store.title(id) { return t.palette }
        }
        return store.person(e.authorID)?.hexes ?? ["#6c6b76"]
    }
}

// MARK: - Card

private struct FeedCard: View {
    @Environment(AppStore.self) private var store
    let event: FeedEvent
    let height: CGFloat

    private var title: Title? { event.titleID.flatMap { store.title($0) } }
    private var author: Person? { store.person(event.authorID) }
    private var isMe: Bool { event.authorID == store.me.id }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let author {
                Button { if author.id != store.me.id { store.push(.person(author.id)) } } label: {
                    AuthorChip(person: author, age: { if case .suggestion = event.kind { return "para ti" }; return ageLabel(event.ageHours) }())
                }
                .buttonStyle(.plain)
            }
            art
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            textBlock
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 22)
        .frame(height: height, alignment: .top)
        .contentShape(Rectangle())
        .onTapGesture {
            if let id = event.titleID { store.push(.title(id)) }
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: Art

    @ViewBuilder private var art: some View {
        switch event.kind {
        case .burst(_, let ids):
            let ts = ids.compactMap { store.title($0) }
            GeometryReader { geo in
                let h = min(geo.size.height, 220)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .bottom, spacing: 10) {
                        ForEach(ts) { t in
                            Button { store.push(.title(t.id)) } label: { CoverView(title: t, height: h) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                    .frame(height: geo.size.height)
                }
                .scrollClipDisabled()
                .padding(.horizontal, -20)
            }
        case .suggestion(_, _, _, let ids):
            let ts = ids.compactMap { store.title($0) }
            GeometryReader { geo in
                let h = min(geo.size.height * 0.8, geo.size.width * 0.5, 220)
                ZStack {
                    ForEach(Array(ts.enumerated()), id: \.element.id) { i, t in
                        let pos = CGFloat(i) - CGFloat(ts.count - 1) / 2
                        CoverView(title: t, height: h)
                            .rotationEffect(.degrees(Double(pos) * 8))
                            .offset(x: pos * min(h * 0.5, geo.size.width * 0.24), y: abs(pos) * 8)
                            .zIndex(i == ts.count / 2 ? 2 : Double(i) * 0.1)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
        default:
            if let t = title {
                GeometryReader { geo in
                    let maxH = geo.size.height
                    let w = min(geo.size.width, maxH * t.format.aspect)
                    CoverView(title: t, width: w, height: w / t.format.aspect,
                              badge: store.isUnreleased(t) ? .waiting(store.releaseLabel(t) ?? "") : .none)
                        .frame(width: geo.size.width, height: geo.size.height)
                }
            }
        }
    }

    // MARK: Text

    @ViewBuilder private var textBlock: some View {
        VStack(alignment: .leading, spacing: 9) {
            let pills = self.pills
            if !pills.isEmpty {
                FlowLayout(spacing: 7, lineSpacing: 7) {
                    ForEach(Array(pills.enumerated()), id: \.offset) { _, p in StatusPill(glyph: p.0, label: p.1) }
                }
            }
            switch event.kind {
            case .suggestion(let pid, let reason, let social, _):
                if let p = store.person(pid) {
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("@\(p.handle)").font(.kura.newsItalic(26)).foregroundStyle(KColor.text)
                            Text("\(reason). \(social).")
                                .font(.kura.ui(15))
                                .foregroundStyle(KColor.text2)
                                .lineLimit(3)
                        }
                        Spacer(minLength: 0)
                        FollowToggle(following: store.isFollowing(p.id), honey: true) { store.toggleFollow(p.id) }
                    }
                }
            case .burst(let col, let ids):
                Text("\(ids.count) títulos a \(col)")
                    .font(.kura.newsItalic(26))
                    .foregroundStyle(KColor.text)
                Text(ids.compactMap { store.title($0)?.name }.joined(separator: " · "))
                    .font(.kura.ui(15))
                    .foregroundStyle(KColor.text2)
                    .lineLimit(2)
            default:
                if let t = title {
                    (Text(t.name).foregroundColor(KColor.text)
                     + Text(" · \(t.creator)").foregroundColor(KColor.text2))
                        .font(.kura.newsItalic(26))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let r = store.review(event.reviewID) {
                    let revealed = !r.spoiler || store.revealedSpoilers.contains(r.id)
                    ZStack(alignment: .leading) {
                        Text(r.text)
                            .font(.kura.ui(15))
                            .lineSpacing(3)
                            .foregroundStyle(KColor.text)
                            .lineLimit(3)
                            .blur(radius: revealed ? 0 : 7)
                            .accessibilityHidden(!revealed)
                        if !revealed {
                            SpoilerPill { store.revealedSpoilers.insert(r.id) }
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .animation(.easeOut(duration: 0.24), value: revealed)
                }
            }
        }
    }

    private var pills: [(Glyph, String)] {
        switch event.kind {
        case .obsessed:
            return [(.flame, isMe ? "Me obsesiona" : "Le obsesiona")]
        case .completed(let m):
            var p: [(Glyph, String)] = [(.check, "Completo")]
            if let m, m != .completed { p.append((m.glyph, isMe ? m.myLabel : m.theirLabel)) }
            return p
        case .reviewed:
            var p: [(Glyph, String)] = [(.review, isMe ? "Reseñaste" : "Reseñó")]
            if let m = store.review(event.reviewID)?.mark { p.append((m.glyph, isMe ? m.myLabel : m.theirLabel)) }
            return p
        case .added(let c):
            return [(.bookmark, isMe ? "Agregaste a \(c)" : "Agregó a \(c)")]
        case .waitingAdd(_, let label):
            return [(.clock, "No puede esperar · \(label)")]
        case .burst(let c, let ids):
            return [(.bookmark, isMe ? "Agregaste \(ids.count) a \(c)" : "Agregó \(ids.count) a \(c)")]
        case .suggestion:
            return [(.users, "Te puede interesar")]
        }
    }

    private func ageLabel(_ h: Double) -> String {
        h < 24 ? "hace \(Int(h)) h" : "hace \(Int(h / 24)) d"
    }
}

private struct AuthorChip: View {
    let person: Person
    let age: String
    var body: some View {
        HStack(spacing: 8) {
            Seal(person: person, size: 28)
            Text("@\(person.handle)").font(.kura.ui(13, .semibold)).foregroundStyle(KColor.text).lineLimit(1)
            Text(age).monoLabel(11)
        }
        .padding(.leading, 4)
        .padding(.trailing, 12)
        .padding(.vertical, 4)
        .background(KColor.glassBg, in: Capsule())
        .accessibilityElement(children: .combine)
    }
}
