import SwiftUI

// MARK: - 30a Ajustes

struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var showPrivacyNotice = false

    /// The integral privacy notice (public, no session; text in the web's `(marketing)/privacidad`).
    /// Same URL App Store Connect carries as the Privacy Policy URL, so it never points at Debug's localhost.
    static let privacyNoticeURL = URL(string: "https://baclog.app/privacidad")!

    var body: some View {
        @Bindable var store = store
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    Text("ajustes").font(.kura.screenTitle).foregroundStyle(KColor.text).padding(.horizontal, 8)
                        .accessibilityAddTraits(.isHeader)

                    GroupedList {
                        Button { store.push(.editProfile) } label: {
                            HStack(spacing: 14) {
                                Seal(person: store.me, size: 52)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(store.me.name).font(.kura.ui(17, .semibold)).foregroundStyle(KColor.text)
                                    Text("@\(store.me.handle)").font(.kura.mono(12)).foregroundStyle(KColor.text2)
                                }
                                Spacer()
                                HStack(spacing: 6) {
                                    Text("Editar perfil").font(.kura.ui(15))
                                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundStyle(KColor.text2)
                            }
                            .padding(.leading, 16).padding(.trailing, 14)
                            .frame(minHeight: 76)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(SheetRowStyle())
                        ListDivider()
                        SettingsRow(title: "Sesiones activas", action: { store.push(.sessions) }) {
                            RowValue(text: store.deviceSessions.map { "\($0.count)" } ?? "")
                        }
                    }

                    section("inicio de sesión") { IdentityRows() }
                    if let e = store.loadError(.identities) {
                        RetryStrip(error: e) { Task { await store.loadIdentities() } }
                    }

                    section("privacidad") {
                        SettingsRow(title: "Perfil privado", note: "Nadie más ve tu perfil ni tus colecciones.") {
                            KuraSwitch(label: "Perfil privado", isOn: $store.profilePrivate)
                        }
                        ListDivider()
                        SettingsRow(title: "Quién ve lo que te obsesiona", action: { store.push(.settingsPrivacy) }) {
                            RowValue(text: store.profilePrivate ? "Solo tú" : "Todos")
                        }
                        ListDivider()
                        SettingsRow(title: "Cuentas bloqueadas", action: { store.push(.blockedAccounts) }) {
                            RowValue(text: store.blockedAccounts.map { $0.isEmpty ? "" : "\($0.count)" } ?? "")
                        }
                        ListDivider()
                        SettingsRow(title: "Aviso de privacidad", action: { showPrivacyNotice = true }) {
                            Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(KColor.text2)
                                .accessibilityHidden(true)
                        }
                        .accessibilityHint("Se abre en la web")
                    }

                    section("apps") {
                        SettingsRow(title: "Abrir música en", action: { store.push(.musicApp) }) { RowValue(text: store.musicApp) }
                        ListDivider()
                        SettingsRow(title: "País para dónde ver") { RowValue(text: "México") }
                    }

                    section("notificaciones") {
                        // iOS has the last word on push: say so when it's "not yet" or "no".
                        switch store.notificationStatus {
                        case .undetermined:
                            SettingsRow(title: "Activar avisos", note: "Kura todavía no tiene permiso para avisarte.",
                                        action: { Task { await store.enableNotifications() } }) {
                                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(KColor.text2)
                                    .accessibilityHidden(true)
                            }
                            ListDivider()
                        case .denied:
                            SettingsRow(title: "Avisos apagados en el iPhone",
                                        note: "Los seguidores y estrenos no te llegan. Actívalos en Ajustes del iPhone.",
                                        action: { NotificationPermission.openSystemSettings() }) {
                                Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(KColor.text2)
                                    .accessibilityHidden(true)
                            }
                            .accessibilityHint("Abre los ajustes del iPhone")
                            ListDivider()
                        case .allowed:
                            EmptyView()
                        }
                        // Server-owned (`PATCH /me { notifyFollowers }`): the server sends the push.
                        SettingsRow(title: "Nuevos seguidores", note: "Cuando alguien empieza a seguirte.") {
                            KuraSwitch(label: "Nuevos seguidores", isOn: $store.notifyFollowers)
                        }
                        ListDivider()
                        SettingsRow(title: "Estrenos de no puedo esperar", note: "Cuando llega a cines o a streaming.") {
                            KuraSwitch(label: "Estrenos de no puedo esperar", isOn: $store.notifyReleases)
                        }
                        ListDivider()
                        // Server-owned (`PATCH /me { notifyRecap }`), like the releases switch: off = no monthly email.
                        SettingsRow(title: "Correo del recap mensual", note: "Una vez al mes, con lo que viste.") {
                            KuraSwitch(label: "Correo del recap mensual", isOn: $store.notifyRecap)
                        }
                    }

                    #if DEBUG
                    section("desarrollo") {
                        SettingsRow(title: "Simular sin conexión", note: "Muestra la franja de 35c en tus colecciones.") {
                            KuraSwitch(label: "Simular sin conexión", isOn: $store.offline)
                        }
                    }
                    #endif

                    VStack(spacing: 4) {
                        // `POST auth/logout` revokes every bearer of the account (server-wide, not per device).
                        // Awaits the POST before leaving (see `AppStore.signOut`): a spinner meanwhile.
                        Button { store.signOut() } label: {
                            VStack(spacing: 2) {
                                if store.signingOut {
                                    ProgressView().tint(KColor.text)
                                } else {
                                    Text("Cerrar sesión").font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                                    Text("En todos tus dispositivos.").font(.kura.ui(13)).foregroundStyle(KColor.text2)
                                }
                            }
                            .frame(minHeight: 52)
                            .contentShape(Rectangle())
                        }
                        .disabled(store.signingOut)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Cerrar sesión en todos tus dispositivos")
                        Button("Borrar cuenta") { store.present(.deleteAccount) }
                            .font(.kura.ui(15)).foregroundStyle(KColor.text2).frame(minHeight: 44)
                        HStack(spacing: 6) {
                            Text("蔵").font(.custom(KFontName.kanji, fixedSize: 11))
                            Text("kura 1.0").font(.kura.mono(11)).tracking(0.88)
                        }
                        .foregroundStyle(KColor.text3)
                        .padding(.top, 8)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
                }
                .padding(.top, 124)
                .padding(.horizontal, 16)
                .padding(.bottom, 56)
            }
            .onAppear {
                #if DEBUG
                if let anchor = store.debugSettingsAnchor {
                    store.debugSettingsAnchor = nil
                    DispatchQueue.main.async { proxy.scrollTo(anchor, anchor: .top) }
                }
                #endif
            }
            }
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
        .task { await store.loadIdentities() }
        .task { await store.refreshNotificationStatus() }
        .fullScreenCover(isPresented: $showPrivacyNotice) {
            SafariView(url: Self.privacyNoticeURL).ignoresSafeArea()
        }
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).monoLabel().padding(.horizontal, 8)
            GroupedList { content() }
        }
        .id(title)
    }
}

// MARK: - Ajustes · Sesiones activas

/// Every device signed in to the account (`GET /me/sessions`). This one is marked and can't be
/// closed here (that's Cerrar sesión in Ajustes, which is "everywhere"); the others each have
/// their own Cerrar sesión, confirmed in a sheet.
struct SessionsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("sesiones activas").font(.kura.screenTitle).foregroundStyle(KColor.text)
                            .accessibilityAddTraits(.isHeader)
                        Text("Los dispositivos donde entraste a kura. Si no reconoces uno, cierra su sesión.")
                            .font(.kura.ui(14)).foregroundStyle(KColor.text2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 8)
                    content
                }
                .padding(.top, 124)
                .padding(.horizontal, 16)
                .padding(.bottom, 56)
            }
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
        .task { await store.loadSessions() }
    }

    @ViewBuilder private var content: some View {
        if let list = store.deviceSessions {
            if let e = store.loadError(.sessions) {
                RetryStrip(error: e) { Task { await store.loadSessions() } }
            }
            GroupedList {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, s in
                    if i > 0 { ListDivider(inset: 72) }
                    row(s)
                }
            }
            .animation(KMotion.fade, value: list)
            if list.count <= 1 {
                Text("Solo este iPhone tiene tu sesión abierta.")
                    .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                    .padding(.horizontal, 8)
            }
            Text("Para salir de todos a la vez, usa Cerrar sesión en Ajustes.")
                .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)
        } else if let e = store.loadError(.sessions) {
            LoadErrorBlock(error: e, titleSize: 24) { Task { await store.loadSessions() } }
                .padding(.horizontal, 8)
        } else {
            GroupedList {
                ForEach(0..<2, id: \.self) { i in
                    if i > 0 { ListDivider(inset: 72) }
                    HStack(spacing: 14) {
                        Skeleton(radius: 999).frame(width: 44, height: 44)
                        VStack(alignment: .leading, spacing: 8) {
                            Skeleton(radius: 6).frame(width: 110, height: 14)
                            Skeleton(radius: 5).frame(width: 150, height: 10)
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 72)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Cargando")
        }
    }

    private func row(_ s: DeviceSession) -> some View {
        HStack(spacing: 14) {
            Image(systemName: Self.icon(for: s))
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(KColor.text)
                .frame(width: 44, height: 44)
                .background(KColor.s2, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(s.title).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text).lineLimit(1)
                Text(Self.detail(s, now: KuraRuntime.usesMock ? store.now : Date())).font(.kura.mono(11)).foregroundStyle(KColor.text2)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 8)
            if !s.current {
                GlassButton(title: "Cerrar sesión", height: 36, fontSize: 14) {
                    store.present(.revokeSession(s))
                }
                .kHitArea(vertical: 4)
                .accessibilityLabel("Cerrar sesión en \(s.title)")
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 72)
    }

    static func icon(for s: DeviceSession) -> String {
        let n = s.deviceName.lowercased()
        if n.contains("ipad") { return "ipad" }
        if s.platform.lowercased() == "web" { return "laptopcomputer" }
        return "iphone"
    }

    /// "este iPhone · kura 1.0.0" / "activa hace 2 d · kura 1.0.0".
    static func detail(_ s: DeviceSession, now: Date) -> String {
        var parts: [String] = []
        if s.current {
            parts.append("este iPhone")
        } else if let seen = s.lastSeenAt {
            parts.append("activa " + ago(seen, now: now))
        }
        if let v = s.appVersion, !v.isEmpty { parts.append("kura \(v)") }
        return parts.joined(separator: " · ")
    }

    static func ago(_ d: Date, now: Date) -> String {
        let h = max(0, now.timeIntervalSince(d) / 3600)
        if h < 1 { return "hace \(max(1, Int(h * 60))) min" }
        if h < 24 { return "hace \(Int(h)) h" }
        if h < 7 * 24 { return "hace \(Int(h / 24)) d" }
        if h < 35 * 24 { return "hace \(Int(h / (7 * 24))) sem" }
        let months = max(1, Int(h / (30 * 24)))
        return months == 1 ? "hace 1 mes" : "hace \(months) meses"
    }
}

/// "¿cerrar sesión en iPad?" — the one confirmation before `DELETE /me/sessions/{id}`.
struct RevokeSessionSheet: View {
    @Environment(AppStore.self) private var store
    let session: DeviceSession
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("¿cerrar sesión en \(session.title)?")
                .font(.kura.news(26))
                .foregroundStyle(KColor.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .padding(.horizontal, 8)
            Text("Ese dispositivo vuelve a la entrada la próxima vez que abra kura. Tus colecciones no cambian.")
                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)
                .padding(.top, 4).padding(.bottom, 16)
            SolidButton(title: busy ? "Cerrando…" : "Cerrar sesión", enabled: !busy) { confirm() }
            Button { store.dismissSheet() } label: {
                Text("Cancelar")
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
            await store.revokeSession(session)
            busy = false
            store.sheetLocked = false
            store.dismissSheet()
        }
    }
}

// MARK: - K1c Ajustes · privacidad

struct PrivacySettingsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        @Bindable var store = store
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 6) {
                Text("privacidad").font(.kura.screenTitle).foregroundStyle(KColor.text)
                    .padding(.horizontal, 20).padding(.bottom, 18)
                    .accessibilityAddTraits(.isHeader)
                row("Perfil privado", note: "Nadie más ve tu perfil ni tus colecciones.") {
                    KuraSwitch(label: "Perfil privado", isOn: $store.profilePrivate)
                }
                Button {
                    let all = Privacy.options
                    let i = all.firstIndex(of: store.defaultPrivacy) ?? 0
                    store.defaultPrivacy = all[(i + 1) % all.count]
                    KHaptic.select()
                } label: {
                    row("Colecciones nuevas", note: "Cada colección se puede cambiar en sus opciones.") {
                        RowValue(text: store.defaultPrivacy.label)
                    }
                }
                .buttonStyle(SheetRowStyle())
                row("Mostrar En común contigo", note: "En tu perfil, a quien te visita.") {
                    KuraSwitch(label: "Mostrar En común contigo", isOn: $store.showCommon)
                }
                Button { store.push(.profileAsStranger) } label: {
                    row("Ver tu perfil como alguien que no te sigue", note: nil) {
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(KColor.text2)
                    }
                }
                .buttonStyle(SheetRowStyle())
                Spacer()
            }
            .padding(.top, 130)
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
    }

    private func row<T: View>(_ title: String, note: String?, @ViewBuilder trailing: () -> T) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                if let note { Text(note).font(.kura.ui(13)).foregroundStyle(KColor.text2) }
            }
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
    }
}

// MARK: - 30b Abrir música en

struct MusicAppView: View {
    @Environment(AppStore.self) private var store
    private let apps = AppStore.services.map(\.name)

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 28) {
                Text("abrir música en").font(.kura.screenTitle).foregroundStyle(KColor.text).padding(.horizontal, 8)
                    .accessibilityAddTraits(.isHeader)
                GroupedList {
                    ForEach(Array(apps.enumerated()), id: \.offset) { i, app in
                        if i > 0 { ListDivider() }
                        Button {
                            store.musicApp = app
                            KHaptic.select()
                        } label: {
                            HStack {
                                Text(app).font(.kura.ui(16)).foregroundStyle(KColor.text)
                                Spacer()
                                Image(systemName: "checkmark").font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(KColor.text)
                                    .opacity(store.musicApp == app ? 1 : 0)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 52)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(SheetRowStyle())
                        .accessibilityAddTraits(store.musicApp == app ? .isSelected : [])
                    }
                }
                Text("Abrir en, en cada álbum, usa esta app. Si no la tienes instalada, abre la web.")
                    .font(.kura.ui(13)).foregroundStyle(KColor.text2).padding(.horizontal, 8)
                Spacer()
            }
            .padding(.top, 124)
            .padding(.horizontal, 16)
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

// MARK: - C3 Borrar cuenta (writing your @)

struct DeleteAccountSheet: View {
    @Environment(AppStore.self) private var store
    @State private var typed = ""
    @FocusState private var focused: Bool

    var body: some View {
        let ok = typed.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: "").lowercased() == store.me.handle
        VStack(alignment: .leading, spacing: 6) {
            Text("¿borrar tu cuenta?").font(.kura.news(26)).foregroundStyle(KColor.text)
            Text("Se borran tus colecciones, reseñas y seguidores. No se puede deshacer.")
                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4).padding(.bottom, 12)
            Text("escribe \(store.me.handle)").monoLabel().padding(.horizontal, 4).padding(.bottom, 4)
            GlassField(placeholder: store.me.handle, text: $typed, focus: $focused)
            VStack(spacing: 8) {
                SolidButton(title: "Borrar cuenta", enabled: ok) {
                    store.dismissSheet()
                    store.deleteAccount()
                }
                GlassButton(title: "Cancelar", height: 52, fontSize: 16, fullWidth: true) { store.dismissSheet() }
            }
            .padding(.top, 10)
        }
        .padding(.horizontal, 20)
        .onAppear { focused = true }
    }
}
