import express, { response } from "express"
import clientesSchema from "../models/clientes.mjs"
import usuariosSchema from "../models/usuarios.mjs"
import esp32Schema from "../models/esp32.mjs"

const routeClientes = express.Router()

// Ver Clientes-> Usuarios -> Dispositivos ESP32
routeClientes.get("/usuarios", async (req, res) => {
  try {
      // Obtener todos los clientes
      const clientes = await clientesSchema.find().lean();

      // Obtener los IDs de usuario únicos desde clientes
      const idsUsuarios = clientes.map(cliente => cliente.id_usuario);

      // Consultar los usuarios relacionados con todos sus datos
      const usuarios = await usuariosSchema.find({ _id: { $in: idsUsuarios } }).lean();

      // Obtener los dispositivos ESP32 con todos sus datos
      const dispositivosESP = await esp32Schema.find().lean();

      // ✅ Asociar cada usuario con sus dispositivos ESP32, solo dejando los `_id`
      const usuariosConDispositivos = usuarios.map(usuario => {
      const idESPArray = Array.isArray(usuario.id_ESP) ? usuario.id_ESP : []; // ✅ Si es undefined, asigna un array vacío
      const dispositivos = dispositivosESP
        .filter(esp => idESPArray.includes(esp._id.toString()))
        .map(esp => esp._id.toString());

      return {
        ...usuario,
        id_ESP: dispositivos
      };
    });


      // ✅ Asociar cada cliente con su usuario y los dispositivos ESP32
      const clientesConUsuariosYDispositivos = clientes.map(cliente => {
        const usuario = usuariosConDispositivos.find(user => user._id.toString() === cliente.id_usuario) || null;

        return {
          ...cliente,
          usuario
        };
      });

      res.status(200).json(clientesConUsuariosYDispositivos);
  } catch (error) {
      console.error("❌ Error al obtener clientes, usuarios y dispositivos ESP:", error);
      res.status(500).json({ mensaje: "Error al obtener clientes, usuarios y dispositivos ESP", error });
  }
});

// Crear Clientes + ESP32 + Usuario
routeClientes.post("/", async (req, res) => {
  try {      
      // Valores iniciales
      const createDate = new Date();
      createDate.setHours(createDate.getHours() - 4); // ✅ Mantiene el tipo Date
      const status = true; 
      const statusWifi = true;
      const rootPass = "";

      // Guardar ESP32 
      const { modelo, codigo, typeEquipmentAsigned, detailsEdetailsSP32, alarma  } = req.body;
      if (!modelo || !codigo || !typeEquipmentAsigned) {
        return res.status(400).json({ mensaje: "Faltan datos obligatorios para crear el ESP32." });
      }

      const nuevoEsp32 = new esp32Schema({
        modelo,
        codigo,
        typeEquipmentAsigned,
        statusWifi,
        details:detailsEdetailsSP32,
        alarma,
        dateCreate: createDate 
      });
      const esp32Guardado = await nuevoEsp32.save(); // ESP32 guardado con éxito

      // Guardar Usuario
      const { password, userName } = req.body;
      if (!password || !userName) {
        return res.status(400).json({ mensaje: "Faltan datos obligatorios para crear el usuario." });
      }
      const nuevoUsuario = new usuariosSchema({
        password,
        status,
        rootPass: "",
        userName,
        id_ESP: [esp32Guardado._id] 
      });
      const usuarioGuardado = await nuevoUsuario.save(); // Usuario guardado con ESP32 vinculado

      // Guardar el cliente
      const { address, name, lastName, typeEntity, email, tlf, datails} = req.body;
      if (!address || !name || !email || !lastName || !tlf) {
        return res.status(400).json({ mensaje: "Faltan datos obligatorios para crear el cliente." });
      }
      const nuevoCliente = new clientesSchema({
        id_usuario: usuarioGuardado._id, 
        address,
        name,
        lastName,
        typeEntity,
        tlf,
        createDate,
        email,
        datails
      });
      const clienteGuardado = await nuevoCliente.save(); // Cliente guardado correctamente

      res.status(201).json({ mensaje: "Usuario + Cliente + ESP32 creados correctamente" });

  } catch (error) {
    console.error("❌ Error:", error);
     res.status(500).json({ mensaje: "Error al crear cliente, usuario o ESP32", error });
  }
});

// Modificar Clientes + ESP32 + Usuario
routeClientes.put("/usuario/esp32", async (req, res) => {
try {
    const { usuario, cliente, esp32} = req.body;
    // Modificar usuario si `id_usuario` existe
    if (usuario?.id_usuario) {
        await usuariosSchema.updateOne({ _id: usuario.id_usuario }, { $set: usuario });
    }

    // Modificar cliente si `id_cliente` existe
    if (cliente?.id_cliente) {
        await clientesSchema.updateOne({ _id: cliente.id_cliente }, { $set: cliente });
    }

    // Modificar ESP32 si `id_esp32` existe
    if (esp32?.id_esp32) {
        await esp32Schema.updateOne({ _id: esp32.id_esp32 }, { $set: esp32 });
    }

    res.status(200).json(true);

} catch (error) {
    console.error("❌ Error al modificar documentos:", error);
    res.status(500).json({ mensaje: "Error al modificar documentos", error });
}

});

// Ver Clientes
routeClientes.get("/", async (req, res)=> {
  try {
    // Obtener todos los clientes
    const clientes = await clientesSchema.find().lean();
    res.status(200).json(clientes);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener clientes", error });
  }
});

// Ver Cliente
routeClientes.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Buscar cliente por su _id
    const cliente = await clientesSchema.findById(id).lean();
    // Validar si el cliente existe
    if (!cliente) {
      return res.status(404).json({ mensaje: "Cliente no encontrado" });
    }
    res.status(200).json(cliente);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener cliente", error });
  }
});

// Actualizar Usuario (Agregar Token)
routeClientes.put("/token", async (req, res) => {
  try {
    const { token, id_user } = req.body;

    if (!id_user || !token) {
      console.log("Falta id_user o token")
      return res.json({ mensaje: "Falta id_user o token" });
    }

    // Actualizar usuario sin duplicar el token
    const usuarioActualizado = await usuariosSchema.updateOne(
      { _id: id_user },
      { $addToSet: { tokenFCM: token } } // Agrega solo si no existe
    );

    if (usuarioActualizado.modifiedCount === 0) {
      console.log("Usuario no encontrado o token ya registrado")
      return res.status(404).json({ mensaje: "Usuario no encontrado o token ya registrado" });
    }

    res.status(200).json({ mensaje: "Token agregado correctamente" });

  } catch (error) {
    console.error("Error al actualizar tokens FCM:", error);
    res.status(500).json({ mensaje: "Error en el servidor TOKEN FCM", error });
  }
});

// Actualizar Cliente
routeClientes.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { id_usuario, address, name, lastName, typeEntity, createDate, email, tlf } = req.body;

    // Validar que al menos un dato sea proporcionado para la actualización
    if (!id_usuario && !address && !name && !lastName && !typeEntity && !createDate && !email && !tlf) {
      return res.status(400).json({ mensaje: "Se Debe proporcionar al menos un dato para actualizar el cliente." });
    }

    // Verificar si el cliente existe antes de actualizar
    const clienteExistente = await clientesSchema.findById(id);
    if (!clienteExistente) {
      return res.status(404).json({ mensaje: "Cliente no encontrado" });
    }

    // Actualizar cliente con los valores proporcionados
    const clienteActualizado = await clientesSchema.findByIdAndUpdate(
      id,
      { $set: { id_usuario, address, name, lastName, typeEntity, createDate: new Date(createDate), email, tlf } },
      { new: true, runValidators: true } // Retorna el documento actualizado y aplica validaciones del esquema
    );

    // ejemplo de datos
    // {
    //     "id_usuario": "6829d413a0acf31007cd1826",
    //     "address": "otro",
    //     "name": "Ejemplo",
    //     "lastName": "otro",
    //     "typeEntity": "otro",
    //     "createDate": "2025-06-01T12:30:00.000Z",
    //     "email": "ejemplo@gmail.com",
    //     "tlf": "0412-5555555"
    // }


    res.status(200).json("Cliente actualizado correctamente", clienteActualizado);

  } catch (error) {
    res.status(500).json({ mensaje: "Error al actualizar cliente", error });
  }
});

// Eliminar Cliente
routeClientes.delete("/:id", async (req, res) => {
try {
    const { id } = req.params;

    // Verificar si el cliente existe antes de eliminar
    const clienteExistente = await clientesSchema.findById(id);
    if (!clienteExistente) {
        return res.status(404).json({ mensaje: "Cliente no encontrado" });
    }

    // Obtener el id_usuario del cliente
    const { id_usuario } = clienteExistente;

    // Eliminar cliente de la base de datos
    await clientesSchema.findByIdAndDelete(id);

    // Verificar si hay un usuario asociado y eliminarlo
    if (id_usuario) {
        await usuariosSchema.findByIdAndDelete(id_usuario);
    }

    res.status(200).json();

} catch (error) {
    res.status(500).json({ mensaje: "Error al eliminar cliente y usuario", error });
}

});

// Buscar Cliente -> usuario -> ESP32
routeClientes.delete("/usuario/esp32/:idUsuario", async (req, res) => {
  try {
    const { idUsuario } = req.params;

    // ✅ Ejecutar consultas en paralelo: Usuario y Cliente
    const [usuario, cliente] = await Promise.all([
      usuariosSchema.findById(idUsuario).lean(),
      clientesSchema.findOne({ id_usuario: idUsuario }).lean(),
    ]);

    // ✅ Validaciones
    if (!usuario) {
      return res.status(404).json({ mensaje: "❌ Usuario no encontrado." });
    }
    if (!cliente) {
      return res.status(404).json({ mensaje: "❌ Cliente no encontrado." });
    }

    // ✅ Buscar los dispositivos ESP32 asociados al usuario
    const dispositivosESP = await esp32Schema.find({ _id: { $in: usuario.id_ESP ?? [] } }).lean();

    // ✅ Respuesta optimizada
    return res.status(200).json({ cliente, usuario, dispositivosESP });

  } catch (error) {
    console.error("❌ Error en la consulta:", error);
    return res.status(500).json({ mensaje: "❌ Error interno en el servidor", error });
  }
});


export default routeClientes