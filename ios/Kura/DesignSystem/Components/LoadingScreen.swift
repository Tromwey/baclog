import SwiftUI

/// A screen that is still arriving from the API (ficha, perfil ajeno,
/// colección): neutral tinted header, the shape of a cover and two text
/// bars. Same skeleton pulse as the rest of the app.
struct LoadingScreen: View {
    var square = false
    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    Skeleton(radius: square ? KRadius.coverL : KRadius.coverL)
                        .frame(width: square ? 200 : 200, height: square ? 200 : 300)
                    Skeleton(radius: 6).frame(width: 190, height: 26).padding(.top, 8)
                    Skeleton(radius: 5).frame(width: 120, height: 12)
                    HStack(spacing: 8) {
                        Skeleton(radius: 999).frame(width: 110, height: 44)
                        Skeleton(radius: 999).frame(width: 96, height: 44)
                    }
                    .padding(.top, 10)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 124)
                .padding(.bottom, 30)
                .background(Tint.neutralHeader)
            }
            .ignoresSafeArea(.container, edges: .top)
            TopChrome { EmptyView() }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }
}

/// The 404 shape: something that was here is gone (collection, title, person).
struct GoneView: View {
    static let defaultTitle = "esta colección ya no existe."
    static let defaultNote = "Se borró o dejó de estar disponible."
    var title = GoneView.defaultTitle
    var note = GoneView.defaultNote
    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 10) {
                Text(title).font(.kura.news(28)).foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text(note).font(.kura.ui(15)).foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 24)
            .padding(.top, 140)
            .frame(maxWidth: .infinity, alignment: .leading)
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

/// The scaffold of a pushed screen that reads one resource (ficha, perfil, colección):
/// the content once it's here; the 404 shape when the server said it's gone; the error
/// screen with Reintentar when the read failed; the skeleton meanwhile. The caller keeps
/// its own `.task` (what to load and when).
struct ResourceScreen<Value, Content: View>: View {
    let value: Value?
    let missing: Bool
    let error: KuraAPIError?
    let retry: () -> Void
    let gone: (title: String, note: String)
    var square: Bool
    @ViewBuilder let content: (Value) -> Content

    init(value: Value?, missing: Bool, error: KuraAPIError?, retry: @escaping () -> Void,
         gone: (title: String, note: String) = (GoneView.defaultTitle, GoneView.defaultNote),
         square: Bool = false, @ViewBuilder content: @escaping (Value) -> Content) {
        self.value = value
        self.missing = missing
        self.error = error
        self.retry = retry
        self.gone = gone
        self.square = square
        self.content = content
    }

    var body: some View {
        if let value {
            content(value)
        } else if missing {
            GoneView(title: gone.title, note: gone.note)
        } else if let error {
            LoadErrorScreen(error: error, retry: retry)
        } else {
            LoadingScreen(square: square)
        }
    }
}

// MARK: - Load errors (offline · catalog down · anything else)

extension KuraAPIError {
    /// Headline + note for a screen whose read failed. Kura voice: what
    /// happened and what to do, lowercase headline with a period, no "!".
    var loadCopy: (title: String, note: String) {
        switch self {
        case .offline: return ("sin conexión.", "Revisa tu red y vuelve a intentarlo.")
        case .unavailable: return ("no disponible por ahora.", "El catálogo no responde. Inténtalo de nuevo en un momento.")
        case .rateLimited: return ("un momento.", "Van muchas peticiones seguidas. Espera unos segundos y vuelve a intentarlo.")
        default: return ("no se pudo cargar.", "Algo falló de nuestro lado. Vuelve a intentarlo.")
        }
    }
}

/// The error block inside a screen that keeps its own header (tabs, lists).
struct LoadErrorBlock: View {
    let error: KuraAPIError
    var titleSize: CGFloat = 28
    let retry: () -> Void

    var body: some View {
        let copy = error.loadCopy
        VStack(alignment: .leading, spacing: 10) {
            Text(copy.title).font(.kura.news(titleSize)).foregroundStyle(KColor.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(copy.note).font(.kura.ui(15)).foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
            GlassButton(title: "Reintentar", systemImage: "arrow.clockwise", action: retry).padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A pushed screen whose read failed: same shape as `GoneView`, plus Reintentar.
struct LoadErrorScreen: View {
    let error: KuraAPIError
    let retry: () -> Void

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            LoadErrorBlock(error: error, retry: retry)
                .padding(.horizontal, 24)
                .padding(.top, 140)
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

/// Content is on screen but its refresh failed: one quiet line with Reintentar
/// (the offline case already has the franja; this is for the rest).
struct RetryStrip: View {
    let error: KuraAPIError
    var text: String? = nil
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: error == .offline ? "wifi.slash" : "arrow.clockwise").font(.system(size: 14, weight: .medium))
                .foregroundStyle(KColor.text)
            Text(text ?? (error == .offline ? "Sin conexión. Esto puede no estar al día." : "No se pudo actualizar."))
                .font(.kura.ui(14))
                .foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button(action: retry) {
                Text("Reintentar").monoLabel(11, color: KColor.text)
                    .padding(.horizontal, 6)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .frame(minHeight: 44)
        .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
    }
}
