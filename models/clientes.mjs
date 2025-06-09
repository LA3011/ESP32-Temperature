import mongoose from "mongoose";

const clientesSchema = new mongoose.Schema({
  id_usuario: {
    type: String, 
    required: true
  },
  address: String,
  name: String,
  lastName: String,
  typeEntity: {
    type: String,
    required: true
  },
  createDate: {
    type: Date,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  tlf: {
    type: String,
    required: true
  },
  datails:{
    type: String,    
    required: true
  }
});

export default mongoose.model("clients", clientesSchema);
