import axios from "axios";

// Simulated backend URL (replace later when ready)
const API_BASE = "https://api.kumo-consulting-demo.com"; // placeholder

// Mock data fallback
const mockInventory = [
  { sku: "A001", name: "Glitter Keychain", stock: 12, price: 5 },
  { sku: "A002", name: "Sticker Pack", stock: 30, price: 3.5 },
  { sku: "A003", name: "Acrylic Charm", stock: 8, price: 7 },
  { sku: "A004", name: "Print Set", stock: 15, price: 10 },
  { sku: "A005", name: "Enamel Pin", stock: 5, price: 9 },
];

export async function getInventory() {
  try {
    const response = await axios.get(`${API_BASE}/inventory`);
    return response.data;
  } catch (error) {
    console.warn("Backend not available, using mock data.");
    return mockInventory;
  }
}

export async function updateStock(sku: string, newStock: number) {
  try {
    const response = await axios.put(`${API_BASE}/inventory/${sku}`, { stock: newStock });
    return response.data;
  } catch (error) {
    console.error("Update failed, backend not available.");
    return { success: false };
  }
}
