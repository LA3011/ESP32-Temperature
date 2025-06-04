import mongoose from "mongoose";

// Esquema de Clientes con relación a Usuarios
const clientesUsuariosSchema = new mongoose.Schema({
  id_usuario: {
    type: mongoose.Schema.Types.String, // Relacionado con la colección "users"
    ref: "users", // Nombre del modelo de usuarios
    required: true
  },
  nombreEmpresa: {
    type: String,
    required: true
  }
});

// Exportando el modelo basado en el esquema
export default mongoose.model("clients", clientesUsuariosSchema);
