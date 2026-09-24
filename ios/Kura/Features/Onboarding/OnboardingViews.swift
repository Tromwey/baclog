import SwiftUI

// MARK: - 12 Splash

struct SplashView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack {
            KColor.bg.ignoresSafeArea()
            Wordmark(size: 76)
        }
        .task {
            guard !store.holdSplash else { return }
            try? await Task.sleep(for: .milliseconds(1100))
            // A stored token skips the entrance (refreshing it when it's about to expire).
            await store.finishSplash()
        }
    }
}

// MARK: - Flow container

struct OnboardingFlow: View {
    @Environment(AppStore.self) private var store
    @Namespace private var ns

    var body: some View {
        ZStack {
            KColor.bg.ignoresSafeArea()
            switch store.onboardingStep {
            case .welcome: WelcomeView().transition(.opacity)
            case .signup: SignUpView().transition(.opacity)
            case .username: UsernameView().transition(.opacity)
            case .pick: PickThreeView(ns: ns).transition(.opacity)
            case .people: YourPeopleView(ns: ns).transition(.opacity)
            case .login, .email: LoginView().transition(.opacity)
            case .code: CodeView().transition(.opacity)
            case .underage: UnderageView().transition(.opacity)
            }
        }
        .animation(KMotion.spring, value: store.onboardingStep)
    }
}

/// "1 de 2" style step marker.
private struct StepLabel: View {
    let text: String
    var body: some View { Text(text).monoLabel() }
}

/// Volver + step marker at 64/24.
private struct OnboardingChrome: View {
    let step: String?
    let back: () -> Void
    var body: some View {
        HStack {
            IconChip44(systemName: "chevron.left", iconSize: 17, label: "Volver", action: back)
            Spacer()
            if let step { StepLabel(text: step) }
        }
        .padding(.horizontal, 24)
        .padding(.top, KSize.chromeTop)
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

/// Inline error under a field, in the Kura voice.
private struct InlineError: View {
    let text: String?
    var body: some View {
        if let text {
            Text(text)
                .font(.kura.ui(13))
                .foregroundStyle(KColor.text)
                .fixedSize(horizontal: false, vertical: true)
                .transition(.opacity)
        }
    }
}

// MARK: - 13 Onboarding (bienvenida)

struct WelcomeView: View {
    @Environment(AppStore.self) private var store

    private var fan: [(Title, Double, CGFloat, Double)] {
        // (title, rotation, x offset as fraction of fan height, z)
        [("chihiro", -9.0, -0.62, 0.0), ("odyssey", 9.0, 0.62, 1.0), ("ma", 0.0, 0.0, 2.0)]
            .compactMap { id, rot, dx, z in store.decor(id).map { ($0, rot, dx, z) } }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            HStack(alignment: .center, spacing: 14) {
                Text("蔵")
                    .font(.custom(KFontName.kanji, fixedSize: 44))
                    .foregroundStyle(KColor.text)
                    .accessibilityHidden(true)
                Wordmark(size: 30)
            }

            GeometryReader { geo in
                let h = min(geo.size.height * 0.72, geo.size.width * 0.58)
                ZStack {
                    ForEach(fan, id: \.0.id) { item in
                        CoverView(title: item.0, height: h)
                            .rotationEffect(.degrees(item.1))
                            .offset(x: item.2 * h)
                            .zIndex(item.3)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("la bodega donde guardas lo que más vale.")
                    .font(.kura.news(36))
                    .lineSpacing(-4)
                    .foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Películas, series y música. Empieza por lo que no puedes dejar de recomendar.")
                    .font(.kura.ui(15))
                    .lineSpacing(4)
                    .foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            GlassButton(title: "Empezar", height: 52, fontSize: 16, fullWidth: true) {
                store.onboardingStep = .signup
            }
        }
        .padding(.top, 72)
        .padding(.horizontal, 28)
        .padding(.bottom, 48)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
    }
}

// MARK: - O1a Crear cuenta

struct SignUpView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack(alignment: .top) {
            OnboardingChrome(step: "1 de 2") { store.onboardingStep = .welcome }

            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    if let t = store.decor("chihiro") {
                        CoverView(title: t, width: 44, height: 66, radius: KRadius.coverS)
                    }
                    (Text("Para guardar ").font(.kura.ui(14)).foregroundColor(KColor.text2)
                     + Text("El viaje de Chihiro").font(.kura.newsItalic(16)).foregroundColor(KColor.text)
                     + Text(" en una colección.").font(.kura.ui(14)).foregroundColor(KColor.text2))
                        .lineSpacing(3)
                }
                Text("crea tu cuenta.")
                    .font(.kura.news(40))
                    .foregroundStyle(KColor.text)
                    .padding(.top, 14)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.horizontal, 24)
            .padding(.top, 170)
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 10) {
                Spacer()
                // Apple / Google arrive in a later phase (API.md §2.2); today only the code by email.
                AuthButton(kind: .apple) { store.showToast(ToastModel(text: "Apple llega después. Por ahora, con correo.", kind: .info)) }
                AuthButton(kind: .google) { store.showToast(ToastModel(text: "Google llega después. Por ahora, con correo.", kind: .info)) }
                AuthButton(kind: .email) { store.onboardingStep = .login }
                Button {
                    store.onboardingStep = .login
                } label: {
                    (Text("¿Ya tienes cuenta? ").foregroundColor(KColor.text2)
                     + Text("Entrar").fontWeight(.semibold).foregroundColor(KColor.text))
                        .font(.kura.ui(15))
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 34)
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

struct AuthButton: View {
    enum Kind { case apple, google, email }
    let kind: Kind
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: kind == .apple ? 8 : 10) {
                switch kind {
                case .apple:
                    Image(systemName: "apple.logo").font(.system(size: 17, weight: .medium))
                    Text("Continuar con Apple")
                case .google:
                    Text("G").font(.system(size: 15, weight: .bold)).frame(width: 18, height: 18)
                    Text("Continuar con Google")
                case .email:
                    Text("Continuar con correo")
                }
            }
            .font(.kura.ui(16, .semibold))
            .foregroundStyle(kind == .apple ? KColor.bg : KColor.text)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(kind == .apple ? KColor.text : KColor.glassBg, in: Capsule())
            .contentShape(Capsule())
        }
        .kPress()
    }
}

// MARK: - O1b Elige tu usuario

struct UsernameView: View {
    @Environment(AppStore.self) private var store
    @State private var handle = KuraRuntime.usesMock ? "mariel.ok" : ""
    @State private var name = KuraRuntime.usesMock ? "mariel ortega" : ""
    @State private var year = KuraRuntime.usesMock ? "1998" : ""
    @State private var status: UsernameStatus?
    @State private var seeded = false

    private var clean: String {
        handle.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" }
    }
    private var birthYear: Int? {
        guard let y = Int(year.filter(\.isNumber)), y >= 1900, y <= 2100 else { return nil }
        return y
    }
    private var needsYear: Bool { !(store.account?.onboarded ?? false) }
    private var canSubmit: Bool {
        clean.count >= 3 && status == .free && !name.trimmingCharacters(in: .whitespaces).isEmpty
            && (!needsYear || birthYear != nil) && !store.authBusy
    }

    var body: some View {
        ZStack(alignment: .top) {
            // Volver on O1b = logout (API.md §5): the token was already issued.
            OnboardingChrome(step: "2 de 2") {
                if store.account == nil { store.onboardingStep = .signup } else { store.signOut() }
            }

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    Text("elige tu usuario.")
                        .font(.kura.news(40))
                        .foregroundStyle(KColor.text)
                        .accessibilityAddTraits(.isHeader)
                    Text("Es tu link: kura.app/@\(clean.isEmpty ? "usuario" : clean)")
                        .font(.kura.ui(14))
                        .foregroundStyle(KColor.text2)
                    VStack(spacing: 10) {
                        GlassField(placeholder: "@usuario", text: Binding(
                            get: { "@" + handle },
                            set: { handle = String($0.drop(while: { $0 == "@" })) }
                        ), trailing: AnyView(availability))
                        GlassField(placeholder: "tu nombre", text: $name)
                        if needsYear {
                            GlassField(placeholder: "año de nacimiento", text: $year)
                                .keyboardType(.numberPad)
                        }
                    }
                    .padding(.top, 14)
                    Text(needsYear ? "Tu nombre se puede cambiar después en Editar perfil. El año solo confirma que tienes 13 o más; no se guarda."
                                   : "Tu nombre se puede cambiar después en Editar perfil.")
                        .font(.kura.ui(13))
                        .foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                    InlineError(text: store.authError)
                }
                .padding(.horizontal, 24)
                .padding(.top, 170)
                .padding(.bottom, 120)
            }
            .scrollDismissesKeyboard(.interactively)

            VStack {
                Spacer()
                SolidButton(title: store.authBusy ? "Un momento…" : "Crear cuenta", enabled: canSubmit) {
                    Task { await store.submitUsername(handle: clean, name: name, birthYear: birthYear) }
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 10)
        }
        .ignoresSafeArea(.container, edges: .top)
        .onAppear {
            guard !seeded else { return }
            seeded = true
            if let h = store.account?.handle, !h.isEmpty { handle = h }
            if let n = store.account?.name, !n.isEmpty { name = n }
        }
        .task(id: clean) {
            status = nil
            guard clean.count >= 3 else { return }
            try? await Task.sleep(for: .milliseconds(KuraRuntime.usesMock ? 0 : 350))
            guard !Task.isCancelled else { return }
            let s = await store.checkUsername(clean)
            if !Task.isCancelled { status = s ?? .free }
        }
    }

    @ViewBuilder private var availability: some View {
        if clean.count >= 3, let status {
            HStack(spacing: 6) {
                if status == .free { GlyphView(glyph: .check, size: 13) }
                Text(status == .free ? "libre" : (status == .taken ? "ocupado" : "no vale"))
                    .monoLabel(11, color: status == .free ? KColor.completed : KColor.text2)
            }
        }
    }
}

// MARK: - 32a Elige 3

struct PickThreeView: View {
    @Environment(AppStore.self) private var store
    let ns: Namespace.ID
    @State private var query = ""

    private var grid: [Title] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return store.onboardingGrid }
        return store.searchResults.map(\.title)
    }

    private var picks: [String] { store.onboardingPicks }

    var body: some View {
        ZStack(alignment: .bottom) {
            background.ignoresSafeArea()
                .animation(.easeInOut(duration: 0.4), value: picks)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        StepLabel(text: "1 de 2")
                        Spacer()
                        Button("Volver") {
                            if store.account?.onboarded == true { store.finishOnboarding() } else { store.onboardingStep = .username }
                        }
                        .font(.kura.ui(14, .semibold))
                        .foregroundStyle(KColor.text2)
                    }
                    Text("elige 3 que te obsesionan.")
                        .font(.kura.news(32))
                        .foregroundStyle(KColor.text)
                        .accessibilityAddTraits(.isHeader)
                    Text("Las tres tiñen tu perfil. Con las tres encontramos a tu gente.")
                        .font(.kura.ui(15))
                        .lineSpacing(4)
                        .foregroundStyle(KColor.text2)
                    SearchPill(placeholder: "Buscar películas, series o música", text: $query)
                    if grid.isEmpty {
                        if store.searchLoading || (query.isEmpty && store.onboardingGrid.isEmpty) {
                            pickSkeleton.padding(.top, 4)
                        } else if !query.isEmpty {
                            Text("nada con “\(query)”.").font(.kura.news(24)).foregroundStyle(KColor.text).padding(.top, 12)
                        }
                    } else {
                        masonry.padding(.top, 4)
                    }
                    InlineError(text: store.authError)
                }
                .padding(.top, 72)
                .padding(.horizontal, 20)
                .padding(.bottom, 150)
            }
            .scrollDismissesKeyboard(.interactively)

            BottomCTA {
                SolidButton(title: store.authBusy ? "Un momento…" : ctaTitle, enabled: picks.count == 3 && !store.authBusy) {
                    Task { await store.submitPicks() }
                }
            }
        }
        .ignoresSafeArea(.container, edges: .top)
        .task { await store.loadOnboardingGrid() }
        .task(id: query) {
            let q = query.trimmingCharacters(in: .whitespaces)
            guard !q.isEmpty else { store.clearSearch(); return }
            try? await Task.sleep(for: .milliseconds(KuraRuntime.usesMock ? 0 : 350))
            guard !Task.isCancelled else { return }
            await store.runSearch(q)
        }
    }

    private var ctaTitle: String {
        switch picks.count {
        case 3: return "Continuar"
        case 2: return "Elige 1 más"
        case 1: return "Elige 2 más"
        default: return "Elige 3"
        }
    }

    private var background: some View {
        let palettes = picks.compactMap { store.title($0)?.palette }
        return Group {
            if palettes.isEmpty { KColor.bg } else { Tint.header3(palettes) }
        }
    }

    private var pickSkeleton: some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(0..<3, id: \.self) { col in
                VStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { row in
                        Skeleton(radius: KRadius.coverS).aspectRatio((col + row) % 3 == 1 ? 1 : 2.0 / 3.0, contentMode: .fit)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .top)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }

    private var masonry: some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(0..<3, id: \.self) { col in
                VStack(spacing: 12) {
                    ForEach(Array(grid.enumerated()).filter { $0.offset % 3 == col }, id: \.element.id) { _, t in
                        pickTile(t)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .top)
            }
        }
    }

    private func pickTile(_ t: Title) -> some View {
        let idx = picks.firstIndex(of: t.id)
        let full = picks.count == 3
        return Button {
            toggle(t.id)
        } label: {
            CoverView(title: t, radius: KRadius.coverS,
                      badge: idx.map { .number($0 + 1) } ?? .none, fluid: true)
                .matchedGeometryEffect(id: "pick-\(t.id)", in: ns, isSource: true)
        }
        .buttonStyle(.plain)
        .opacity(full && idx == nil ? 0.38 : 1)
        .scaleEffect(idx != nil ? 0.95 : 1)
        .animation(.spring(response: 0.26, dampingFraction: 0.6), value: idx)
        .animation(.easeInOut(duration: 0.2), value: full)
        .accessibilityLabel(t.name)
        .accessibilityAddTraits(idx != nil ? .isSelected : [])
    }

    private func toggle(_ id: String) {
        if let i = store.onboardingPicks.firstIndex(of: id) {
            store.onboardingPicks.remove(at: i)
        } else if store.onboardingPicks.count < 3 {
            store.onboardingPicks.append(id)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }
}

/// Bottom CTA over a fade to bg (padding 18 20 34).
struct BottomCTA<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 10)
            .background(
                LinearGradient(stops: [.init(color: KColor.bg.opacity(0), location: 0),
                                       .init(color: KColor.bg.opacity(0.92), location: 0.4)],
                               startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            )
    }
}

/// Search field, capsule, 48 high.
struct SearchPill: View {
    let placeholder: String
    @Binding var text: String
    var fill: Color = KColor.glassBg
    var focus: FocusState<Bool>.Binding? = nil

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .medium)).foregroundStyle(KColor.text2)
            field
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 16)).foregroundStyle(KColor.text3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Borrar búsqueda")
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
        .background(fill, in: Capsule())
    }

    @ViewBuilder private var field: some View {
        let tf = TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(KColor.text2))
            .font(.kura.ui(16))
            .foregroundStyle(KColor.text)
            .tint(KColor.accent)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .submitLabel(.search)
        if let focus { tf.focused(focus) } else { tf }
    }
}

// MARK: - 32b Tu gente

struct YourPeopleView: View {
    @Environment(AppStore.self) private var store
    let ns: Namespace.ID

    var body: some View {
        ZStack(alignment: .bottom) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    hero
                    VStack(spacing: 0) {
                        if store.onboardingPeople.isEmpty {
                            Text("Todavía no hay gente con tus obsesiones. Tu feed se llena cuando la encuentres en Descubrir.")
                                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.vertical, 24)
                        }
                        ForEach(store.onboardingPeople) { p in
                            personRow(store.person(p.id) ?? p, why: p.why ?? "")
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 150)
                }
            }
            .ignoresSafeArea(.container, edges: .top)

            BottomCTA {
                SolidButton(title: "Entrar a kura") {
                    store.finishOnboarding()
                }
            }
        }
        .task { await store.loadOnboardingPeople() }
    }

    private var hero: some View {
        let picked = store.onboardingPicks.compactMap { store.title($0) }
        return VStack(alignment: .leading, spacing: 16) {
            HStack {
                StepLabel(text: "2 de 2")
                Spacer()
                Button("Volver") { store.onboardingStep = .pick }
                    .font(.kura.ui(14, .semibold))
                    .foregroundStyle(KColor.text2)
            }
            HStack(alignment: .bottom, spacing: 10) {
                ForEach(picked) { t in
                    CoverView(title: t, height: 120)
                        .matchedGeometryEffect(id: "pick-\(t.id)", in: ns, isSource: true)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
            .padding(.bottom, 4)
            Text("gente con tus obsesiones.")
                .font(.kura.news(32))
                .foregroundStyle(KColor.text)
                .accessibilityAddTraits(.isHeader)
            Text("Síguela para llenar tu feed. Puedes hacerlo después.")
                .font(.kura.ui(15))
                .foregroundStyle(KColor.text2)
        }
        .padding(.top, 72)
        .padding(.horizontal, 20)
        .padding(.bottom, 28)
        .background(Tint.header3(picked.map(\.palette)))
    }

    private func personRow(_ p: Person, why: String) -> some View {
        HStack(spacing: 14) {
            Seal(person: p, size: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text("@\(p.handle)").font(.kura.ui(16, .semibold)).foregroundStyle(KColor.text)
                if !why.isEmpty {
                    HStack(spacing: 6) {
                        GlyphView(glyph: .flame, size: 12)
                        Text(why).font(.kura.ui(13)).foregroundStyle(KColor.text2).lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 8)
            FollowToggle(following: store.isFollowing(p.id)) { store.toggleFollow(p.id) }
        }
        .frame(minHeight: 72)
    }
}

// MARK: - O1c Entrar (correo)

struct LoginView: View {
    @Environment(AppStore.self) private var store
    @State private var email = KuraRuntime.usesMock ? "mariel@correo.com" : ""
    @FocusState private var focused: Bool

    var body: some View {
        ZStack(alignment: .top) {
            OnboardingChrome(step: nil) { store.onboardingStep = .welcome }

            VStack(spacing: 12) {
                Text("entrar.")
                    .font(.kura.news(40))
                    .foregroundStyle(KColor.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 20)
                    .accessibilityAddTraits(.isHeader)
                AuthButton(kind: .apple) { store.showToast(ToastModel(text: "Apple llega después. Por ahora, con correo.", kind: .info)) }
                AuthButton(kind: .google) { store.showToast(ToastModel(text: "Google llega después. Por ahora, con correo.", kind: .info)) }
                Text("o con correo")
                    .monoLabel(11, color: KColor.text3)
                    .padding(.top, 14)
                    .padding(.bottom, 2)
                GlassField(placeholder: "tu correo", text: $email, focus: $focused)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .submitLabel(.send)
                    .onSubmit(send)
                GlassButton(title: store.authBusy ? "Enviando…" : "Enviarme un código", height: 52, fontSize: 16, fullWidth: true, action: send)
                    .disabled(store.authBusy)
                InlineError(text: store.authError)
                Text("Sin contraseña: te mandamos un código de seis dígitos.")
                    .font(.kura.ui(13))
                    .foregroundStyle(KColor.text2)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 24)
            .padding(.top, 170)
        }
        .ignoresSafeArea(.container, edges: .top)
        .onAppear { if !store.authEmail.isEmpty { email = store.authEmail } }
    }

    private func send() {
        guard !store.authBusy else { return }
        focused = false
        Task {
            if await store.requestCode(email: email) {
                store.onboardingStep = .code
            }
        }
    }
}

// MARK: - O1c · el código

struct CodeView: View {
    @Environment(AppStore.self) private var store
    @State private var code = ""
    @FocusState private var focused: Bool

    private var digits: String { String(code.filter(\.isNumber).prefix(6)) }

    var body: some View {
        ZStack(alignment: .top) {
            OnboardingChrome(step: nil) { store.authError = nil; store.onboardingStep = .login }

            VStack(spacing: 12) {
                Text("tu código.")
                    .font(.kura.news(40))
                    .foregroundStyle(KColor.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                (Text("Lo mandamos a ").foregroundColor(KColor.text2)
                 + Text(store.authEmail).foregroundColor(KColor.text))
                    .font(.kura.ui(15))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 20)
                GlassField(placeholder: "seis dígitos", text: $code, focus: $focused)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .onChange(of: code) { _, new in
                        let d = String(new.filter(\.isNumber).prefix(6))
                        if d != new { code = d }
                        if d.count == 6 { verify() }
                    }
                SolidButton(title: store.authBusy ? "Entrando…" : "Entrar", enabled: digits.count == 6 && !store.authBusy, action: verify)
                InlineError(text: store.authError)
                Button {
                    Task { _ = await store.requestCode(email: store.authEmail); code = "" }
                } label: {
                    Text("Mandar otro código")
                        .font(.kura.ui(15, .medium))
                        .foregroundStyle(KColor.text2)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .disabled(store.authBusy)
            }
            .padding(.horizontal, 24)
            .padding(.top, 170)
        }
        .ignoresSafeArea(.container, edges: .top)
        .onAppear { focused = true }
    }

    private func verify() {
        guard digits.count == 6, !store.authBusy else { return }
        focused = false
        Task { _ = await store.verifyCode(digits) }
    }
}

// MARK: - 13 años

struct UnderageView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Text("kura es para mayores de 13.")
                .font(.kura.news(36))
                .foregroundStyle(KColor.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text("No podemos abrirte una cuenta todavía. Guarda el link y vuelve cuando cumplas 13.")
                .font(.kura.ui(15))
                .lineSpacing(4)
                .foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
            GlassButton(title: "Entendido", height: 52, fontSize: 16, fullWidth: true) {
                store.signOut()
            }
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 48)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
