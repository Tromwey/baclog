import SwiftUI
import UIKit

/// Profile photos (`avatarUrl` → `/api/avatar/{key}`, API.md §2.1).
///
/// `AsyncImage` can't send headers, and the route only serves the photo of a
/// PRIVATE account to its owner with the bearer (everyone else gets the same
/// 404 as a missing key). So photos load through `URLSession` with the bearer
/// — attached ONLY when the URL is on the API's own origin, never to a third
/// party — and stay decoded in memory by URL. The key rotates on every upload,
/// so a cached URL never shows a stale photo.
@MainActor
final class AvatarStore {
    static let shared = AvatarStore()

    private let cache = NSCache<NSURL, UIImage>()
    private var inflight: [URL: Task<UIImage?, Never>] = [:]
    /// URLs the server answered 404/410 for (private, deleted): not asked again this session.
    private var gone: Set<URL> = []
    private let session: URLSession
    /// Bumped by `clear()` (sign-out, account deleted): a download that started for the
    /// previous account never lands in the cache of the next one.
    private var generation = 0

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        // `/api/avatar` answers `Cache-Control: private`: nothing to gain from the disk cache,
        // and "privado" is immediate on the server — the memory cache is enough.
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        // The bearer never follows a redirect to another origin.
        session = URLSession(configuration: config, delegate: SameOriginRedirects(), delegateQueue: nil)
        cache.countLimit = 200
    }

    func cached(_ url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }

    /// Seeds the cache with a photo we already have (the one just uploaded).
    func prime(_ url: URL, _ image: UIImage) { cache.setObject(image, forKey: url as NSURL) }

    func image(for url: URL) async -> UIImage? {
        if let img = cached(url) { return img }
        if gone.contains(url) { return nil }
        if let t = inflight[url] { return await t.value }
        let session = self.session
        let gen = generation
        let task = Task<UIImage?, Never> { [weak self] in
            let (img, isGone) = await AvatarStore.fetch(url, session: session)
            if isGone { await MainActor.run { if self?.generation == gen { _ = self?.gone.insert(url) } } }
            return img
        }
        inflight[url] = task
        let img = await task.value
        // Signed out (or another account signed in) while it downloaded: drop it.
        guard gen == generation else { return nil }
        inflight[url] = nil
        if let img { cache.setObject(img, forKey: url as NSURL) }
        return img
    }

    func clear() {
        generation += 1
        for (_, t) in inflight { t.cancel() }
        inflight = [:]
        cache.removeAllObjects()
        gone = []
    }

    /// True when `url` is on the same origin as the API (scheme + host + port).
    nonisolated static func isAPIOrigin(_ url: URL) -> Bool {
        guard let api = KuraRuntime.apiOrigin else { return false }
        return url.scheme == api.scheme && url.host == api.host && url.port == api.port
    }

    private nonisolated static func fetch(_ url: URL, session: URLSession) async -> (UIImage?, Bool) {
        var req = URLRequest(url: url)
        if isAPIOrigin(url), let token = KuraRuntime.bearer() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        guard let (data, response) = try? await session.data(for: req),
              let http = response as? HTTPURLResponse else { return (nil, false) }
        // Only "it isn't there" is remembered; 401/408/429 and friends may work on the next try.
        guard (200..<300).contains(http.statusCode) else { return (nil, http.statusCode == 404 || http.statusCode == 410) }
        guard let img = UIImage(data: data) else { return (nil, true) }
        return (img.preparingForDisplay() ?? img, false)
    }
}

/// The photo inside a seal: fills the circle; nothing (the seal shows through)
/// until it loads or when it can't.
struct AvatarPhoto: View {
    let url: URL
    let size: CGFloat
    @State private var loaded: (url: URL, image: UIImage)?

    var body: some View {
        let img = (loaded?.url == url ? loaded?.image : nil) ?? AvatarStore.shared.cached(url)
        ZStack {
            if let img {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
                    .transition(.opacity)
            }
        }
        .frame(width: size, height: size)
        .animation(KMotion.fade, value: img != nil)
        .task(id: url) {
            guard AvatarStore.shared.cached(url) == nil else { return }
            if let image = await AvatarStore.shared.image(for: url) { loaded = (url, image) }
        }
        .accessibilityHidden(true)
    }
}
