const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const authController = {};

authController.register = async (req, res) => {
  try {
    // S-02: solo se leen estos tres campos del cuerpo de la petición.
    // Antes también se leía "role", y eso permitía que cualquiera se registrara como
    // administrador enviando { "role": "admin" }. Ahora el rol nunca lo decide el cliente.
    const { name, email, password } = req.body;

    // codificar password
    const salt = await bcrypt.genSalt(10);
    const encryptedPassword = await bcrypt.hash(password, salt);

    // PASSWORD CODE VALIDATION
    if (password.length < 6 || password.length > 10) {
      return res.status(500).json({
        success: false,
        message: "Password is shorter than 6 characters",
      });
    }

    // S-02: aquí tampoco se incluye "role". Al omitirlo, Mongoose aplica el valor por defecto
    // definido en models/User.js ('user'), así que toda cuenta nueva es un usuario normal.
    // Para crear un administrador hay que cambiar el rol a mano en la base de datos (Atlas).
    const newUser = {
      name,
      email,
      password: encryptedPassword,
    };

    await User.create(newUser);

    return res.status(200).json({
      success: true,
      message: "Create user successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error creating user",
      error: error?.message || error,
    });
  }
};

authController.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    //Validación de lo que me llega por body
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Bad email",
      });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Bad password",
      });
    }

    const token = jwt.sign(
      { user_id: user._id, user_role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "10h" },
    );

    return res.status(200).json({
      success: true,
      message: "User Logged",
      token: token,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "User Login failed",
    });
  }
};

authController.profile = async (req, res) => {
  try {
    const userId = req.user_id;

    const user = await User.findById(userId).select(["-password", "-__v"]);

    return res.status(200).json({
      success: true,
      message: "User profile",
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "User profile failed",
      error: error?.message || error,
    });
  }
};

module.exports = authController;
