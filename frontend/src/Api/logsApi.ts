import axios from "axios";

const API_BASE = "https://api.kumo-consulting-demo.com"; // placeholder

const mockLogs = [
  {
    id: 1,
    time: "2025-10-06 14:32",
    type: "CSV Import",
    detail: "Etsy_Inventory_Oct.csv imported successfully (52 items).",
    status: "Success",
  },
  {
    id: 2,
    time: "2025-10-05 18:10",
    type: "Manual Update",
    detail: "Inventory adjusted: Enamel Pins +3",
    status: "Success",
  },
];

export async function getLogs() {
  try {
    const response = await axios.get(`${API_BASE}/logs`);
    return response.data;
  } catch (error) {
    console.warn("Backend not available, using mock logs.");
    return mockLogs;
  }
}
