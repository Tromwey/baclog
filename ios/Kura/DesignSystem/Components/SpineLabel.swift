import SwiftUI

/// Vertical spine label: mono 13, tracking .14em, reads bottom → top.
struct SpineLabel: View {
    let text: String
    let height: CGFloat
    var color: Color = KColor.text
    var size: CGFloat = 13

    var body: some View {
        Text(text)
            .font(.kura.mono(size))
            .tracking(size * 0.14)
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.78)
            .truncationMode(.tail)
            .frame(width: max(height - 16, 20))
            .fixedSize(horizontal: false, vertical: true)
            .rotationEffect(.degrees(-90))
            .frame(width: KSize.spine, height: height)
            .background(KColor.spine)
            .accessibilityHidden(true)
    }
}
