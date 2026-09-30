package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel

/** Newsreader 24 section header ("dónde ver") with an optional mono trailing label (iOS `SectionTitle`). */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, trailing: String? = null, size: Float = 24f) {
    Row(
        modifier.fillMaxWidth().semantics(mergeDescendants = true) { heading() },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        BasicText(text, modifier = Modifier.weight(1f).alignByBaseline(), style = KuraType.news(size))
        if (trailing != null) MonoLabel(trailing, modifier = Modifier.alignByBaseline())
    }
}
