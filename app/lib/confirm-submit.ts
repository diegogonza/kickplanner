'use client'

/**
 * Para botones que son <form action={accionDeServidor}>: intercepta el envío,
 * pregunta (async) y recién si la respuesta es sí lo deja seguir.
 *
 * React no ejecuta la acción si `onSubmit` llamó a preventDefault; al confirmar
 * se reenvía con `requestSubmit()` marcado para no volver a preguntar.
 *
 * `shouldAsk(form)` permite saltear la pregunta (p. ej. reabrir una tarea).
 */
export function confirmBeforeSubmit(
  ask: () => Promise<boolean>,
  shouldAsk: (form: HTMLFormElement) => boolean = () => true
) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget
    if (form.dataset.confirmado === '1') {
      delete form.dataset.confirmado
      return
    }
    if (!shouldAsk(form)) return
    e.preventDefault()
    ask().then((ok) => {
      if (!ok) return
      form.dataset.confirmado = '1'
      form.requestSubmit()
    })
  }
}
