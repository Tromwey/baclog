import SwiftUI
import Observation
import UIKit

enum AppPhase: Hashable {
    case splash
    case onboarding
    case main
}

enum SheetStyle { case compact, tall }

/// Every bottom sheet in the app. They are drawn by `SheetHost` (not the system
/// `.sheet`) so they match the frames: inset 8, radius 36, s2, scrim .62.
enum SheetRoute: Identifiable, Hashable {
    case newCollection(addingTitleID: String?, movingFrom: String? = nil)
    case collectionQuick(String)
    case more(String)
    case sort(String)
    case rename(String)
    case privacy(String)
    case share(String)
    case deleteCollection(String)
    case titleActions(titleID: String, collectionID: String)
    case moveTo(titleID: String, fromID: String)
    case complete(titleID: String, focusReview: Bool)
    case saveTo(String)
    case titleMore(String)
    case addTitles(String)
    case settings

    var id: String { String(describing: self) }

    var style: SheetStyle {
        if case .addTitles = self { return .tall }
        return .compact
    }

    var showsGrabber: Bool {
        if case .deleteCollection = self { return false }
        return true
    }
}

struct ToastModel: Identifiable, Equatable {
    enum Kind: Equatable { case undo, retry, info }
    let id = UUID()
    var text: String
    var kind: Kind
    var action: (() -> Void)?

    static func == (a: ToastModel, b: ToastModel) -> Bool { a.id == b.id }
}

enum LoadState { case loading, loaded }

@MainActor
@Observable
final class AppStore {
    // MARK: Dependencies
    @ObservationIgnored let api: KuraAPI
    let now: Date

    // MARK: Phase / navigation
    var phase: AppPhase = .splash
    var tab: Tab = .collections
    var paths: [Tab: [Route]] = [:]
    var sheet: SheetRoute?
    var toast: ToastModel?
    var offline = false
    var loadState: LoadState = .loading

    // MARK: Data
    var me: Person = MockData.me
    var people: [String: Person] = [:]
    var titles: [String: Title] = [:]
    var catalogOrder: [String] = []
    var collections: [KCollection] = []
    var userTitles: [String: UserTitleState] = [:]
    var following: Set<String> = []
    var reviews: [Review] = []
    var feed: [FeedEvent] = []
    var revealedSpoilers: Set<String> = []
    /// Last collection used in "guardar en" — preselected next time.
    var lastUsedCollectionID: String?

    /// Onboarding picks (the three obsessions).
    var onboardingPicks: [String] = []
    var onboardingStep: OnboardingStep = .welcome

    // MARK: Launch options (DEBUG screenshots)
    @ObservationIgnored var holdSplash = false
    @ObservationIgnored var emptyLibrary = false
    @ObservationIgnored var keepLoading = false
    @ObservationIgnored var pendingSheet: SheetRoute?
    @ObservationIgnored var didBootstrap = false
    @ObservationIgnored var pendingListCollection: String?
    @ObservationIgnored var pendingAction: (() -> Void)?
    @ObservationIgnored var debugFeedAnchor: String?

    @ObservationIgnored private var toastTask: Task<Void, Never>?

    init(api: KuraAPI = MockAPI(), now: Date = MockData.now) {
        self.api = api
        self.now = now
        // Catalog/people are local and instant; collections arrive with latency.
        for t in MockData.titles { titles[t.id] = t }
        catalogOrder = MockData.titles.map(\.id)
        for p in MockData.people { people[p.id] = p }
    }

    // MARK: Loading

    func bootstrap(emptyLibrary: Bool = false, keepLoading: Bool = false) async {
        loadState = .loading
        async let cat = api.catalog()
        async let ppl = api.people()
        async let fol = api.following()
        async let rev = api.reviews()
        async let fd = api.feed()
        async let ut = api.userTitles()
        async let cols = api.collections()
        do {
            let (catalog, persons, follows, revs, events, states, library) = try await (cat, ppl, fol, rev, fd, ut, cols)
            for t in catalog { titles[t.id] = t }
            catalogOrder = catalog.map(\.id)
            for p in persons { people[p.id] = p }
            following = follows.union(following)
            reviews = revs
            feed = events
            if emptyLibrary {
                collections = []
                userTitles = [:]
            } else {
                collections = library
                userTitles = states
                lastUsedCollectionID = library.first(where: \.pinned)?.id
            }
            if !keepLoading { loadState = .loaded }
        } catch {
            showToast(ToastModel(text: "No se pudo cargar", kind: .retry) { [weak self] in
                Task { await self?.bootstrap() }
            })
        }
    }

    // MARK: Lookups

    func title(_ id: String) -> Title? { titles[id] }
    func person(_ id: String) -> Person? { people[id] }
    func collection(_ id: String) -> KCollection? { collections.first { $0.id == id } }
    func mark(_ titleID: String) -> Mark? { userTitles[titleID]?.mark }
    func review(_ id: String?) -> Review? { id.flatMap { rid in reviews.first { $0.id == rid } } }
    func myReview(_ titleID: String) -> Review? { reviews.first { $0.titleID == titleID && $0.authorID == me.id } }

    /// Collections ordered for "tus colecciones": pinned first, then newest.
    var orderedCollections: [KCollection] {
        collections.sorted { a, b in
            if a.pinned != b.pinned { return a.pinned }
            if a.titleIDs.isEmpty != b.titleIDs.isEmpty { return !a.titleIDs.isEmpty }
            return a.createdAt > b.createdAt
        }
    }

    func titles(in c: KCollection, format: MediaFormat? = nil) -> [Title] {
        var list = c.titleIDs.compactMap { titles[$0] }
        if let format { list = list.filter { $0.format == format } }
        switch c.sort {
        case .manual:
            break
        case .recent:
            list.sort { savedDate($0.id, in: c) > savedDate($1.id, in: c) }
        case .title:
            list.sort { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .status:
            list.sort { (mark($0.id)?.rank ?? 9) < (mark($1.id)?.rank ?? 9) }
        case .year:
            list.sort { ($0.year ?? 0) > ($1.year ?? 0) }
        }
        return list
    }

    private func savedDate(_ titleID: String, in c: KCollection) -> Date {
        c.addedAt[titleID] ?? userTitles[titleID]?.savedAt ?? .distantPast
    }

    func coverTitle(of c: KCollection) -> Title? {
        if let id = c.coverTitleID, c.titleIDs.contains(id), let t = titles[id] { return t }
        return c.titleIDs.first.flatMap { titles[$0] }
    }

    func palette(of c: KCollection) -> [String]? { coverTitle(of: c)?.palette }

    func collectionsContaining(_ titleID: String) -> [KCollection] {
        orderedCollections.filter { $0.titleIDs.contains(titleID) }
    }

    func isSaved(_ titleID: String) -> Bool { !collectionsContaining(titleID).isEmpty }

    // MARK: No puedo esperar

    private static let months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    private var cal: Calendar { MockData.calendar }

    /// True while the title (or, for a series, its announced season) is not out.
    func isUnreleased(_ t: Title) -> Bool {
        guard let r = t.release else { return false }
        if t.upcomingSeason != nil { return false } // the show itself is out; the season waits
        switch r {
        case .day(let d): return cal.startOfDay(for: d) > cal.startOfDay(for: now)
        case .month(let y, let m):
            let c = cal.dateComponents([.year, .month], from: now)
            return (y, m) > (c.year ?? 0, c.month ?? 0)
        case .year(let y): return y > (cal.component(.year, from: now))
        case .unknown: return true
        }
    }

    /// The DS countdown: "14 h", "3 d", "16 oct", "oct 2026", "2027", "sin fecha", "hoy", "ya salió".
    func releaseLabel(_ t: Title, withSeason: Bool = false) -> String? {
        guard let r = t.release else { return nil }
        let base: String
        switch r {
        case .day(let d):
            let today = cal.startOfDay(for: now)
            let day = cal.startOfDay(for: d)
            if day < today { base = "ya salió"; break }
            if day == today { base = "hoy"; break }
            let days = cal.dateComponents([.day], from: today, to: day).day ?? 0
            let hours = Int((d.timeIntervalSince(now) / 3600).rounded(.up))
            if days <= 1 && hours <= 24 {
                base = "\(max(hours, 1)) h"
            } else if days <= 7 {
                base = "\(days) d"
            } else {
                let comps = cal.dateComponents([.year, .month, .day], from: d)
                var s = "\(comps.day ?? 0) \(Self.months[(comps.month ?? 1) - 1])"
                if comps.year != cal.component(.year, from: now) { s += " \(comps.year ?? 0)" }
                base = s
            }
        case .month(let y, let m): base = "\(Self.months[m - 1]) \(y)"
        case .year(let y): base = "\(y)"
        case .unknown: base = "sin fecha"
        }
        if withSeason, let s = t.upcomingSeason { return "T\(s) · \(base)" }
        return base
    }

    /// Long form for sentences: "sale el 16 oct".
    func releaseSentence(_ t: Title) -> String? {
        guard let label = releaseLabel(t) else { return nil }
        switch label {
        case "ya salió", "hoy", "sin fecha": return label
        default:
            if label.hasSuffix(" h") || label.hasSuffix(" d") { return "sale en \(label)" }
            return "sale el \(label)"
        }
    }

    /// The automatic collection: announced titles you saved, until you complete them.
    var waitingTitles: [Title] {
        let saved = Set(collections.flatMap(\.titleIDs))
        let list = saved.compactMap { titles[$0] }.filter { $0.release != nil && mark($0.id) == nil }
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

    // MARK: Toasts

    func showToast(_ t: ToastModel) {
        toastTask?.cancel()
        withAnimation(KMotion.short) { toast = t }
        let id = t.id
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.toast?.id == id else { return }
                withAnimation(KMotion.short) { self.toast = nil }
            }
        }
    }

    func undoToast(_ text: String, undo: @escaping () -> Void) {
        showToast(ToastModel(text: text, kind: .undo) { [weak self] in
            undo()
            withAnimation(KMotion.short) { self?.toast = nil }
        })
    }

    func dismissToast() { withAnimation(KMotion.short) { toast = nil } }

    /// Runs an API write; on failure offers "Reintentar".
    private func sync(_ op: @escaping @Sendable (KuraAPI) async throws -> Void) {
        let api = self.api
        Task { [weak self] in
            do { try await op(api) } catch {
                await MainActor.run {
                    self?.showToast(ToastModel(text: "No se pudo guardar", kind: .retry) { [weak self] in
                        self?.sync(op)
                    })
                }
            }
        }
    }

    // MARK: Sheets & navigation

    func present(_ route: SheetRoute) {
        withAnimation(KMotion.sheetIn) { sheet = route }
    }

    func dismissSheet() {
        withAnimation(KMotion.sheetOut) { sheet = nil }
    }

    func path(_ tab: Tab) -> [Route] { paths[tab] ?? [] }

    func push(_ route: Route) {
        var p = paths[tab] ?? []
        p.append(route)
        paths[tab] = p
    }

    func pop() {
        var p = paths[tab] ?? []
        if !p.isEmpty { p.removeLast() }
        paths[tab] = p
    }

    func select(_ newTab: Tab) {
        if newTab == tab {
            paths[newTab] = [] // tapping the active tab pops to root
        }
        tab = newTab
    }

    // MARK: Collection writes

    @discardableResult
    func createCollection(name: String, privacy: Privacy, adding titleID: String? = nil) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        var c = KCollection(id: "c-\(UUID().uuidString.prefix(8))",
                            name: trimmed.isEmpty ? "colección nueva" : trimmed.lowercased(),
                            titleIDs: [], privacy: privacy, createdAt: Date())
        if let titleID {
            c.titleIDs = [titleID]
            c.addedAt[titleID] = Date()
            ensureUserState(titleID)
        }
        collections.append(c)
        lastUsedCollectionID = c.id
        let copy = c
        sync { try await $0.createCollection(copy) }
        return c.id
    }

    private func update(_ id: String, _ change: (inout KCollection) -> Void) {
        guard let i = collections.firstIndex(where: { $0.id == id }) else { return }
        change(&collections[i])
        let copy = collections[i]
        sync { try await $0.updateCollection(copy) }
    }

    func rename(_ id: String, to name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let old = collection(id)?.name else { return }
        update(id) { $0.name = trimmed.lowercased() }
        undoToast("Renombrada") { [weak self] in self?.update(id) { $0.name = old } }
    }

    func setPrivacy(_ id: String, _ p: Privacy) {
        guard let old = collection(id)?.privacy, old != p else { return }
        update(id) { $0.privacy = p }
        undoToast("Ahora la ve: \(p.label.lowercased())") { [weak self] in self?.update(id) { $0.privacy = old } }
    }

    func togglePin(_ id: String) {
        guard let c = collection(id) else { return }
        let pinned = !c.pinned
        update(id) { $0.pinned = pinned }
        undoToast(pinned ? "Fijada arriba" : "Ya no está fijada") { [weak self] in
            self?.update(id) { $0.pinned = !pinned }
        }
    }

    func setCover(_ id: String, titleID: String) {
        let old = collection(id)?.coverTitleID
        update(id) { $0.coverTitleID = titleID }
        undoToast("Portada cambiada") { [weak self] in self?.update(id) { $0.coverTitleID = old } }
    }

    func setSort(_ id: String, _ s: SortMode) { update(id) { $0.sort = s } }
    func setLayout(_ id: String, _ l: CollectionLayout) { update(id) { $0.layout = l } }

    func reorder(_ id: String, from: IndexSet, to: Int) {
        update(id) { c in
            c.titleIDs.move(fromOffsets: from, toOffset: to)
            c.sort = .manual
        }
    }

    func deleteCollection(_ id: String) {
        collections.removeAll { $0.id == id }
        for tab in Tab.allCases {
            paths[tab]?.removeAll { r in
                if case .collection(let cid) = r { return cid == id }
                return false
            }
        }
        sync { try await $0.deleteCollection(id: id) }
        showToast(ToastModel(text: "Colección borrada", kind: .info))
    }

    // MARK: Title membership

    private func ensureUserState(_ titleID: String) {
        if userTitles[titleID] == nil { userTitles[titleID] = UserTitleState(savedAt: Date()) }
    }

    /// If a title is in no collection anymore its state goes with it.
    private func gcUserState(_ titleID: String) {
        if !isSaved(titleID) {
            userTitles[titleID] = nil
            reviews.removeAll { $0.titleID == titleID && $0.authorID == me.id }
        }
    }

    func add(_ titleID: String, to collectionID: String, toast: Bool = true) {
        guard let c = collection(collectionID), !c.titleIDs.contains(titleID) else { return }
        let hadState = userTitles[titleID]
        ensureUserState(titleID)
        update(collectionID) { $0.titleIDs.append(titleID); $0.addedAt[titleID] = Date() }
        lastUsedCollectionID = collectionID
        if toast {
            undoToast("Agregado a \(c.name)") { [weak self] in
                self?.update(collectionID) { $0.titleIDs.removeAll { $0 == titleID } }
                if hadState == nil { self?.gcUserState(titleID) }
            }
        }
    }

    /// Silent inverse used by the add sheet's ✓ → + toggle.
    func removeSilently(_ titleID: String, from collectionID: String) {
        update(collectionID) { $0.titleIDs.removeAll { $0 == titleID } }
        gcUserState(titleID)
    }

    func remove(_ titleID: String, from collectionID: String) {
        guard let c = collection(collectionID), let idx = c.titleIDs.firstIndex(of: titleID) else { return }
        let state = userTitles[titleID]
        let myReviews = reviews.filter { $0.titleID == titleID && $0.authorID == me.id }
        update(collectionID) { $0.titleIDs.remove(at: idx) }
        gcUserState(titleID)
        undoToast("Quitado de \(c.name)") { [weak self] in
            guard let self else { return }
            self.update(collectionID) { $0.titleIDs.insert(titleID, at: min(idx, $0.titleIDs.count)) }
            if self.userTitles[titleID] == nil { self.userTitles[titleID] = state }
            for r in myReviews where !self.reviews.contains(r) { self.reviews.append(r) }
        }
    }

    func move(_ titleID: String, from fromID: String, to toID: String) {
        guard fromID != toID, let from = collection(fromID), let to = collection(toID),
              let idx = from.titleIDs.firstIndex(of: titleID) else { return }
        let alreadyThere = to.titleIDs.contains(titleID)
        update(fromID) { $0.titleIDs.remove(at: idx) }
        if !alreadyThere { update(toID) { $0.titleIDs.append(titleID); $0.addedAt[titleID] = Date() } }
        lastUsedCollectionID = toID
        undoToast("Movido a \(to.name)") { [weak self] in
            guard let self else { return }
            if !alreadyThere { self.update(toID) { $0.titleIDs.removeAll { $0 == titleID } } }
            self.update(fromID) { $0.titleIDs.insert(titleID, at: min(idx, $0.titleIDs.count)) }
        }
    }

    /// "Guardar en": sets the exact membership of a title.
    func setMembership(_ titleID: String, collections ids: Set<String>) {
        let before = Set(collectionsContaining(titleID).map(\.id))
        guard before != ids else { return }
        let hadState = userTitles[titleID]
        if !ids.isEmpty { ensureUserState(titleID) }
        for id in ids.subtracting(before) { update(id) { $0.titleIDs.append(titleID); $0.addedAt[titleID] = Date() } }
        for id in before.subtracting(ids) { update(id) { $0.titleIDs.removeAll { $0 == titleID } } }
        if let first = ids.subtracting(before).first { lastUsedCollectionID = first }
        gcUserState(titleID)
        let text: String
        if ids.isEmpty {
            text = "Ya no está guardado"
        } else if ids.count == 1, let c = collection(ids.first!) {
            text = "Guardado en \(c.name)"
        } else {
            text = "Guardado en \(ids.count) colecciones"
        }
        undoToast(text) { [weak self] in
            guard let self else { return }
            for id in ids.subtracting(before) { self.update(id) { $0.titleIDs.removeAll { $0 == titleID } } }
            for id in before.subtracting(ids) { self.update(id) { $0.titleIDs.append(titleID) } }
            self.userTitles[titleID] = hadState
        }
    }

    // MARK: Reactions

    func setMark(_ titleID: String, _ mark: Mark?, haptic: Bool = true) {
        ensureUserState(titleID)
        userTitles[titleID]?.mark = mark
        if haptic {
            switch mark {
            case .obsessed: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case .liked: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            default: break
            }
        }
        sync { try await $0.setMark(titleID: titleID, mark: mark) }
    }

    func publishReview(titleID: String, text: String, spoiler: Bool) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        ensureUserState(titleID)
        let mark = self.mark(titleID)
        if let i = reviews.firstIndex(where: { $0.titleID == titleID && $0.authorID == me.id }) {
            reviews[i].text = trimmed
            reviews[i].spoiler = spoiler
            reviews[i].mark = mark
            let r = reviews[i]
            sync { try await $0.saveReview(r) }
        } else {
            let r = Review(id: "r-\(UUID().uuidString.prefix(6))", authorID: me.id, titleID: titleID,
                           text: trimmed, mark: mark, spoiler: spoiler, date: Date())
            reviews.insert(r, at: 0)
            userTitles[titleID]?.reviewID = r.id
            sync { try await $0.saveReview(r) }
        }
    }

    func toggleEpisode(_ titleID: String, key: String) {
        ensureUserState(titleID)
        var set = userTitles[titleID]?.watchedEpisodes ?? []
        let watched = !set.contains(key)
        if watched { set.insert(key) } else { set.remove(key) }
        userTitles[titleID]?.watchedEpisodes = set
        UISelectionFeedbackGenerator().selectionChanged()
        sync { try await $0.setEpisodeWatched(titleID: titleID, key: key, watched: watched) }
    }

    // MARK: Social

    func isFollowing(_ id: String) -> Bool { following.contains(id) }

    func toggleFollow(_ id: String) {
        let now = !following.contains(id)
        if now { following.insert(id) } else { following.remove(id) }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        sync { try await $0.setFollowing(personID: id, following: now) }
    }

    /// Followed people who did something with this title.
    func followedMarks(for titleID: String) -> [(Person, Mark)] {
        (MockData.peopleMarks[titleID] ?? []).compactMap { pair in
            guard following.contains(pair.0), let p = people[pair.0] else { return nil }
            return (p, pair.1)
        }
    }

    // MARK: Counters (profile ribbon)

    func count(of mark: Mark) -> Int { userTitles.values.filter { $0.mark == mark }.count }
    var savedCount: Int { Set(collections.flatMap(\.titleIDs)).count }

    // MARK: Session

    func finishOnboarding() {
        withAnimation(KMotion.short) { phase = .main }
    }

    /// Called once when the main UI first appears.
    func startIfNeeded() async {
        guard !didBootstrap else { return }
        didBootstrap = true
        await bootstrap(emptyLibrary: emptyLibrary, keepLoading: keepLoading)
        if let id = pendingListCollection, let i = collections.firstIndex(where: { $0.id == id }) {
            collections[i].layout = .list
        }
        if let action = pendingAction {
            pendingAction = nil
            try? await Task.sleep(for: .milliseconds(300))
            action()
        }
        if let s = pendingSheet {
            pendingSheet = nil
            try? await Task.sleep(for: .milliseconds(250))
            present(s)
        }
    }

    func signOut() {
        sheet = nil
        paths = [:]
        tab = .collections
        withAnimation(KMotion.short) { phase = .onboarding }
    }
}
