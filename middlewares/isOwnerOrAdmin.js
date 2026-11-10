// S-03 / S-04: comprueba que quien hace la petición tiene derecho a actuar sobre ESA cuenta.
//
// Debe colocarse DESPUÉS de verifyToken, porque necesita los datos que este deja en la petición:
//   req.user_id   -> id del usuario que ha iniciado sesión (sale del token)
//   req.user_role -> rol de ese usuario ('user' o 'admin', también sale del token)
//   req.params.id -> id de la cuenta sobre la que se quiere actuar (viene en la URL: /users/:id)
//
// Regla: se permite el paso si el usuario es administrador o si la cuenta es la suya.
const isOwnerOrAdmin = (req, res, next) => {
    // Un administrador puede actuar sobre cualquier cuenta;
    // un usuario normal solo sobre la suya (su id coincide con el id de la URL).
    if (req.user_role === 'admin' || req.user_id === req.params.id) {
        return next(); // permiso concedido: se continúa hacia el controlador
    }
 
    // 403 = "estás identificado, pero no tienes permiso para esto".
    // (401 se reserva para cuando no hay sesión válida.)
    return res.status(403).json({
        success: false,
        message: 'Forbidden'
    });
};
 
module.exports = isOwnerOrAdmin;
 