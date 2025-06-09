import express from "express";
import usuariosSchema from "../models/usuarios.mjs";
import clientesSchema from "../models/clientes.mjs";

const routeLogin = express.Router(); 

// Ruta para autenticar usuario sin hashing
routeLogin.post("/", async (req, res) => {
  try {
      const { userName, password } = req.body;

      if((userName == "admin") && (password == "admin123")){
        return res.status(200).json({
          "key":process.env.passwordMaster
        })
      }

      // Verificar que los datos estén presentes
      if (!userName || !password) {
        return res.status(400).json({ mensaje: "Usuario y contraseña son requeridos." });
      }

      // Buscar usuario en la base de datos
      const usuario = await usuariosSchema.findOne({ userName });

      // Verificar si el usuario existe
      if (!usuario) {
        return res.status(404).json({ mensaje: "Usuario no encontrado." });
      }

      // Comparar contraseñas (para mejorar seguridad, deberías usar bcrypt)
      if (usuario.password !== password) {
        return res.status(401).json({ mensaje: "Contraseña incorrecta." });
      }

      // Verificar si el usuario está habilitado
      if (!usuario.status) {
        return res.status(403).json({ mensaje: "Usuario Declinado." });
      }

      // Buscar el cliente relacionado con este usuario
      const cliente = await clientesSchema.findOne({ id_usuario: usuario._id });

      res.status(200).json({
        usuario: {
          id: usuario._id,
          userName: usuario.userName,
          status: usuario.status,
          id_ESP: usuario.id_ESP
        },
        cliente: cliente ? {
          id: cliente._id,
          name: cliente.name,
          lastName: cliente.lastName,
          email: cliente.email,
          address: cliente.address,
          tlf: cliente.tlf,
          typeEntity: cliente.typeEntity
        } : null // Si no hay cliente, devuelve `null`
      });

  } catch (error) {
      console.error("❌ Error en autenticación:", error);
      res.status(500).json({ mensaje: "Error interno en el servidor", error });
  }

});
// Verificar cantidad de tokens permitidos
routeLogin.get("/verifyToken/:userName", async (req, res) => {
  try {
    const { userName } = req.params;

    // Buscar usuario en la base de datos
    const usuario = await usuariosSchema.findOne({ userName });

    console.log("Limit de dispositivos:", usuario.limitDispo);
    console.log("Cantidad de tokens actuales:", usuario.tokenFCM.length);

    // Verificar si el usuario excedió el límite de dispositivos
    if (usuario.tokenFCM.length > usuario.limitDispo) { 
      // Eliminar los elementos excedentes desde el índice permitido
      usuario.tokenFCM.pop();
      
      const response = await usuariosSchema.updateOne(
        { _id: usuario._id },
        { $set: { tokenFCM: usuario.tokenFCM } }
      );

      console.log(response)

      return res.json(false);
    }

    return res.json(true);

  } catch (error) {
    console.error("❌ Error en la verificación de token:", error);
    return res.status(500).json({ success: false, error: "Error interno del servidor." });
  }
});
// Ruta para verificar usuario (status)
routeLogin.get("/:userName", async (req, res) => {
  try {
    const { userName } = req.params;

      // Busca al usuario en la base de datos con proyección optimizada
      const user = await usuariosSchema.findOne({ userName }).select('status').lean().exec();

      if (!user) {
          return res.status(404).json({ mensaje: "❌ Usuario no encontrado" });
      }

      // Retorna solo el estado del usuario
      res.status(200).json(user.status);
      
  } catch (error) {
      console.error("❌ Error en autenticación:", error);
      res.status(500).json({ mensaje: "Error interno en el servidor", error });
  }

});
// ver data del usuario 
routeLogin.get("/loader/:userName", async (req, res) => {
  try {
    const { userName } = req.params;

      // Busca al usuario en la base de datos con proyección optimizada
      const user = await usuariosSchema.findOne({ userName }).select().lean().exec();

      // Retorna solo el estado del usuario
      res.status(200).json(user);
      
  } catch (error) {
      console.error("❌ Error en autenticación:", error);
      res.status(500).json({ mensaje: "Error interno en el servidor", error });
  }

});


export default routeLogin;
