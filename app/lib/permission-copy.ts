// Texto del aviso "sin permisos". Vive aparte de permissions.ts porque aquel
// importa la sesión (código de servidor) y este también lo usan componentes
// de cliente.
export const NO_PERMISSION_MESSAGE =
  'No tienes permisos para realizar esta acción. Pídeselo a un administrador.'
