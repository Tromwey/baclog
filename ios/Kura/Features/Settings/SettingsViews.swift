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
                        SettingsRow(title: "Correo") { RowValue(text: store.account?.email ?? (KuraRuntime.usesMock ? "mariel@correo.com" : "")) }
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
                        SettingsRow(title: "Nuevos seguidores") { KuraSwitch(label: "Nuevos seguidores", isOn: $store.notifyFollowers) }
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
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
        .fullScreenCover(isPresented: $showPrivacyNotice) {
            SafariView(url: Self.privacyNoticeURL).ignoresSafeArea()
        }
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).monoLabel().padding(.horizontal, 8)
            GroupedList { content() }
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
