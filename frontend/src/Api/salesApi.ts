import axios from "axios";

const API_BASE = "https://api.kumo-consulting-demo.com"; // placeholder

const mockSales = [
  { month: "Jun", sales: 2400 },
  { month: "Jul", sales: 3200 },
  { month: "Aug", sales: 2800 },
  { month: "Sep", sales: 4000 },
  { month: "Oct", sales: 4600 },
];

export async function getSales() {
  try {
    const response = await axios.get(`${API_BASE}/sales`);
    return response.data;
  } catch (error) {
    console.warn("Backend not available, using mock sales data.");
    return mockSales;
  }
}
