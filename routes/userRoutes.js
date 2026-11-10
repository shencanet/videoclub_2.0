
Userroutes · JS
const router = require('express').Router();
const userController = require('../controllers/UserController')
const isAdmin = require('../middlewares/isAdmin');
const verifyToken = require('../middlewares/verifyToken');
// S-03 / S-04: middleware nuevo que limita cada cuenta a su dueño o a un administrador
const isOwnerOrAdmin = require('../middlewares/isOwnerOrAdmin');
 
// Los middlewares se ejecutan en orden, de izquierda a derecha:
//   verifyToken   -> exige un token válido y deja req.user_id y req.user_role
//   isAdmin       -> solo deja pasar a administradores
//   isOwnerOrAdmin-> deja pasar al dueño de la cuenta o a un administrador
//   controlador   -> solo se ejecuta si todos los anteriores han dado permiso
 
// Listado de todos los usuarios: solo administradores
router.get('/users', verifyToken, isAdmin, userController.getAll);
 
// Ver, modificar y borrar una cuenta: solo su dueño o un administrador.
// Antes PUT y DELETE solo pedían estar identificado, así que cualquiera podía tocar cualquier cuenta.
router.get('/users/:id', verifyToken, isOwnerOrAdmin, userController.getUserById);
router.put('/users/:id', verifyToken, isOwnerOrAdmin, userController.update);
router.delete('/users/:id', verifyToken, isOwnerOrAdmin, userController.delete);
 
 
module.exports = router;
 