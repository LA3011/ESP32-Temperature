import express from "express";
import esp32Schema from "../models/esp32.mjs";
import notifys from "../models/notifys.mjs";
import usuariosSchema from "../models/usuarios.mjs";

const routeEsp32 = express.Router();

  // Ver todos los ESP32
  routeEsp32.get("/", async (req, res) => {
    try {
      const esp32 = await esp32Schema.find().lean();
      res.status(200).json(esp32);
    } catch (error) {
      res.status(500).json({ mensaje: "Error al obtener ESP32", error });
    }
  });

  // Ver todos los ESP32(s) -> Usuario(s) 
  routeEsp32.get("/usuarios", async (req, res) => {
try {
    const userToExclude = process.env.EXCLUDE_USER_ID;
    const esp32List = await esp32Schema.find().lean();
    const usuarios = await usuariosSchema.find({ _id: { $ne: userToExclude } }).lean();

    // console.log("Usuarios obtenidos:", usuarios); // ✅ Verificar usuarios
    // console.log("Lista de ESP32:", esp32List); // ✅ Verificar ESP32

    const esp32ConUsuarios = esp32List.map(esp => {
        const espIdStr = esp._id.toString();
        
        // ✅ Validación para evitar error con `map()`
        const usuarioRelacionado = usuarios.find(user => 
            user.id_ESP && Array.isArray(user.id_ESP) && user.id_ESP.map(id => id.toString()).includes(espIdStr)
        );

        const usuarioSinIdESP = usuarioRelacionado ? { ...usuarioRelacionado } : null;
        if (usuarioSinIdESP) {
            delete usuarioSinIdESP.id_ESP;
        }

        return {
            ...esp,
            usuario: usuarioSinIdESP
        };
    });

    res.status(200).json(esp32ConUsuarios);

} catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ mensaje: "Error al obtener ESP32 y sus usuarios", error });
}

  });

   // Ver todos los ESP32 -> Usuario
  routeEsp32.get("/usuario/:idUsuario", async (req, res) => {
   try {
        const { idUsuario } = req.params;

        // Buscar el usuario por su ID
        const usuario = await usuariosSchema.findById(idUsuario).lean();
        if (!usuario) {
            return res.status(404).json({ mensaje: "Usuario no encontrado" });
        }

        // Obtener todos los ESP32 vinculados a este usuario
        const esp32List = await esp32Schema.find({ _id: { $in: usuario.id_ESP } }).lean();

        // Estructurar la respuesta con los ESP32 asociados al usuario, excluyendo "id_ESP"
        const usuarioSinIdESP = { ...usuario };
        delete usuarioSinIdESP.id_ESP; // ❌ Se elimina "id_ESP"

        // Formar la estructura de salida
        const respuesta = esp32List.map(esp => ({
            ...esp,
            usuario: usuarioSinIdESP // Agregar usuario sin "id_ESP"
        }));

        res.status(200).json(respuesta);
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ mensaje: "Error al obtener ESP32 vinculados al usuario", error });
    }
  });

  // Ver un ESP32 por ID
  routeEsp32.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const esp32 = await esp32Schema.findById(id).lean();

      if (!esp32) {
        return res.status(404).json({ mensaje: "ESP32 no encontrado" });
      }

      res.status(200).json(esp32);
    } catch (error) {
      console.error("❌ Error al obtener ESP32:", error);
      res.status(500).json({ mensaje: "Error al obtener ESP32", error });
    }
  });

  // Crear nuevo ESP32
  routeEsp32.post("/", async (req, res) => {
    try {
      const { alarma, modelo, codigo, typeEquipmentAsigned, statusWifi, details, dateCreate } = req.body;

      // Validar datos obligatorios
      if ( !modelo || !alarma || !codigo || !typeEquipmentAsigned || statusWifi === undefined || !dateCreate) {
        return res.status(400).json({ mensaje: "Faltan datos obligatorios para crear el ESP32." });
      }

      // Crear instancia del nuevo ESP32
      const nuevoEsp32 = new esp32Schema({
        modelo,
        codigo,
        typeEquipmentAsigned,
        statusWifi,
        details,
        alarma,
        dateCreate: new Date(dateCreate)
      });

      // Guardar ESP32 en la base de datos
      const esp32Guardado = await nuevoEsp32.save();
      res.status(201).json( esp32Guardado );
      // Ejemplo de data
      // {
      //   "modelo": "ESP32-WROOM",
      //   "codigo": "PSE 001 - 25",
      //   "typeEquipmentAsigned": "Test",
      //   "statusWifi": true,
      //   "details": "Ninguno",
      //   "dateCreate": "2025-05-18T14:30:00.000Z"
      // }

    } catch (error) {
      res.status(500).json({ mensaje: "Error al crear ESP32", error });
    }
  });

  // Asociar ESP32 > Usuario
  routeEsp32.post("/agregar", async (req, res) => {
    try {
      const statusWifi = true
      const dateCreate = new Date();
      dateCreate.setHours(dateCreate.getHours() - 4); // ✅ Mantiene el tipo Date

      const { alarma, modelo, codigo, typeEquipmentAsigned, datailsESP32, id_usuario } = req.body;

      // Validar datos obligatorios
      if ( !alarma || !modelo || !codigo || !typeEquipmentAsigned) {
        return res.status(400).json({ mensaje: "Faltan datos obligatorios para crear el ESP32." });
      }

      // Crear instancia del nuevo ESP32
      const nuevoEsp32 = new esp32Schema({
        modelo,
        codigo,
        typeEquipmentAsigned,
        statusWifi,
        details: datailsESP32,
        alarma,
        dateCreate: new Date(dateCreate)
      });

      // Guardar ESP32 en la base de datos
      const esp32Guardado = await nuevoEsp32.save();

      const usuarioUpdate =  await usuariosSchema.updateOne(
        { _id: id_usuario }, // Encuentra el usuario por su ID
        { $push: { id_ESP: esp32Guardado._id } } // Agrega el nuevo ESP32 al array `id_ESP`
      );


      res.status(201).json( esp32Guardado );

    } catch (error) {
      res.status(500).json({ mensaje: "Error al crear ESP32", error });
    }
  });

  // Editar ESP32 por ID
  routeEsp32.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { alarma, id_User, modelo, codigo, typeEquipmentAsigned, statusWifi, details, dateCreate } = req.body;

      // Verificar si el ESP32 existe antes de actualizar
      const espExistente = await esp32Schema.findById(id);
      if (!espExistente) {
        return res.status(404).json({ mensaje: "ESP32 no encontrado" });
      }

      // Actualizar ESP32
      const esp32Actualizado = await esp32Schema.findByIdAndUpdate(
        id,
        { $set: { id_User, alarma, modelo, codigo, typeEquipmentAsigned, statusWifi, details, dateCreate: new Date(dateCreate) } },
        { new: true, runValidators: true }
      );
      res.status(200).json({ mensaje: "ESP32 actualizado correctamente", esp32: esp32Actualizado });
      // Ejemplo de data
      // {
      //   "id_User": "6829d413a0acf31007cd1826",
      //   "modelo": "ESP32-WROOM",
      //   "codigo": "PSE 000 - 00",
      //   "typeEquipmentAsigned": "Cava",
      //   "statusWifi": true,
      //   "details": "Ninguno",
      //   "dateCreate": "2025-05-18T14:30:00.000Z"
      // }

    } catch (error) {

      res.status(500).json({ mensaje: "Error al actualizar ESP32", error });
    }
  });

  // Eliminar ESP32 por ID
  routeEsp32.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar si el ESP32 existe antes de eliminar
      const espExistente = await esp32Schema.findById(id);
      if (!espExistente) {
        return res.status(404).json({ mensaje: "ESP32 no encontrado" });
      }

      // Eliminar ESP32
      await esp32Schema.findByIdAndDelete(id);

      // Eliminar Alertas Relacionadas
      await notifys.deleteMany(
        { id_ESP: { $in: id } } 
      );


      res.status(200).json({ mensaje: "ESP32 eliminado correctamente" });
    } catch (error) {
      res.status(500).json({ mensaje: "Error al eliminar ESP32", error });
    }
  });

export default routeEsp32;
