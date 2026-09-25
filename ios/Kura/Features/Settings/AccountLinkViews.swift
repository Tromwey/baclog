import SwiftUI

// MARK: - Ajustes › Inicio de sesión

/// The rows of Ajustes › "inicio de sesión": the account email (always a way in, not tappable),
/// Apple and Google (only what `GET /me/identities` lists as enabled) and Fusionar otra cuenta.
struct IdentityRows: View {
    @Environment(AppStore.self) private var store

    private var email: String {
        store.identities?.email ?? store.account?.email ?? MockPrefill.email
    }

    var body: some View {
        SettingsRow(title: "Correo", note: store.identities?.emailIsRelay == true ? "Correo privado de Apple." : nil) {
            Text(email)
                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                .lineLimit(1).truncationMode(.middle)
        }
        if let ids = store.identities {
            // Google needs the client id from `auth/providers`; a linked one always shows (to disconnect).
            ForEach(ids.providers.filter { $0.linked || store.canRun($0.provider) }, id: \.provider) { link in
                ListDivider()
                ProviderRow(link: link)
            }
        } else if store.loadError(.identities) == nil {
            ListDivider()
            HStack(spacing: 14) {
                Skeleton(radius: 999).frame(width: 32, height: 32)
                Skeleton(radius: 6).frame(width: 90, height: 14)
                Spacer()
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 60)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Cargando")
        }
        ListDivider()
        SettingsRow(title: "Fusionar otra cuenta", action: { store.push(.mergeAccount) }) { RowValue(text: "") }
    }
}

/// Apple / Google: Conectar (the provider's own sheet, then `POST`), or Conectada + Desconectar.
private struct ProviderRow: View {
    @Environment(AppStore.self) private var store
    let link: Identities.Link

    var body: some View {
        let p = link.provider
        // Relay email + Apple as the only link: no Desconectar, just why (the server would 409).
        let lastWayIn = p == .apple && store.identities?.appleIsLastWayIn == true
        HStack(spacing: 14) {
            ProviderMark(provider: p)
            VStack(alignment: .leading, spacing: 3) {
                Text(p.label).font(.kura.ui(16)).foregroundStyle(KColor.text)
                if lastWayIn {
                    Text("Conectada. Tu correo es el privado de Apple, así que es tu única entrada: conecta Google para poder quitarla.")
                        .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                } else if link.linked {
                    Text("Conectada").font(.kura.ui(13)).foregroundStyle(KColor.text2)
                }
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 8)
            if lastWayIn {
                EmptyView()
            } else if store.identityBusy == p {
                ProgressView().tint(KColor.text).frame(width: 44, height: 36)
            } else if link.linked {
                GlassButton(title: "Desconectar", height: 36, fontSize: 14) { store.present(.unlinkIdentity(p)) }
                    .kHitArea(vertical: 4)
                    .accessibilityLabel("Desconectar \(p.label)")
            } else {
                GlassButton(title: "Conectar", height: 36, fontSize: 14) { Task { await store.connect(p) } }
                    .kHitArea(vertical: 4)
                    .disabled(store.identityBusy != nil || !store.canRun(p))
                    .accessibilityLabel("Conectar \(p.label)")
            }
        }
        .padding(.leading, 16).padding(.trailing, 14)
        .padding(.vertical, lastWayIn ? 10 : 0)
        .frame(minHeight: 60)
        .animation(KMotion.fade, value: link.linked)
    }
}

/// Apple's logo / Google's "G" (the same text G as the entrance's button), in a 32 pt s2 circle.
private struct ProviderMark: View {
    let provider: IdentityProvider
    var body: some View {
        Group {
            switch provider {
            case .apple: Image(systemName: "apple.logo").font(.system(size: 15, weight: .medium))
            case .google: Text("G").font(.system(size: 14, weight: .bold))
            }
        }
        .foregroundStyle(KColor.text)
        .frame(width: 32, height: 32)
        .background(KColor.s2, in: Circle())
        .accessibilityHidden(true)
    }
}

/// "¿desconectar Apple?" — the one confirmation before `DELETE /me/identities/{provider}`.
struct UnlinkIdentitySheet: View {
    @Environment(AppStore.self) private var store
    let provider: IdentityProvider
    @State private var busy = false

    /// Apple is the only real way in (relay email): the row hides Desconectar, but if this sheet is
    /// reached anyway it explains instead of offering what the server would refuse.
    private var lastWayIn: Bool { provider == .apple && store.identities?.appleIsLastWayIn == true }

    var body: some View {
        let email = store.identities?.email ?? store.account?.email ?? ""
        VStack(alignment: .leading, spacing: 6) {
            Text(lastWayIn ? "apple es tu única entrada." : "¿desconectar \(provider.label)?")
                .font(.kura.news(26))
                .foregroundStyle(KColor.text)
                .accessibilityAddTraits(.isHeader)
                .padding(.horizontal, 8)
            Text(lastWayIn
                 ? AppStore.lastWayInText
                 : email.isEmpty
                 ? "Ya no podrás entrar con \(provider.label). Sigues entrando con tu correo."
                 : "Ya no podrás entrar con \(provider.label). Sigues entrando con tu correo, \(email).")
                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)
                .padding(.top, 4).padding(.bottom, 16)
            if !lastWayIn {
                SolidButton(title: busy ? "Desconectando…" : "Desconectar", enabled: !busy) { confirm() }
            }
            Button { store.dismissSheet() } label: {
                Text(lastWayIn ? "Entendido" : "Cancelar")
                    .font(.kura.ui(16, .medium))
                    .foregroundStyle(KColor.text)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(busy)
        }
        .padding(.horizontal, 16)
    }

    private func confirm() {
        guard !busy else { return }
        busy = true
        store.sheetLocked = true
        Task {
            await store.disconnect(provider)
            busy = false
            store.sheetLocked = false
            store.dismissSheet()
        }
    }
}

// MARK: - Fusionar otra cuenta (elige cómo probar que es tuya)

struct MergeAccountView: View {
    @Environment(AppStore.self) private var store
    @State private var email = ""
    @FocusState private var focused: Bool

    private var providers: [IdentityProvider] {
        (store.identities?.providers ?? []).map(\.provider).filter { store.canRun($0) }
    }
    private var busy: Bool { store.mergeBusy || store.identityBusy != nil }

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("fusionar otra cuenta").font(.kura.screenTitle).foregroundStyle(KColor.text)
                            .accessibilityAddTraits(.isHeader)
                        Text("Si tienes otra cuenta de kura, trae todo lo suyo a esta. La otra desaparece.")
                            .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, 16)

                    Text("prueba que es tuya").monoLabel().padding(.horizontal, 8)

                    if !providers.isEmpty {
                        VStack(spacing: 10) {
                            ForEach(providers) { p in
                                AuthButton(kind: p == .apple ? .apple : .google) {
                                    focused = false
                                    Task { await store.connect(p, fromMerge: true) }
                                }
                                .disabled(busy)
                                .opacity(store.identityBusy == p ? 0.6 : 1)
                            }
                        }
                        .transition(.opacity)
                        Text("o con su correo").monoLabel()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }

                    GlassField(placeholder: "correo de la otra cuenta", text: $email, focus: $focused)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .submitLabel(.send)
                        .onSubmit(send)
                    if providers.isEmpty {
                        SolidButton(title: store.mergeBusy ? "Enviando…" : "Mandarme un código", enabled: !busy, action: send)
                    } else {
                        GlassButton(title: store.mergeBusy ? "Enviando…" : "Mandarme un código", height: 52, fontSize: 16, fullWidth: true, action: send)
                            .disabled(busy)
                    }
                    InlineError(text: store.mergeError).padding(.horizontal, 8)
                    Text("Te mandamos un código de seis dígitos a ese correo.")
                        .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                        .padding(.top, 2)
                }
                .padding(.top, KSize.pushedTitleTop)
                .padding(.horizontal, 16)
                .padding(.bottom, 56)
                .animation(KMotion.fade, value: providers)
            }
            .scrollDismissesKeyboard(.interactively)
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
        .onAppear {
            store.mergeError = nil
            if email.isEmpty { email = store.mergeEmail }
        }
        .task { if store.identities == nil { await store.loadIdentities() } else { await store.loadAuthProviders() } }
    }

    private func send() {
        guard !busy else { return }
        focused = false
        Task {
            if await store.requestMergeCode(email: email) { store.push(.mergeCode) }
        }
    }
}

// MARK: - Fusionar › el código (the entrance's O1c, for the other account's email)

struct MergeCodeView: View {
    @Environment(AppStore.self) private var store
    @State private var code = ""
    @FocusState private var focused: Bool

    private var digits: String { String(code.filter(\.isNumber).prefix(6)) }

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            VStack(spacing: 12) {
                Text("su código.")
                    .font(.kura.news(40))
                    .foregroundStyle(KColor.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                (Text("Lo mandamos a ").foregroundColor(KColor.text2)
                 + Text(store.mergeEmail).foregroundColor(KColor.text))
                    .font(.kura.ui(15))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 20)
                GlassField(placeholder: "seis dígitos", text: $code, focus: $focused)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .onChange(of: code) { _, new in
                        let d = String(new.filter(\.isNumber).prefix(6))
                        if d != new { code = d }
                        if d.count == 6 { verify() }
                    }
                SolidButton(title: store.mergeBusy ? "Revisando…" : "Continuar", enabled: digits.count == 6 && !store.mergeBusy, action: verify)
                InlineError(text: store.mergeError)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // After a 429 the button waits out `retryAfterSeconds` (up to an hour), counting down.
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    let wait = store.mergeRetryAt.map { max(0, $0.timeIntervalSince(ctx.date)) } ?? 0
                    Button {
                        Task { _ = await store.requestMergeCode(email: store.mergeEmail); code = "" }
                    } label: {
                        Text(wait > 0 ? "Mandar otro código en \(Self.waitLabel(wait))" : "Mandar otro código")
                            .font(.kura.ui(15, .medium))
                            .foregroundStyle(wait > 0 ? KColor.text3 : KColor.text2)
                            .monospacedDigit()
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .disabled(store.mergeBusy || wait > 0)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, KSize.pushedTitleTop)
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
        .onAppear {
            store.mergeError = nil
            focused = true
        }
    }

    private func verify() {
        guard digits.count == 6, !store.mergeBusy else { return }
        focused = false
        Task { await store.verifyMergeCode(digits) }
    }

    /// "40 min" over a minute and a half, else "45 s".
    static func waitLabel(_ s: TimeInterval) -> String {
        s >= 90 ? "\(Int((s / 60).rounded(.up))) min" : "\(Int(s.rounded(.up))) s"
    }
}

// MARK: - Fusionar › confirmar

/// What the other account is, what happens to it, and the one destructive button.
struct MergeConfirmView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            if let proof = store.mergeProof {
                content(proof.source)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("no hay nada que fusionar.").font(.kura.news(28)).foregroundStyle(KColor.text)
                    Text("Vuelve a probar que la otra cuenta es tuya.")
                        .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, KSize.pushedTitleTop)
            }
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
    }

    private func content(_ source: MergeSource) -> some View {
        let here = store.me.handle.isEmpty ? "esta cuenta" : "@\(store.me.handle)"
        return ZStack(alignment: .bottom) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    Text("¿fusionar \(source.display) con esta cuenta?")
                        .font(.kura.news(32))
                        .foregroundStyle(KColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.horizontal, 8)

                    GroupedList {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(source.display).font(.kura.ui(17, .semibold)).foregroundStyle(KColor.text)
                            if source.handle != nil, let n = source.name, !n.isEmpty {
                                Text(n).font(.kura.ui(14)).foregroundStyle(KColor.text2)
                            }
                            Text(source.email).font(.kura.mono(12)).foregroundStyle(KColor.text2)
                                .lineLimit(1).truncationMode(.middle)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .accessibilityElement(children: .combine)
                        ListDivider()
                        counts(source.counts)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        point("arrow.down.to.line", "Todo pasa a \(here): títulos, colecciones, reseñas, seguidores y a quién sigues.")
                        point("xmark", "\(source.display) desaparece, y \(source.email) deja de servir para entrar.")
                        point("equal", "Si las dos tienen lo mismo, se queda lo de esta cuenta.")
                        // A private account folding into a public one: its collections stay private,
                        // but its per-title activity and reviews show under this public account.
                        if !source.isPublic && !store.profilePrivate {
                            point("eye", "\(source.display) era privada. Sus colecciones siguen privadas, pero sus reseñas, completados y obsesiones se verán en tu perfil público.")
                        }
                        point("arrow.uturn.backward", "No se puede deshacer.")
                    }
                    .padding(.horizontal, 8)
                }
                .padding(.top, KSize.pushedTitleTop)
                .padding(.horizontal, 16)
                .padding(.bottom, 170)
            }
            BottomCTA {
                VStack(spacing: 4) {
                    SolidButton(title: store.mergeBusy ? "Fusionando…" : "Fusionar cuentas", enabled: !store.mergeBusy) {
                        Task { await store.confirmMerge() }
                    }
                    Button { store.mergeProof = nil; store.pop() } label: {
                        Text("Cancelar")
                            .font(.kura.ui(16, .medium))
                            .foregroundStyle(KColor.text)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(store.mergeBusy)
                }
            }
        }
    }

    private func counts(_ c: MergeSource.Counts) -> some View {
        let items: [(Int, String)] = [
            (c.titles, c.titles == 1 ? "título" : "títulos"),
            (c.collections, c.collections == 1 ? "colección" : "colecciones"),
            (c.reviews, c.reviews == 1 ? "reseña" : "reseñas"),
            (c.followers, c.followers == 1 ? "seguidor" : "seguidores"),
            (c.following, "siguiendo")
        ]
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: 3), alignment: .leading, spacing: 14) {
            ForEach(items, id: \.1) { n, label in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(n)").font(.kura.news(24)).foregroundStyle(KColor.text)
                    Text(label).monoLabel()
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(16)
    }

    private func point(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(KColor.text2)
                .frame(width: 18)
                .accessibilityHidden(true)
            Text(text)
                .font(.kura.ui(15)).foregroundStyle(KColor.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - ¿te avisamos? (before iOS's permission prompt)

/// Kura's own ask, once per install, after the tabs come up: what the notices are, then iOS's
/// prompt only on "Activar avisos". "Ahora no" leaves iOS unasked, so Ajustes can offer it later.
struct NotificationsAskSheet: View {
    @Environment(AppStore.self) private var store
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("¿te avisamos?")
                .font(.kura.news(26))
                .foregroundStyle(KColor.text)
                .accessibilityAddTraits(.isHeader)
                .padding(.horizontal, 8)
            VStack(alignment: .leading, spacing: 12) {
                row(.users, "Cuando alguien empiece a seguirte.")
                row(.clock, "Cuando llegue a cines o a streaming lo que guardaste en no puedo esperar.")
            }
            .padding(.horizontal, 8)
            .padding(.top, 10)
            Text("Nada más. Lo cambias cuando quieras en Ajustes.")
                .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)
                .padding(.top, 12).padding(.bottom, 16)
            SolidButton(title: busy ? "Un momento…" : "Activar avisos", enabled: !busy) { enable() }
            Button { store.dismissSheet() } label: {
                Text("Ahora no")
                    .font(.kura.ui(16, .medium))
                    .foregroundStyle(KColor.text)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(busy)
        }
        .padding(.horizontal, 16)
    }

    private func row(_ glyph: Glyph, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            GlyphView(glyph: glyph, size: 16).frame(width: 20).padding(.top, 2)
            Text(text).font(.kura.ui(15)).foregroundStyle(KColor.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private func enable() {
        guard !busy else { return }
        busy = true
        store.sheetLocked = true
        Task {
            await store.enableNotifications()
            busy = false
            store.sheetLocked = false
            store.dismissSheet()
        }
    }
}
