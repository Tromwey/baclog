import SwiftUI

/// "Abrir y cerrar un título" (colecciones-transiciones · 4): tapping a cell of the `Masonry` (or a
/// row of the list) under this host opens the ficha IN PLACE — the cover leaves its cell and grows
/// into the ficha's (radius 14 → 18 as it looks), the ficha's tint comes in over the first 60 %,
/// its text rises from 40 %, and what's behind recedes 4 %. Volver runs the same path backwards
/// (0.3, from wherever it is); the left edge drives it with the finger.
///
/// Hosted by Tus colecciones (root of its tab) and by a collection opened from the profile. A
/// pushed collection keeps the push (and the system's cover zoom on 18+): a hero over a pushed
/// screen would fight the system's swipe-back.
struct TitleHeroHost<Base: View>: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var hero = HeroController(kind: .title)
    var rootTab: Tab? = nil
    @ViewBuilder let base: Base

    var body: some View {
        HeroHost(hero: hero, rootTab: rootTab) {
            base
        } page: { id in
            TitleDetailView(titleID: id)
        } flyer: { id in
            if let t = store.title(id) { HeroCoverFlyer(title: t) }
        }
        #if DEBUG
        .task {
            // `-kuraHeroTitle <id>`: open that title in place once the page is up (captures).
            guard let id = UserDefaults.standard.string(forKey: "kuraHeroTitle") else { return }
            try? await Task.sleep(for: .milliseconds(1200))
            if !hero.isOpen, hero.sources[id] != nil { hero.open(id, reduce: reduce) }
        }
        #endif
    }
}
