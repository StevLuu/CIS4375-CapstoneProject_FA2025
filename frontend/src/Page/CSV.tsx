// src/pages/CSV.tsx
import { useState } from "react";

export default function CSV() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setStatus("");
    }
  };

  const handleUpload = () => {
    if (!file) return setStatus("❌ Please select a CSV file first.");
    setStatus("⏳ Uploading...");
    // Simulate "processing" time
    setTimeout(() => {
      setStatus("✅ File validated successfully! 52 items imported.");
    }, 1500);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">CSV Import</h1>
      <p className="text-neutral-500">
        Upload inventory data exported from Etsy or Square (mock demo).
      </p>

      <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4 max-w-xl">
        <label className="block text-sm font-medium text-neutral-700">
          Select CSV file:
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block w-full text-sm text-neutral-600 border border-neutral-300 rounded-xl p-2 cursor-pointer hover:bg-neutral-50"
        />
        {file && (
          <p className="text-sm text-green-600">📄 {file.name} selected</p>
        )}

        <button
          onClick={handleUpload}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
        >
          Upload CSV
        </button>

        {status && (
          <p
            className={`text-sm ${
              status.startsWith("✅")
                ? "text-green-600"
                : status.startsWith("⏳")
                ? "text-yellow-600"
                : "text-red-600"
            }`}
          >
            {status}
          </p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-2">Example Preview</h2>
        <div className="bg-white border rounded-2xl p-4 text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-2">SKU</th>
                <th className="py-2 px-2">Item</th>
                <th className="py-2 px-2">Quantity</th>
                <th className="py-2 px-2">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-2">A001</td>
                <td className="py-2 px-2">Glitter Keychain</td>
                <td className="py-2 px-2">12</td>
                <td className="py-2 px-2">$5.00</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-2">A002</td>
                <td className="py-2 px-2">Sticker Pack</td>
                <td className="py-2 px-2">30</td>
                <td className="py-2 px-2">$3.50</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
