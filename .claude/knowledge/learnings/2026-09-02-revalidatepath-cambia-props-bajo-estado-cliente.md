---
id: 2026-09-02-revalidatepath-cambia-props-bajo-estado-cliente
domain: frontend
guardrail: none (regla: todo lo que un client component muestre "para esta visita" se fija con useState al montar, como `FeedList` hace con cards, cursor y sugerencia)
status: resolved
---

# Seguir desde la sugerencia del feed la cambiaba por OTRA persona con el pill en "Siguiendo"

## Síntoma
El founder tocó Seguir en la card "Quizá quieras seguir" (@jsalvador). La card desapareció y en su
lugar apareció la de @roblp — con el pill diciendo "Siguiendo", a quien no seguía.

## Causa raíz
`followUserAction` hace `revalidatePath("/feed")`. El router refresca el árbol RSC, `page.tsx`
vuelve a correr y `getFeedSuggestion` ya excluye al recién seguido, así que devuelve al siguiente
candidato. `FeedList` (client) pasaba esa prop nueva directo a `<SuggestCard>` en el MISMO hueco del
árbol, sin `key`, y React reconcilió: nuevo nombre y portadas, pero el `FollowButton` interno conservó
su `useState(following=true)`. Dos errores en uno: la card no debía cambiar, y aunque cambiara, el
estado del pill no debía heredarse.

## Prevención
- Lo que un client component decide mostrar "para esta visita" se fija al montar
  (`const [pinned] = useState(suggestion)`), igual que `FeedList` ya hacía con `initialCards` y el
  cursor — por eso las cards no saltaron y la sugerencia sí.
- Cualquier componente con estado propio que represente a UNA entidad (FollowButton, ReviewCard…)
  lleva `key={id}` en el padre, para que otra entidad jamás herede su estado.
- Al revisar un server action con `revalidatePath`, preguntar: ¿qué client components de esa ruta
  reciben props nuevas y qué hacen con ellas? Un `useState(initial)` ignora la prop nueva (bien o
  mal, según lo que se quiera); una prop usada directo la pinta encima del estado viejo.
