import SwiftUI

/// Shared-cover transition (DS "Portada compartida", 320 ms): a card's cover
/// grows into the ficha / colección. iOS 18+ uses the navigation zoom
/// transition (the system's matched-geometry for pushes); iOS 17 falls back
/// to the standard push.
private struct CoverNamespaceKey: EnvironmentKey {
    static let defaultValue: Namespace.ID? = nil
}

extension EnvironmentValues {
    var coverNamespace: Namespace.ID? {
        get { self[CoverNamespaceKey.self] }
        set { self[CoverNamespaceKey.self] = newValue }
    }
}

private struct ZoomSource: ViewModifier {
    @Environment(\.coverNamespace) private var ns
    let id: String
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *), let ns {
            content.matchedTransitionSource(id: id, in: ns)
        } else {
            content
        }
    }
}

private struct ZoomDestination: ViewModifier {
    @Environment(\.coverNamespace) private var ns
    let id: String
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *), let ns {
            content.navigationTransition(.zoom(sourceID: id, in: ns))
        } else {
            content
        }
    }
}

extension View {
    /// Marks this view as the cover a push grows from.
    func zoomSource(_ id: String) -> some View { modifier(ZoomSource(id: id)) }
    /// The pushed screen that grows out of `zoomSource(id)`.
    func zoomDestination(_ id: String) -> some View { modifier(ZoomDestination(id: id)) }
}

enum ZoomID {
    static func title(_ id: String) -> String { "title-\(id)" }
    static func collection(_ id: String) -> String { "collection-\(id)" }
}
