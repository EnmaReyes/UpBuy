const bcrypt = require("bcryptjs");
const { Usuarios } = require("../DataBase/models/Usuarios.js");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config.js");
const { Op } = require("sequelize");

const TOKEN_EXPIRATION = "12h";
const COOKIE_MAX_AGE = 12 * 60 * 60 * 1000; // 12 horas

const isProduction = () => process.env.NODE_ENV === "production";

// Emite la sesion propia de ByGio (JWT en cookie httpOnly) y responde con el
// usuario sin la contrasena. Compartida por login tradicional y social.
const issueSession = (res, user) => {
  const token = jwt.sign({ id: user.id, admin: user.admin }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRATION,
  });

  const { password, gmailRefreshToken, ...userData } = user.toJSON();
  const production = isProduction();

  return res
    .cookie("access_token", token, {
      httpOnly: true,
      secure: production,
      sameSite: production ? "none" : "lax",
      maxAge: COOKIE_MAX_AGE,
    })
    .status(200)
    .json(userData);
};

const register = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    // Validacion minima de entrada (no confiar solo en el frontend)
    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !email.trim() ||
      password.length < 8
    ) {
      return res.status(400).json("Datos de registro invalidos");
    }

    const normalizedEmail = email.trim().toLowerCase();

    //? Verificar usuarios existentes (colision por email O por username)
    const existingUser = await Usuarios.findOne({
      where: {
        [Op.or]: [{ email: normalizedEmail }, { username: username.trim() }],
      },
    });

    if (existingUser) {
      return res.status(409).json("Usuario Existente");
    }

    //? Hash de contrasena y crear usuario
    const hash = await bcrypt.hash(password, 10);

    await Usuarios.create({
      email: normalizedEmail,
      username: username.trim(),
      password: hash,
    });
    return res.status(200).json("Usuario creado con éxito");
  } catch (error) {
    console.error("Error en el registro:", error.message);
    return res.status(500).json("Error en el servidor");
  }
};

const login = async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    // Sin esto, Sequelize recibe un WHERE con undefined y termina en un 500.
    if (!username || !password) {
      return res.status(400).json("Escribe tu usuario y contraseña");
    }

    const existingUser = await Usuarios.findOne({
      where: {
        username,
      },
    });

    if (!existingUser) {
      return res.status(404).json("Usuario no existente");
    }

    if (!existingUser.password) {
      return res
        .status(400)
        .json("Esta cuenta usa inicio de sesión social (Google/Facebook)");
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      existingUser.password
    );

    if (!isPasswordCorrect) {
      return res.status(400).json("Contraseña Errada");
    }

    return issueSession(res, existingUser);
  } catch (error) {
    console.error("Error en el login:", error.message);
    res.status(500).json("Error interno del servidor");
  }
};

// Devuelve el usuario autenticado a partir de la cookie (sin password).
// Usado por el frontend para refrescar los datos de sesion.
const me = async (req, res) => {
  try {
    const token = req.cookies.access_token;
    if (!token) {
      return res.status(401).json("No autenticado");
    }
    const userInfo = jwt.verify(token, JWT_SECRET);

    const user = await Usuarios.findByPk(userInfo.id, {
      attributes: { exclude: ["password", "gmailRefreshToken"] },
    });
    if (!user) {
      return res.status(404).json("Usuario no encontrado");
    }
    return res.status(200).json(user);
  } catch (error) {
    return res.status(401).json("Sesión inválida o expirada");
  }
};

const logout = async (req, res) => {
  try {
    const production = isProduction();
    res
      .clearCookie("access_token", {
        httpOnly: true,
        sameSite: production ? "none" : "lax",
        secure: production,
      })
      .status(204)
      .end();
  } catch (error) {
    res.status(500).json("Error interno del servidor");
  }
};

module.exports = {
  register,
  login,
  logout,
  me,
  issueSession,
};
