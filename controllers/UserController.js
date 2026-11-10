const User = require("../models/User");

const userController = {};

userController.getAll = async (req, res) => {
  try {
    const users = await User.find();

    return res.status(200).json({
      success: true,
      message: "Get all users retrieved succsessfully",
      data: users,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error retrieving users",
      error: error.message,
    });
  }
};

userController.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select(["-password", "-__v"]);

    if (!user) {
      return res.status(404).json({
        success: true,
        message: "User not found",
        data: [],
      });
    }
    if (req.user_role == "admin") {
      return res.status(200).json({
        success: true,
        message: "User found",
        data: user,
      });
    }
    if (req.user_id !== id) {
      return res.status(404).json({
        success: true,
        message: "User not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "User found",
      data: user,
    });
  } catch (error) {
    if (error?.message.includes("Cast to ObjectId failed")) {
      return res.status(404).json({
        success: true,
        message: "User not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error finding user",
      error: error?.message || error,
    });
  }
};

// S-04: actualizar un usuario.
// Esta función solo se ejecuta si el middleware isOwnerOrAdmin ya ha comprobado que quien
// la llama es el dueño de la cuenta o un administrador (ver routes/userRoutes.js).
// Antes el cambio se guardaba primero y los permisos se miraban después, de modo que la
// modificación quedaba hecha aunque la respuesta dijera "not found".
userController.update = async (req, res) => {
  try {
    const { name } = req.body;

    // Validamos que el nombre sea un texto no vacío. Comprobar el tipo también impide
    // que se cuele un objeto (por ejemplo { "$ne": null }) en la consulta a la base de datos.
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "name is required",
      });
    }

    // Lista blanca: solo se puede cambiar el nombre. Aunque el cliente envíe "role",
    // "email" o "password" en el cuerpo, esos campos se ignoran.
    const update = { name: name.trim() };

    // Una sola operación: busca por id, aplica el cambio y devuelve el documento ya actualizado
    // ({ new: true }). select() excluye la contraseña cifrada y el campo interno __v.
    const userUpdated = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
    }).select(["-password", "-__v"]);

    // El id tiene formato válido pero no existe ningún usuario con él
    if (!userUpdated) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User Update",
      data: userUpdated,
    });
  } catch (error) {
    // El id de la URL no tiene formato de ObjectId (no son 24 caracteres hexadecimales)
    if (error?.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Cualquier otro fallo: el detalle se guarda en el log del servidor
    // y al cliente solo se le devuelve un mensaje genérico (no se filtran datos internos).
    console.error("Error updating user:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating user",
    });
  }
};

// S-03: borrar un usuario.
// Igual que update, solo se ejecuta tras pasar por isOwnerOrAdmin: un usuario puede borrar
// su propia cuenta y un administrador puede borrar cualquiera, pero nadie más.
// Antes cualquier usuario con sesión podía borrar la cuenta de otro.
userController.delete = async (req, res) => {
  try {
    // Busca y borra en una sola operación. Devuelve el usuario borrado (sin la contraseña)
    // o null si no existía.
    const userDeleted = await User.findByIdAndDelete(req.params.id).select([
      "-password",
      "-__v",
    ]);

    // Si no había ningún usuario con ese id, se avisa en lugar de responder "borrado" en falso
    if (!userDeleted) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delete user sucessfully",
      data: userDeleted,
    });
  } catch (error) {
    // Id con formato inválido
    if (error?.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.error("Error deleting user:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting user",
    });
  }
};

module.exports = userController;
