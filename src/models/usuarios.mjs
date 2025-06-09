import mongoose from "mongoose";

// Esquema de Usuarios con id_ESP como array de Strings
const usuariosSchema = new mongoose.Schema({
  password: {
    type: String,
    required: true
  },
  status: {
    type: Boolean,
    required: true
  },
  rootPass: {
    type: String,
    required: false
  },
  userName: {
    type: String,
    required: true
  },
  id_ESP: {
    type: [String], 
    default: [] 
  },
  tokenFCM:{
    type: [String], 
    default: ""
  },
    limitDispo:{
    type: Number, 
    default: 3
  }
});

// Exportando el modelo
export default mongoose.model("users", usuariosSchema);
