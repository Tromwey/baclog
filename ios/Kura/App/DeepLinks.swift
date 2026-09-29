import Foundation
import UIKit
import os

// Universal Links: a shared `https://get-kura.app/…` link opens Kura instead of the web (and so
// does a legacy `https://baclog.app/…` one, shared before the domain change of 2026-09-29).
//
// The web side is `src/app/.well-known/apple-app-site-association/route.ts`: it only hands the app
// the shapes parsed here (everything else stays in Safari), and the entitlement is
// `applinks:get-kura.app` + `applinks:baclog.app` (Kura.entitlements / Kura-Debug.entitlements).
// `www.*` redirects to the apex, so Apple can't read an AASA there and it's not declared — but a
// tapped `www.` link is still ours, hence `hosts` lists them.

/// Where a web link points, in the app's terms. Built ONLY from a URL of our own site.
enum DeepLink: Equatable {
    /// `/item/{id}`, `/{handle}/item/{id}`, `/u/{handle}/item/{id}`.
    case title(String)
    /// `/{handle}`, `/u/{handle}`.
    case profile(handle: String)
    /// `/{handle}/{id}`, `/u/{handle}/{id}` (someone's public collection — or yours).
    case collection(handle: String, id: String)
    /// `/backlogs/{id}`: the web app's own-collection route (only ever yours).
    case ownCollection(String)
    /// `/recap` (the monthly recap email).
    case recap

    static let hosts: Set<String> = ["get-kura.app", "www.get-kura.app", "baclog.app", "www.baclog.app"]

    /// Nil = not ours or not a shape the app opens. Every path piece is validated as ONE segment
    /// (ids `[A-Za-z0-9_-]`, handles `USERNAME_RE`), so nothing with `/`, `.`/`..` or `%` ever
    /// reaches an API path (learning 2026-09-25-ios-urlcomponents-path-deja-pasar-dot-segments).
    static func parse(_ url: URL) -> DeepLink? {
        guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased() else { return nil }
        var ours = scheme == "https" && hosts.contains(host)
        #if DEBUG
        // Links the Debug build made itself point at the dev server (`PublicLinks.base`).
        if let dev = KuraRuntime.apiOrigin, dev.host?.lowercased() == host, dev.scheme == scheme, dev.port == url.port {
            ours = true
        }
        #endif
        guard ours else { return nil }
        // `pathComponents` decodes percent-escapes, so a `%2F` can't hide a second segment from
        // the checks below: each piece is re-validated after decoding.
        var parts = url.pathComponents.filter { $0 != "/" }
        if parts.first == "u" { parts.removeFirst(); guard !parts.isEmpty else { return nil } }
        else {
            switch parts.first {
            case "item":
                guard parts.count == 2, let id = id(parts[1]) else { return nil }
                return .title(id)
            case "backlogs":
                guard parts.count == 2, let id = id(parts[1]) else { return nil }
                return .ownCollection(id)
            case "recap":
                return parts.count == 1 ? .recap : nil
            default:
                break
            }
        }
        // Clean public URLs: /{handle}, /{handle}/{collectionId}, /{handle}/item/{titleId}.
        guard let first = parts.first, let h = handle(first) else { return nil }
        switch parts.count {
        case 1: return .profile(handle: h)
        case 2: return id(parts[1]).map { .collection(handle: h, id: $0) }
        case 3: return parts[1] == "item" ? id(parts[2]).map { .title($0) } : nil
        default: return nil
        }
    }

    private static let idChars = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")
    private static let handleChars = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_.")

    /// A catalog / collection id: a UUID on the server (`crypto.randomUUID()`), a short slug in the mock.
    private static func id(_ raw: String) -> String? {
        guard (1...64).contains(raw.count), raw.unicodeScalars.allSatisfy(idChars.contains) else { return nil }
        return raw
    }

    /// Same shape as the server's `USERNAME_RE` (`^[a-z0-9_.]{3,30}$`, lowercased, `@` dropped).
    private static func handle(_ raw: String) -> String? {
        var h = raw.lowercased()
        if h.hasPrefix("@") { h.removeFirst() }
        guard (3...30).contains(h.count), h.unicodeScalars.allSatisfy(handleChars.contains),
              h.contains(where: { $0 != "." }) else { return nil }
        return h
    }
}

/// A link that arrived before the tabs were up (cold start, or signed out): opened by
/// `AppStore.startIfNeeded` once the library is loaded — after a sign-in too, which is the point.
@MainActor
enum DeepLinkInbox {
    static var pending: DeepLink?
    /// The same link can arrive twice (`onOpenURL` and the browsing-web activity).
    fileprivate static var last: (url: URL, at: Date)?
}

extension AppStore {
    /// Entry point for `onOpenURL` / `onContinueUserActivity(NSUserActivityTypeBrowsingWeb)`.
    func openWebLink(_ url: URL) {
        let now = Date()
        if let last = DeepLinkInbox.last, last.url == url, now.timeIntervalSince(last.at) < 1 { return }
        DeepLinkInbox.last = (url, now)
        guard let link = DeepLink.parse(url) else {
            // The AASA only sends the shapes above; anything else (a malformed id, a route added
            // to the web later) is still a real page — show it there rather than drop the tap.
            // Only https links of our own host get here, and iOS opens an app's OWN universal
            // link in Safari when the app itself asks (no bounce back into Kura).
            KuraLog.links.info("universal link not handled in-app: \(url.path, privacy: .public)")
            if url.scheme == "https", let host = url.host?.lowercased(), DeepLink.hosts.contains(host) {
                UIApplication.shared.open(url)
            }
            return
        }
        open(link)
    }

    func open(_ link: DeepLink) {
        guard phase == .main, didBootstrap, loadState != .loading else {
            DeepLinkInbox.pending = link
            return
        }
        if sheet != nil { dismissSheet() }
        let mine = me.handle.lowercased()
        switch link {
        case .title(let id):
            show(.title(id))
        case .profile(let h):
            if !mine.isEmpty, h == mine { goHome(.profile) } else { show(.person(h)) }
        case .collection(let h, let id):
            // A link to one of YOUR collections opens your collection (editable), not the public view.
            if !mine.isEmpty, h == mine, collection(id) != nil { openOwnCollection(id) }
            else { show(.publicCollection(handle: h, id: id)) }
        case .ownCollection(let id):
            if collection(id) != nil { openOwnCollection(id) }
            else { showToast(ToastModel(text: "No encontramos esa colección.", kind: .info)) }
        case .recap:
            show(.recap())
        }
        KuraLog.links.info("universal link → \(String(describing: link), privacy: .public) on \(self.tab.rawValue, privacy: .public)")
    }

    /// Called once the tabs are up (`startIfNeeded`).
    func openPendingLink() {
        guard let link = DeepLinkInbox.pending else { return }
        DeepLinkInbox.pending = nil
        open(link)
    }

    /// Someone else's page: pushed on the tab you're on (like a push notification), so Volver
    /// returns to where you were.
    private func show(_ route: Route) {
        if path(tab).last != route { push(route) }
    }

    private func goHome(_ t: Tab) {
        if tab == t { heroResets[t, default: 0] += 1 }
        paths[t] = []
        tab = t
    }

    private func openOwnCollection(_ id: String) {
        if tab == .collections { heroResets[.collections, default: 0] += 1 }
        paths[.collections] = [.collection(id)]
        tab = .collections
    }
}

extension KuraLog {
    static let links = Logger(subsystem: "com.tromwey.kura", category: "links")
}
