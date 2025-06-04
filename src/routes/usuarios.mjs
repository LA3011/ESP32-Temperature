import express from "express";
import usuariosSchema from "../models/usuarios.mjs";

const routeUsuarios = express.Router();

// Obtener todos los usuarios
routeUsuarios.get("/", async (req, res) => {
  try {
    const usuarios = await usuariosSchema.find().lean();
    res.status(200).json(usuarios);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener usuarios", error });
  }
});

// Obtener un usuario por ID
routeUsuarios.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = await usuariosSchema.findById(id).lean();

    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    res.status(200).json(usuario);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener usuario", error });
  }
});

// Crear un usuario
routeUsuarios.post("/", async (req, res) => {
  try {
    const { password, status, rootPass, userName, id_ESP } = req.body;

    if (!password || status === undefined || !rootPass || !userName) {
      return res.status(400).json({ mensaje: "Faltan datos obligatorios para crear el usuario." });
    }

    const nuevoUsuario = new usuariosSchema({
      password,
      status,
      rootPass,
      userName,
      id_ESP: id_ESP || []
    });

    const usuarioGuardado = await nuevoUsuario.save();
    res.status(201).json({ mensaje: "Usuario creado correctamente", usuario: usuarioGuardado });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al crear usuario", error });
  }
});

// Editar un usuario por ID
routeUsuarios.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { password, status, rootPass, userName, id_ESP } = req.body;

    const usuarioExistente = await usuariosSchema.findById(id);
    if (!usuarioExistente) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    const usuarioActualizado = await usuariosSchema.findByIdAndUpdate(
      id,
      { $set: { password, status, rootPass, userName, id_ESP } },
      { new: true, runValidators: true }
    );
    res.status(200).json({ mensaje: "Usuario actualizado correctamente", usuario: usuarioActualizado });
    //ejemplo data
    // {
    //   "password": "segura123",
    //   "status": true,
    //   "rootPass": "ELIMINARRR",
    //   "userName": "jdoe",
    //   "id_ESP": [
    //     "6829da39a0acf31007cd183b",
    //     "6829da39a0acf31007cd184c"
    //   ]
    // }


  } catch (error) {
    res.status(500).json({ mensaje: "Error al actualizar usuario", error });
  }
});

// Eliminar (update) un ESP (usuario)
routeUsuarios.post("/ESP", async (req, res) => {
  try {
    const { id_esp,idUsuario } = req.body;

    // Buscar usuario y actualizar eliminando el `id_ESP` del array
    const resultado = await usuariosSchema.findByIdAndUpdate(
      idUsuario,
      { $pull: { id_ESP: id_esp } }, // 🔧 `$pull` elimina el valor del array
      { new: true }
    );

    if (!resultado) {
      res.json("❌ Usuario no encontrado.")
    }

    res.json(resultado)

  } catch (error) {
    res.json(` Error interno en el servidor: ${error}`);
  }
})

// Eliminar un usuario por ID
routeUsuarios.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const usuarioExistente = await usuariosSchema.findById(id);
    if (!usuarioExistente) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    await usuariosSchema.findByIdAndDelete(id);
    res.status(200).json({ mensaje: "Usuario eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al eliminar usuario", error });
  }
});


export default routeUsuarios;
