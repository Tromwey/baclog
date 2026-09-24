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
    var title = "esta colección ya no existe."
    var note = "Se borró o dejó de estar disponible."
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
